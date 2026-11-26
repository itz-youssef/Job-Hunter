'use strict';
/**
 * Secret J personalized source monitor — separate from All Jobs detection.
 *
 * Native Lever query support is opt-in per verified public board. For providers
 * without verified server-side filters we use the existing complete public job
 * snapshot as an explicitly labeled fallback, never claim employer-side filters.
 *
 * Baselines, preferences and delivery states remain private in Neon.
 */
const {createHash}=require('node:crypto');
const core=require('./core');
const {send}=require('../../api/secretj-email');
const prefs=require('../../dist/assets/secretj-job-preferences');
const matchCache=require('./preference-cache');
const career=require('../../dist/assets/secretj-career-level');
const qualification=require('./three-stage-qualification');
const semantics=require('./company-semantics');

const MAX_NATIVE_BOARDS=15;
const MAX_POSTINGS_PER_BOARD=2000;
const MAX_EMAILS=15;
const MAX_JOBS_PER_EMAIL=20;
// Bound each request by both account count and encoded payload size.
const MAX_BATCH_USERS=40, MAX_BATCH_BYTES=900000;
const TIMEOUT_MS=10000;
const SHA=value=>createHash('sha256').update(String(value)).digest('hex');
const validHttps=url=>{try{let u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const stamp=x=>Number.isFinite(Date.parse(x||''))?Date.parse(x):0;
const safeJob=j=>({
  title:String(j.title||'').slice(0,220),
  company:String(j.company||'').slice(0,180),
  location:String(j.location||'').slice(0,180),
  description:String(j.description||'').slice(0,500),
  url:validHttps(j.url||j.apply_url||''),
  published_at:String(j.published_at||j.published||'').slice(0,64),
  employment:String(j.employment||'').slice(0,80),
  seniority:String(j.seniority||'').slice(0,90),
  department:String(j.department||j.source_facets?.department||j.source_facets?.team||'').slice(0,180),
  requirements:String(j.requirements||'').slice(0,1800),
  source_detail_status:String(j.source_detail_status||'unknown').slice(0,40),
  source_filter_proof:String(j.source_filter_proof||'catalog-fallback').slice(0,45),
  source_catalog_stale:j.source_catalog_stale===true,
  qualification_status:String(j.qualification_status||'review').slice(0,20),
  qualification_mode:String(j.qualification_mode||'unverified').slice(0,32),
  qualification_model:String(j.qualification_model||'').slice(0,90),
  qualification_reason:String(j.qualification_reason||'').slice(0,200),
  qualification_preference_signature:String(j.qualification_preference_signature||'').slice(0,64),
  qualification_matcher_fingerprint:String(j.qualification_matcher_fingerprint||'').slice(0,64)
});
function signature(p){
  const record={egypt_only:p.egypt_only===true,internships:p.internships===true,
    max_experience_years:p.max_experience_years??null,
    role_families:[...(p.role_families||[])].sort(),
    career_levels:[...(p.career_levels||[])].sort()};
  return SHA(JSON.stringify(record));
}
function publicBoardSlug(entry,kind,host){
  if(entry.source_kind!==kind)return '';
  const url=validHttps(entry.source_url);
  const m=url.match(new RegExp('^https://'+host.replace(/[.]/g,'\\.')+'/([A-Za-z0-9_-]+)(?:[/?#]|$)','i'));
  return m?.[1]||'';
}
function leverSlug(entry){
  if(entry.source_kind!=='lever')return '';
  const url=validHttps(entry.source_url);
  const m=url.match(/^https:\/\/jobs\.lever\.co\/([A-Za-z0-9_-]+)(?:[/?#]|$)/i);
  return m?.[1]||'';
}
async function jsonGet(url,fetchImpl){
  const response=await fetchImpl(url,{headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(TIMEOUT_MS)});
  if(!response.ok)throw Error('Official source returned HTTP '+response.status);
  return response.json();
}
async function leverBoard(entry,fetchImpl){
  const slug=leverSlug(entry);
  if(!slug)throw Error('Unsupported Lever source URL');
  const items=[];
  let complete=false;
  for(let offset=0;offset<MAX_POSTINGS_PER_BOARD;offset+=100){
    const url='https://api.lever.co/v0/postings/'+encodeURIComponent(slug)+
      '?mode=json&limit=100&skip='+offset;
    const batch=await jsonGet(url,fetchImpl);
    if(!Array.isArray(batch))throw Error('Unexpected official Lever response');
    for(const x of batch){
      if(!x||typeof x!=='object')continue;
      const c=x.categories||{};
      const href=validHttps(x.hostedUrl||x.applyUrl||'');
      if(!href||!x.text)continue;
      items.push({
        title:x.text,company:entry.name,location:c.location||'',
        department:c.department||c.team||'',
        url:href,description:x.descriptionPlain||x.description||'',
        employment:c.commitment||'',seniority:x.level||'',
        published_at:x.createdAt&&Number.isFinite(Date.parse(x.createdAt))?new Date(x.createdAt).toISOString():'',
        source_facets:{team:c.team||'',department:c.department||'',
          level:x.level||'',location:c.location||'',commitment:c.commitment||''},
        source_filter_proof:'employer-public-board'
      });
    }
    if(batch.length<100){complete=true;break;}
  }
  if(!complete)throw Error('Lever board exceeds verified pagination cap');
  return items;
}
function supportedLevelFacets(jobs,preference){
  const selected=preference.career_levels||[];
  const facets=new Set();
  if(!selected.length)return [];
  for(const j of jobs){
    const level=String(j.source_facets?.level||'').trim();
    if(!level)continue;
    const classified=career.evaluate({title:level});
    if(classified.level&&selected.includes(classified.level))facets.add(level);
  }
  return [...facets].slice(0,8);
}
/** Actual company-side ?level= query with exact employer-supplied facet value.
 * It is evidence; not the only dataset. Unlabeled opportunities are preserved
 * from the unfiltered official board so native filtering cannot lose recall.
 */
function supportedNativeFacets(jobs,preference){
  const result=new Map();
  for(const j of jobs){
    const facet=j.source_facets||{};
    const selected=preference.career_levels||[];
    const level=String(facet.level||'').trim();
    if(level&&selected.includes(career.evaluate({title:level}).level))
      result.set('level:'+level,{parameter:'level',value:level});
    const fields=preference.role_families||[];
    for(const parameter of ['team','department']){
      const value=String(facet[parameter]||'').trim();
      if(value&&fields.length&&prefs.classify({title:value}).some(k=>fields.includes(k)))
        result.set(parameter+':'+value,{parameter,value});
    }
    const commitment=String(facet.commitment||'').trim();
    if(commitment&&selected.includes('internship')&&/\b(?:intern|internship|trainee|apprentice)\b/i.test(commitment))
      result.set('commitment:'+commitment,{parameter:'commitment',value:commitment});
  }
  return [...result.values()].slice(0,16);
}
async function leverFacetProof(entry,facet,fetchImpl){
  const slug=leverSlug(entry);
  if(!slug)throw Error('Invalid Lever board');
  const parameter=facet.parameter||'level';
  if(!['level','team','department','commitment'].includes(parameter))throw Error('Unsupported native facet');
  const url='https://api.lever.co/v0/postings/'+encodeURIComponent(slug)+
    '?mode=json&'+parameter+'='+encodeURIComponent(facet.value)+'&limit=100';
  const rows=await jsonGet(url,fetchImpl);
  if(!Array.isArray(rows))throw Error('Invalid native filter response');
  return new Set(rows.map(x=>validHttps(x.hostedUrl||x.applyUrl||'')).filter(Boolean));
}
async function ashbyBoard(entry,fetchImpl){
  const slug=publicBoardSlug(entry,'ashby','jobs.ashbyhq.com');
  if(!slug)throw Error('Unsupported Ashby source');
  const response=await jsonGet('https://api.ashbyhq.com/posting-api/job-board/'+encodeURIComponent(slug),fetchImpl);
  if(!Array.isArray(response.jobs))throw Error('Unexpected Ashby job board');
  if(response.jobs.length>MAX_POSTINGS_PER_BOARD)throw Error('Ashby board exceeds safe scan cap');
  return response.jobs.filter(j=>j?.isListed!==false&&j.title).map(j=>({
    company:entry.name,title:j.title,location:j.location||'',
    department:j.department||j.team||'',
    url:validHttps(j.jobUrl||j.applyUrl||''),
    description:j.descriptionPlain||j.descriptionHtml||'',
    employment:j.employmentType||'',published_at:j.publishedAt||'',
    source_facets:{department:j.department||'',team:j.team||'',
      employment_type:j.employmentType||'',location:j.location||''},
    source_filter_proof:'employer-public-board'
  })).filter(x=>x.url);
}
async function workableBoard(entry,fetchImpl){
  const slug=publicBoardSlug(entry,'workable','apply.workable.com');
  if(!slug)throw Error('Unsupported Workable source');
  const response=await jsonGet('https://apply.workable.com/api/v1/widget/accounts/'+
    encodeURIComponent(slug)+'?details=true',fetchImpl);
  if(!Array.isArray(response.jobs))throw Error('Unexpected Workable widget feed');
  if(response.jobs.length>MAX_POSTINGS_PER_BOARD)throw Error('Workable board exceeds safe scan cap');
  return response.jobs.filter(x=>x?.title).map(x=>{
    const loc=x.location||{};
    const location=typeof loc==='string'?loc:
      [loc.city,loc.region,loc.country].filter(Boolean).join(', ');
    const short=String(x.shortcode||'').trim();
    const url=validHttps(x.url||x.job_url||
      (short?'https://apply.workable.com/'+slug+'/j/'+encodeURIComponent(short)+'/':''));
    return {title:x.title,company:entry.name,location,
      department:x.department||x.category||'',
      url,description:[x.description,x.requirements].filter(Boolean).join(' '),
      published_at:x.published_at||x.published_on||'',
      employment:x.employment_type||'',seniority:x.experience||'',
      source_facets:{employment_type:x.employment_type||'',location},
      source_filter_proof:'employer-public-board'};
  }).filter(x=>x.url);
}
async function loadAssets(env,fetchImpl=fetch){
  const base='https://jobhunter-youssef.example/';
  const [registryResponse,snapshotResponse]=await Promise.all([
    env.ASSETS.fetch(new Request(base+'native-source-registry.json')),
    env.ASSETS.fetch(new Request(base+'data.json'))
  ]);
  if(!registryResponse.ok||!snapshotResponse.ok)throw Error('Public data assets unavailable');
  const [registry,localSnapshot]=await Promise.all([registryResponse.json(),snapshotResponse.json()]);
  let snapshot=localSnapshot;
  // Public scanner commits must not wait for a website redeployment.
  // Only the production worker uses this fixed public source; tests and
  // local deployments keep using their injected assets.
  if(env.SECRETJ_LIVE_CATALOG==='true'){
    try{
      const response=await fetchImpl('https://raw.githubusercontent.com/itz-youssef/Job-Hunter/main/dist/data.json',
        {headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(5000)});
      if(response.ok){
        const live=await response.json();
        if(Array.isArray(live.jobs)&&stamp(live.generated_at)>stamp(snapshot.generated_at))snapshot=live;
      }
    }catch{/* Deployed assets remain the fallback. */}
  }
  if(!Array.isArray(registry.companies)||!Array.isArray(snapshot.jobs))
    throw Error('Invalid published registry or snapshot');
  return {registry,snapshot};
}
async function gather(env,fetchImpl=fetch,options={}){
  const {registry,snapshot}=await loadAssets(env,fetchImpl);
  // Stale snapshots are NOT treated as fresh source checks.
  const fresh=stamp(snapshot.generated_at)>Date.now()-4*3600000;
  // Staleness must not erase otherwise discoverable jobs from the personal
  // feed when the scheduled source exporter has stopped refreshing. Keep
  // display candidates, but do not generate NEW email alerts from stale data.
  const fallback=snapshot.jobs.filter(x=>x&&typeof x==='object').map(x=>({...x,
    source_filter_proof:fresh?'catalog-fallback':'catalog-stale',
    source_catalog_stale:!fresh}));
  const official=new Map();
  const failures=[];
  const sources=registry.companies.filter(e=>
    leverSlug(e)||publicBoardSlug(e,'ashby','jobs.ashbyhq.com')||
    publicBoardSlug(e,'workable','apply.workable.com'));
  // Source-specific live ATS reads; these are distinct from the discovery scan.
  // Immediate user-triggered scans have a shorter Worker waitUntil budget.
  // Run more independent employer API calls concurrently in that mode.
  const batchSize=options.immediate===true?12:4;
  // Immediate requests must fit the short waitUntil budget. The periodic
  // scanner independently checks all supported native boards.
  const deadline=Date.now()+(options.immediate===true?12000:45000);
  const boundedFetch=(url,opts={})=>{
    const remaining=deadline-Date.now();
    if(remaining<=0)return Promise.reject(Error('Source scan budget exhausted'));
    return fetchImpl(url,{...opts,signal:AbortSignal.timeout(Math.max(1,Math.min(TIMEOUT_MS,remaining)))});
  };
  for(let offset=0;offset<sources.length;offset+=batchSize){
    const group=sources.slice(offset,offset+batchSize);
    const result=await Promise.allSettled(group.map(e=>
      leverSlug(e)?leverBoard(e,boundedFetch):
      e.source_kind==='ashby'?ashbyBoard(e,boundedFetch):workableBoard(e,boundedFetch)));
    result.forEach((r,i)=>{
      if(r.status==='fulfilled')official.set(group[i].name,r.value);
      else failures.push(group[i].name);
    });
  }
  const combined=new Map();
  for(const j of fallback){
    const key=validHttps(j.url||j.apply_url||'');
    if(key)combined.set(key,j);
  }
  for(const list of official.values())for(const j of list){
    const key=validHttps(j.url);
    if(!key)continue;
    const previous=combined.get(key);
    // API summaries can be shorter than a previously enriched detail page.
    // Preserve richer source evidence rather than losing required-years text.
    combined.set(key,previous&&String(previous.description||'').length>String(j.description||'').length?
      {...previous,source_filter_proof:j.source_filter_proof,
        source_catalog_stale:false,source_facets:j.source_facets,
        seniority:j.seniority||previous.seniority}:
      {...j,source_catalog_stale:false});
  }
  return {jobs:[...combined.values()],official,registry,failures,snapshotFresh:fresh};
}
async function subscriptions(){
  return core.query(
    `SELECT u.id,u.email,p.egypt_only,p.internships,p.role_families,
            p.max_experience_years,p.career_levels,p.updated_at::text AS preferences_updated_at,
            COALESCE(v.recipient_email,u.email) AS alert_email,
            (p.email_alerts=true AND v.verified_at IS NOT NULL
              AND lower(COALESCE(v.verified_email,u.email))=lower(COALESCE(v.recipient_email,u.email))
            ) AS email_eligible
       FROM public.sj_users u
       JOIN public.sj_preferences p ON p.user_id=u.id
       LEFT JOIN public.sj_email_verifications v ON v.user_id=u.id
      WHERE u.is_active=true
      ORDER BY p.updated_at DESC`
  );
}
function matching(jobs,p){
  // A saved preference profile with all filters cleared means browse every
  // discovered opportunity, not an unexplained empty personal feed.
  if(!prefs.hasFilters(p))return jobs.filter(j=>validHttps(j.url||j.apply_url));
  return jobs.filter(j=>validHttps(j.url||j.apply_url)&&prefs.isMatch(j,p));
}
// Same qualification evidence and snapshot format for immediate and periodic scans.
function watchPayload(signatureValue,jobs){
 const result=new Map();
 for(const item of jobs.filter(j=>j.qualification_status==='accepted').map(j=>({
    key:validHttps(j.url||j.apply_url),
    job:safeJob({...j,qualification_preference_signature:signatureValue,
      qualification_matcher_fingerprint:matchCache.fingerprint})
  }))
    .filter(j=>j.key&&j.key.length<=500))result.set(item.key,item);
 return [...result.values()];
}
// One atomic statement per bounded group. Preferences are rechecked and locked
// against concurrent saves. State only advances if all matching rows are written.
// The existing sent/pending/baseline transitions are deliberately unchanged.
async function reserveBatch(batch){
 if(!batch.length)return [];
 return core.query(`WITH input AS (
   SELECT * FROM jsonb_to_recordset($1::jsonb) AS i(user_id uuid,signature text,preference_time timestamptz,jobs jsonb)
 ), eligible AS MATERIALIZED (
   SELECT i.*,w.preference_signature AS old_signature
   FROM input i JOIN public.sj_preferences p ON p.user_id=i.user_id
   JOIN public.sj_users u ON u.id=i.user_id AND u.is_active=true
   LEFT JOIN public.sj_native_watch_state w ON w.user_id=i.user_id
   WHERE i.preference_time IS NULL OR p.updated_at=i.preference_time
   ORDER BY i.user_id FOR SHARE OF p,u
 ), written AS (
   INSERT INTO public.sj_native_watch_jobs AS existing(user_id,job_key,job_snapshot,status)
   SELECT e.user_id,x.key,x.job,
     CASE WHEN e.old_signature IS NULL OR e.old_signature<>e.signature THEN 'baseline' ELSE 'pending' END
   FROM eligible e CROSS JOIN LATERAL jsonb_to_recordset(e.jobs) AS x(key text,job jsonb)
   ORDER BY e.user_id,x.key
   ON CONFLICT(user_id,job_key) DO UPDATE SET
     job_snapshot=CASE WHEN EXCLUDED.job_snapshot->>'source_catalog_stale'='true'
       AND existing.job_snapshot->>'source_catalog_stale'='false'
       AND existing.job_snapshot->>'qualification_preference_signature'=EXCLUDED.job_snapshot->>'qualification_preference_signature'
       THEN existing.job_snapshot ELSE EXCLUDED.job_snapshot END,
     status=CASE WHEN existing.status='sent' THEN 'sent'
       WHEN existing.job_snapshot->>'qualification_mode' IS DISTINCT FROM 'dictionary-title-v1' THEN 'baseline'
       ELSE existing.status END
   WHERE existing.job_snapshot IS DISTINCT FROM EXCLUDED.job_snapshot
      OR (existing.status<>'sent' AND existing.job_snapshot->>'qualification_mode' IS DISTINCT FROM 'dictionary-title-v1')
   RETURNING user_id
 )
 INSERT INTO public.sj_native_watch_state(user_id,preference_signature)
 SELECT e.user_id,e.signature FROM eligible e
 CROSS JOIN (SELECT count(*) FROM written) completed
 ORDER BY e.user_id
 ON CONFLICT(user_id) DO UPDATE SET preference_signature=EXCLUDED.preference_signature,updated_at=now()
 RETURNING user_id`,[JSON.stringify(batch)]);
}
async function reservePeriodic(users,jobs){
 let batch=[],bytes=2,processed=0,failed=0;
 const flushBatch=async()=>{
  if(!batch.length)return;
  const current=batch;batch=[];bytes=2;
  try{const result=await reserveBatch(current);processed+=result.length;failed+=current.length-result.length;}
  catch(error){failed+=current.length;console.warn('secretj-monitor-batch-error',{code:String(error?.code||'query_failed').slice(0,30),accounts:current.length});}
 };
 for(const user of users){
  try{
   const selected=matching(jobs,user);
   const verified=await qualifyJobs(selected,user);
   const sig=signature(user);
   const row={user_id:user.id,signature:sig,preference_time:user.preferences_updated_at||null,jobs:watchPayload(sig,verified.accepted)};
   const size=Buffer.byteLength(JSON.stringify(row),'utf8')+1;
   if(size>MAX_BATCH_BYTES){
    await flushBatch();
    // Very broad individual feeds retain the existing 150-job chunking path.
    await reserveNew(user,sig,verified.accepted);processed++;continue;
   }
   if(batch.length>=MAX_BATCH_USERS||bytes+size>MAX_BATCH_BYTES)await flushBatch();
   batch.push(row);bytes+=size;
  }catch(error){failed++;console.warn('secretj-monitor-account-error',{code:String(error?.code||'query_failed').slice(0,30)});}
 }
 await flushBatch();return {processed,failed};
}
async function reserveNew(user,signatureValue,jobs){
  // Persistent, account-scoped initial baseline: never email pre-existing jobs.
  const existing=await core.query(
    'SELECT preference_signature FROM public.sj_native_watch_state WHERE user_id=$1',[user.id]);
  const initial=!existing.length;
  const changed=!initial&&existing[0].preference_signature!==signatureValue;
  // Preserve sent history and previously queued matches across preference
  // changes. Current-signature validation gates delivery; newly visible
  // pre-existing jobs are still baselined on a preference change.
  const preferenceTime=user.preferences_updated_at||null;
  // Stamp only candidates accepted by this EXACT saved preference signature.
  // The API may reuse these rows without running dictionary matching again.
  const payload=watchPayload(signatureValue,jobs);
  // Batch inserts avoid large Neon payloads. Mark baseline initialized ONLY
  // after every batch succeeds. Failed initial scans can be safely retried.
  for(let offset=0;offset<payload.length;offset+=150){
    await core.query(
      `INSERT INTO public.sj_native_watch_jobs(user_id,job_key,job_snapshot,status)
       SELECT $1,x.key,x.job,
         CASE WHEN $3='baseline' THEN 'baseline' ELSE 'pending' END
       FROM jsonb_to_recordset($2::jsonb) AS x(key text,job jsonb)
       WHERE $4::timestamptz IS NULL OR EXISTS(
         SELECT 1 FROM public.sj_preferences p WHERE p.user_id=$1 AND p.updated_at=$4::timestamptz)
       ON CONFLICT(user_id,job_key) DO UPDATE SET
         job_snapshot=CASE WHEN EXCLUDED.job_snapshot->>'source_catalog_stale'='true'
           AND public.sj_native_watch_jobs.job_snapshot->>'source_catalog_stale'='false'
           AND public.sj_native_watch_jobs.job_snapshot->>'qualification_preference_signature'=
               EXCLUDED.job_snapshot->>'qualification_preference_signature'
           THEN public.sj_native_watch_jobs.job_snapshot ELSE EXCLUDED.job_snapshot END,
         status=CASE
           WHEN public.sj_native_watch_jobs.status='sent' THEN 'sent'
           WHEN public.sj_native_watch_jobs.job_snapshot->>'qualification_mode'
              IS DISTINCT FROM 'dictionary-title-v1' THEN 'baseline'
           ELSE public.sj_native_watch_jobs.status END`,
      [user.id,JSON.stringify(payload.slice(offset,offset+150)),
       initial||changed?'baseline':'pending',preferenceTime]);
  }
  if(initial){
    await core.query(
      `INSERT INTO public.sj_native_watch_state(user_id,preference_signature)
       SELECT $1,$2 WHERE $3::timestamptz IS NULL OR EXISTS(
         SELECT 1 FROM public.sj_preferences p WHERE p.user_id=$1 AND p.updated_at=$3::timestamptz)
       ON CONFLICT DO NOTHING`,[user.id,signatureValue,preferenceTime]);
  }else{
    await core.query(
      `UPDATE public.sj_native_watch_state SET preference_signature=$2,updated_at=now()
       WHERE user_id=$1 AND ($3::timestamptz IS NULL OR EXISTS(
         SELECT 1 FROM public.sj_preferences p WHERE p.user_id=$1 AND p.updated_at=$3::timestamptz))`,
      [user.id,signatureValue,preferenceTime]);
  }
  return {initial,changed};
}
async function flush(user,sendImpl,credentials){
  const rows=await core.query(
    `WITH claimed AS (
       SELECT user_id,job_key FROM public.sj_native_watch_jobs
        WHERE user_id=$1 AND status IN ('pending','failed')
          AND job_snapshot->>'qualification_status'='accepted'
          AND job_snapshot->>'source_catalog_stale' IS DISTINCT FROM 'true'
          AND job_snapshot->>'qualification_preference_signature'=$2
          AND EXISTS(
            SELECT 1 FROM public.sj_native_watch_state w
            JOIN public.sj_preferences p ON p.user_id=w.user_id
            JOIN public.sj_users u ON u.id=w.user_id
            JOIN public.sj_email_verifications v ON v.user_id=w.user_id
            WHERE w.user_id=$1 AND w.preference_signature=$2 AND w.updated_at>=p.updated_at
              AND u.is_active=true AND p.email_alerts=true AND v.verified_at IS NOT NULL
              AND lower(COALESCE(v.verified_email,u.email))=lower(COALESCE(v.recipient_email,u.email))
              AND lower(COALESCE(v.recipient_email,u.email))=lower($3))
          AND (attempted_at IS NULL OR attempted_at < now()-interval '10 minutes')
        ORDER BY discovered_at ASC,job_key ASC LIMIT ${MAX_JOBS_PER_EMAIL}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.sj_native_watch_jobs AS queue
      SET attempted_at=now(),status='pending'
      FROM claimed
      WHERE queue.user_id=claimed.user_id AND queue.job_key=claimed.job_key
      RETURNING queue.job_key,queue.job_snapshot`,
      [user.id,signature(user),user.alert_email||user.email]);
  if(!rows.length)return null;
  const body=rows.map(r=>{
    const j=r.job_snapshot||{};
    return (j.title||'Role')+' at '+(j.company||'Employer')+
      (j.source_filter_proof==='employer-native-filter'?' [Official company filter]':' [Requirements matched; verify details]')+
      '\n'+(j.url||'');
  }).join('\n\n');
  try{
    const idempotencyKey='native-alert-'+SHA(user.id+'|'+(user.alert_email||user.email)+'|'+rows.map(r=>r.job_key).sort().join('\n'));
    await sendImpl(user.alert_email||user.email,'Secret J: New jobs matching your preferences',
      'New opportunities detected by your personalized job monitor:\n\n'+body+
      '\n\nManage alerts under Secret J > Preferences.',{...credentials,IDEMPOTENCY_KEY:idempotencyKey});
    await core.query(
      `UPDATE public.sj_native_watch_jobs SET status='sent',sent_at=now()
       WHERE user_id=$1 AND job_key=ANY($2::text[]) AND status='pending'`,
      [user.id,rows.map(r=>r.job_key)]);
    return true;
  }catch(error){
    console.warn('secretj-alert-delivery-failed',{providerStatus:Number(error?.providerStatus)||null});
    await core.query(
      `UPDATE public.sj_native_watch_jobs SET status='failed'
        WHERE user_id=$1 AND job_key=ANY($2::text[]) AND status='pending'`,
      [user.id,rows.map(r=>r.job_key)]).catch(()=>{});
    return false;
  }
}
/**
 * Immediate single-member scan, called only from an authenticated POST after
 * preferences are saved. The general all-jobs detection is untouched.
 * This scan establishes the existing-opportunity baseline and NEVER sends
 * email. Periodic subscriber monitoring alone dispatches new-job alerts.
 */
async function qualifyJobs(jobs,p){
  // Deterministic title dictionary is the sole decision engine.
  // No network model calls, AI cache queries, or AI-enforced abstention.
  const accepted=[];let rejected=0;
  for(const job of jobs){
    const result=prefs.assess(job,p);
    if(!result.match){rejected++;continue;}
    accepted.push({...job,qualification_status:'accepted',
      qualification_mode:'dictionary-title-v1',
      qualification_reason:(result.evidence||[]).join('; ').slice(0,200)||'Title dictionary and preferences matched'});
  }
  return {accepted,rejected,needsReview:0,aiCalls:0,strictAI:false};
}
async function scanOneUser(env,userId,fetchImpl=fetch){
  if((env.SECRETJ_NATIVE_MONITOR_ENABLED??process.env.SECRETJ_NATIVE_MONITOR_ENABLED)!=='true')
    return {status:'disabled'};
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(userId||'')))
    throw Error('Invalid subscriber identity');
  const rows=await core.query(
    `SELECT p.user_id AS id,p.egypt_only,p.internships,p.role_families,
            p.max_experience_years,p.career_levels,p.updated_at::text AS preferences_updated_at
       FROM public.sj_preferences p JOIN public.sj_users u ON u.id=p.user_id
      WHERE u.id=$1 AND u.is_active=true LIMIT 1`,[userId]);
  if(!rows.length)return {status:'no_preferences'};
  const gathered=await gather(env,fetchImpl,{immediate:true});
  // If no official sources returned jobs and no fresh fallback is available,
  // do not mark an empty/incomplete source check as successful.
  if(!gathered.jobs.length)return {status:'no_source_data',failedSources:gathered.failures.length};
  // Reload preferences after network I/O, so a concurrent second save is
  // never incorrectly marked synchronized using an earlier preference set.
  const latest=await core.query(
    `SELECT p.user_id AS id,p.egypt_only,p.internships,p.role_families,
            p.max_experience_years,p.career_levels,p.updated_at::text AS preferences_updated_at
       FROM public.sj_preferences p WHERE p.user_id=$1 LIMIT 1`,[userId]);
  if(!latest.length)return {status:'no_preferences'};
  const selected=matching(gathered.jobs,latest[0]);
  const verified=await qualifyJobs(selected,latest[0],env,fetchImpl);
  await reserveNew(latest[0],signature(latest[0]),verified.accepted);
  return {status:'processed',matches:verified.accepted.length,needsReview:verified.needsReview,
    nativeBoards:gathered.official.size,failedSources:gathered.failures.length,
    snapshotFresh:gathered.snapshotFresh};
}
function mailConfiguration(env){
  const mailEnv={RESEND_API_KEY:env.RESEND_API_KEY||process.env.RESEND_API_KEY,
    SECRETJ_EMAIL_FROM:env.SECRETJ_EMAIL_FROM||process.env.SECRETJ_EMAIL_FROM,
    STRICT_AI_VERIFICATION:false};
  const mailReady=(env.SECRETJ_ALERTS_ENABLED??process.env.SECRETJ_ALERTS_ENABLED)==='true'
    &&Boolean(mailEnv.RESEND_API_KEY&&mailEnv.SECRETJ_EMAIL_FROM);
  return {mailEnv,mailReady};
}
// Durable outbox draining is independent of source fetches and runs on its
// own cron minutes. A source failure must never block already queued mail.
async function deliverQueued(env,sendImpl=send,knownUsers){
  const {mailEnv,mailReady}=mailConfiguration(env);
  if(!mailReady)return {status:'mail_unavailable',sent:0,failed:0,mailReady};
  const users=knownUsers||await subscriptions();
  const eligible=new Map(users.filter(u=>u.email_eligible===true&&prefs.hasFilters(u)).map(u=>[u.id,u]));
  if(!eligible.size)return {status:'no_eligible_subscribers',sent:0,failed:0,mailReady};
  const priority=await core.query(
    `SELECT user_id FROM public.sj_native_watch_jobs
       WHERE user_id=ANY($1::uuid[]) AND status IN ('pending','failed')
         AND job_snapshot->>'qualification_status'='accepted'
         AND job_snapshot->>'source_catalog_stale' IS DISTINCT FROM 'true'
         AND EXISTS(SELECT 1 FROM public.sj_native_watch_state w
           JOIN public.sj_preferences p ON p.user_id=w.user_id
           WHERE w.user_id=sj_native_watch_jobs.user_id AND w.updated_at>=p.updated_at
             AND w.preference_signature=sj_native_watch_jobs.job_snapshot->>'qualification_preference_signature')
         AND (attempted_at IS NULL OR attempted_at < now()-interval '10 minutes')
       GROUP BY user_id ORDER BY MIN(discovered_at) ASC LIMIT ${MAX_EMAILS}`,
    [[...eligible.keys()]]);
  let sent=0,failed=0;
  for(const row of priority){
    const user=eligible.get(row.user_id);
    if(!user)continue;
    try{
      const result=await flush(user,sendImpl,mailEnv);
      if(result===true)sent++;
      else if(result===false)failed++;
    }catch(error){failed++;console.warn('secretj-alert-queue-error',{code:String(error?.code||'query_failed').slice(0,30)});}
  }
  return {status:'processed',sent,failed,mailReady};
}
async function deliver(env,sendImpl=send,fetchImpl=fetch){
  if((env.SECRETJ_NATIVE_MONITOR_ENABLED??process.env.SECRETJ_NATIVE_MONITOR_ENABLED)!=='true')return {status:'disabled'};
  const users=await subscriptions();
  if(!users.length)return {status:'no_subscribers'};
  // Drain before any expensive external calls. Standalone cron minutes
  // continue draining even if this scan is interrupted by runtime limits.
  const before=await deliverQueued(env,sendImpl,users).catch(()=>({sent:0,failed:1}));
  const result=await gather(env,fetchImpl);
  if(!result.jobs.length)return {status:'no_source_data',failedSources:result.failures.length,...before,status:'no_source_data'};
  const batchResult=await reservePeriodic(users,result.jobs);
  const processed=batchResult.processed,failed=(before.failed||0)+batchResult.failed;
  // If there was no backlog at entry, opportunistically send new matches.
  // The independent minute cron guarantees subsequent queue retries.
  const after=before.sent||before.failed?{sent:0,failed:0}:await deliverQueued(env,sendImpl,users).catch(()=>({sent:0,failed:1}));
  return {status:'processed',processed,sent:(before.sent||0)+(after.sent||0),failed:failed+(after.failed||0),failedSources:result.failures.length,
    nativeBoards:result.official.size,snapshotFresh:result.snapshotFresh,mailReady:mailConfiguration(env).mailReady};
}
module.exports={deliver,deliverQueued,leverSlug,leverBoard,ashbyBoard,workableBoard,leverFacetProof,supportedLevelFacets,supportedNativeFacets,
  gather,matching,signature,reserveNew,reserveBatch,reservePeriodic,flush,scanOneUser,qualifyJobs};
