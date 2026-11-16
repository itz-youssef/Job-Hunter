'use strict';
/** Private subscriber-only status; no cross-account access or exposed preferences. */
const core=require('../lib/secretj/core');
const qualification=require('../lib/secretj/three-stage-qualification');
function createHandler(env=process.env){return async function handler(req,res){
 try{
  core.allowedMethod(req,['GET']);
  const user=await core.requireUser(req);
  const action=String(req.query?.action||'status');
  if(!['status','feed'].includes(action))throw core.fail(404,'Unknown monitoring action');
  const state=await core.query(
    `SELECT w.initialized_at,w.updated_at,
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
    const offset=Number(req.query?.offset??0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>100000)
      throw core.fail(400,'Invalid feed offset');
    const limit=250;
    const rows=await core.query(
      `SELECT job_key,job_snapshot,status,discovered_at,sent_at
       FROM public.sj_native_watch_jobs
       WHERE user_id=$1
       ORDER BY discovered_at DESC,job_key ASC LIMIT $2 OFFSET $3`,
      [user.id,limit+1,offset]);
    // Rollout compatibility: legacy records predate the unified validator.
    // Until the scheduled monitor safely backfills qualification provenance,
    // re-check them on the SERVER using today's stored preferences; do not
    // blindly expose old jobs, and never bypass strict AI mode.
    const legacy=rows.some(row=>!row.job_snapshot?.qualification_status);
    let preference=null;
    if(legacy&&env.SECRETJ_AI_VERIFICATION_ENABLED!=='true'){
      const ps=await core.query(
        `SELECT egypt_only,internships,role_families,career_levels,
                max_experience_years FROM public.sj_preferences WHERE user_id=$1`,
        [user.id]);
      preference=ps[0]||null;
    }
    const page=rows.slice(0,limit).filter(row=>{
      const item=row.job_snapshot||{};
      if(item.qualification_status==='accepted')return (
        env.SECRETJ_AI_VERIFICATION_ENABLED!=='true'||
        item.qualification_mode==='ai-reviewed'
      );
      return !item.qualification_status&&preference!==null&&
        qualification.reject(item,preference).ok;
    }).map(row=>({
      ...(row.job_snapshot||{}),
      qualification_mode:row.job_snapshot?.qualification_mode||
        'legacy-rules-only',
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
    note:'Only native-query supported sources use employer API filters. Other sources rely on explicit fallback classification.'});
 }catch(error){return core.safeError(res,error);}
};}
module.exports=createHandler();
module.exports.createHandler=createHandler;
