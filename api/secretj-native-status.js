'use strict';
/** Private subscriber-only status; no cross-account access or exposed preferences. */
const core=require('../lib/secretj/core');
const prefs=require('../dist/assets/secretj-job-preferences');
const matchCache=require('../lib/secretj/preference-cache');
const isolated=require('../lib/secretj/isolated-read-routing');
const catalog=require('../lib/secretj/dictionary-catalog');
// Read watch readiness and its ordered page in one PostgreSQL snapshot.
// The left joins keep one sentinel row for an absent state or an empty page.
const CORE_FEED_SQL=`WITH feed_state AS MATERIALIZED (
 SELECT w.initialized_at,w.updated_at,w.preference_signature,
   (w.updated_at>=p.updated_at) AS preferences_current
 FROM public.sj_native_watch_state w JOIN public.sj_preferences p ON p.user_id=w.user_id
 WHERE w.user_id=$1
)
SELECT s.initialized_at,s.updated_at,s.preference_signature,s.preferences_current,
 j.job_key,j.job_snapshot,j.status,j.discovered_at,j.sent_at
FROM (SELECT 1) marker LEFT JOIN feed_state s ON true
LEFT JOIN LATERAL (
 SELECT job_key,job_snapshot,status,discovered_at,sent_at
 FROM public.sj_native_watch_jobs
 WHERE user_id=$1 AND s.preferences_current IS TRUE
 ORDER BY discovered_at DESC,job_key ASC LIMIT $2 OFFSET $3
) j ON true
ORDER BY j.discovered_at DESC,j.job_key ASC`;
// Use one consistent core snapshot for readiness and authoritative digests.
const ISOLATED_FEED_SQL=CORE_FEED_SQL
 .replace('j.job_key,j.job_snapshot,j.status','j.job_key,j.record_digest,j.status')
 .replace('SELECT job_key,job_snapshot,status,discovered_at,sent_at\n FROM public.sj_native_watch_jobs',
  "SELECT w.job_key,encode(sha256(convert_to(to_jsonb(w)::text,'UTF8')),'hex') AS record_digest,w.status,w.discovered_at,w.sent_at\n FROM public.sj_native_watch_jobs w");
const SHARED_KEYS="ARRAY['qualification_status','qualification_mode','qualification_model','qualification_reason','qualification_preference_signature','qualification_matcher_fingerprint']";
const PRIMARY_FEED_SQL=CORE_FEED_SQL
 .replace('j.job_key,j.job_snapshot,j.status','j.job_key,j.payload_digest,j.qualifiers,j.status')
 .replace('SELECT job_key,job_snapshot,status,discovered_at,sent_at\n FROM public.sj_native_watch_jobs',
  "SELECT w.job_key,encode(sha256(convert_to((w.job_snapshot-"+SHARED_KEYS+")::text,'UTF8')),'hex') AS payload_digest, "+
  "(SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(w.job_snapshot) WHERE key=ANY("+SHARED_KEYS+")) AS qualifiers,w.status,w.discovered_at,w.sent_at\n FROM public.sj_native_watch_jobs w");
function createHandler(env=process.env){return async function handler(req,res){
 try{
  core.allowedMethod(req,['GET']);
  const user=await core.requireUser(req);
  const action=String(req.query?.action||'status');
  if(!['status','feed'].includes(action))throw core.fail(404,'Unknown monitoring action');
  const offset=action==='feed'?Number(req.query?.offset??0):0;
  const validOffset=Number.isSafeInteger(offset)&&offset>=0&&offset<=100000;
  const limit=250;
  if(action==='feed'&&!validOffset)throw core.fail(400,'Invalid feed offset');
  if(action==='feed'&&env.SECRETJ_NATIVE_MONITOR_ENABLED==='true'){
    const ps=await core.query('SELECT egypt_only,internships,role_families,career_levels,max_experience_years FROM public.sj_preferences WHERE user_id=$1',[user.id]);
    if(ps.length){
      const shared=await catalog.read(env,ps[0]);
      if(shared){
        const matched=shared.jobs.filter(j=>prefs.assessPrepared(j,ps[0],shared.factsByJob.get(j)).match);
        matched.sort((a,b)=>String(b.published_at||'').localeCompare(String(a.published_at||''))||String(a.url).localeCompare(String(b.url)));
        return core.reply(res,200,{ok:true,ready:true,jobs:matched.slice(offset,offset+limit).map(j=>({...j,id:j.url,qualification_status:'accepted',qualification_mode:'dictionary-title-v1'})),next_offset:matched.length>offset+limit?offset+limit:null,matching_source:'shared-dictionary'});
      }
    }
  }
  const isolatedReads=action==='feed'&&isolated.enabled('jobHunter',env);
  const primary=isolatedReads&&isolated.primaryPayloadsEnabled('jobHunter',env);
  const combined=action==='feed'&&validOffset;
  const params=[user.id,limit+1,offset];
  let state=combined?await core.query(primary?PRIMARY_FEED_SQL:isolatedReads?ISOLATED_FEED_SQL:CORE_FEED_SQL,params):await core.query(
    `SELECT w.initialized_at,w.updated_at,w.preference_signature,
       (w.updated_at>=p.updated_at) AS preferences_current
       FROM public.sj_native_watch_state w
       JOIN public.sj_preferences p ON p.user_id=w.user_id
       WHERE w.user_id=$1`,[user.id]);
  // The private matching feed reads the exact same durable records as the
  // notification queue. Baselines are visible even though not emailed.
  if(action==='feed'){
    const ready=state.length>0&&state[0].preferences_current===true;
    if(!ready)return core.reply(res,200,{ok:true,ready:false,jobs:[],
      next_offset:null,message:'Waiting for first source monitoring pass with current preferences'});
    if(!validOffset)throw core.fail(400,'Invalid feed offset');
    let rows=state.filter(row=>row.job_key!==null);
    if(isolatedReads){
      rows=primary?await isolated.primaryJobSnapshots(env,rows):await isolated.jobSnapshots(env,user.id,rows);
      // Re-read readiness and the entire page atomically on any mismatch,
      // timeout or partial mirror result. Never mix versions or expose a page
      // from preferences that changed during the remote request.
      if(rows===null){
        state=await core.query(CORE_FEED_SQL,params);
        if(state[0]?.preferences_current!==true)return core.reply(res,200,{ok:true,ready:false,jobs:[],
          next_offset:null,message:'Waiting for first source monitoring pass with current preferences'});
        rows=state.filter(row=>row.job_key!==null);
      }
    }
    // Fast path: records matched by the current saved preferences and exact
    // dictionary implementation are already validated in Neon. Reusing them
    // avoids an additional preferences query and per-job classification.
    // Old/unstamped rows continue through the original matcher unchanged.
    const signature=state[0].preference_signature;
    const slice=rows.slice(0,limit);
    const allVerified=slice.every(row=>
      matchCache.verified(row.job_snapshot,signature));
    let preference=null;
    if(!allVerified){
      const ps=await core.query(
        `SELECT egypt_only,internships,role_families,career_levels,
                max_experience_years FROM public.sj_preferences WHERE user_id=$1`,
        [user.id]);
      preference=ps[0]||null;
    }
    const page=slice.filter(row=>{
      const item=row.job_snapshot||{};
      return matchCache.shouldDisplay(item,signature,preference);
    }).map(row=>({
      ...(row.job_snapshot||{}),
      qualification_mode:row.job_snapshot?.qualification_mode||
        'dictionary-title-v1',
      id:row.job_key,
      watch_status:row.status,
      discovered_at:row.discovered_at,
      notified_at:row.sent_at
    }));
    return core.reply(res,200,{ok:true,ready:true,jobs:page,
      next_offset:rows.length>limit?offset+limit:null});
  }
  const scanRows=await core.query(
    `SELECT CASE
        WHEN status='running' AND started_at<now()-interval '2 minutes'
          THEN 'timed_out' ELSE status END AS status,
        started_at,completed_at
       FROM public.sj_native_scan_requests WHERE user_id=$1 LIMIT 1`,[user.id]);
  const counters=await core.query(
    `SELECT status,count(*)::int AS count FROM public.sj_native_watch_jobs
      WHERE user_id=$1 GROUP BY status`,[user.id]);
  const counts={baseline:0,pending:0,sent:0,failed:0};
  for(const row of counters)if(Object.hasOwn(counts,row.status))counts[row.status]=Number(row.count)||0;
  return core.reply(res,200,{ok:true,monitor:'company-native-first',
    configured:state.length>0,initialized_at:state[0]?.initialized_at||null,
    last_preference_reset_at:state[0]?.updated_at||null,counts,
    immediate_scan:scanRows[0]||null,
    note:'Personalized feed uses deterministic title dictionary plus explicit preference intersection; employer APIs remain the discovery source.'});
 }catch(error){return core.safeError(res,error);}
};}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.CORE_FEED_SQL=CORE_FEED_SQL;
module.exports.ISOLATED_FEED_SQL=ISOLATED_FEED_SQL;
module.exports.PRIMARY_FEED_SQL=PRIMARY_FEED_SQL;
