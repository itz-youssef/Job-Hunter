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
const career=require('../../dist/assets/secretj-career-level');
const qualification=require('./three-stage-qualification');

const MAX_NATIVE_BOARDS=15;
const MAX_POSTINGS_PER_BOARD=2000;
const MAX_EMAILS=15;
const MAX_JOBS_PER_EMAIL=5;
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
  source_filter_proof:String(j.source_filter_proof||'catalog-fallback').slice(0,45),
  qualification_status:String(j.qualification_status||'review').slice(0,20),
  qualification_mode:String(j.qualification_mode||'unverified').slice(0,32),
  qualification_reason:String(j.qualification_reason||'').slice(0,200)
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
      url,description:[x.description,x.requirements].filter(Boolean).join(' '),
      published_at:x.published_at||x.published_on||'',
      employment:x.employment_type||'',seniority:x.experience||'',
      source_facets:{employment_type:x.employment_type||'',location},
      source_filter_proof:'employer-public-board'};
  }).filter(x=>x.url);
}
async function loadAssets(env){
  const base='https://jobhunter-youssef.example/';
  const [registryResponse,snapshotResponse]=await Promise.all([
    env.ASSETS.fetch(new Request(base+'native-source-registry.json')),
    env.ASSETS.fetch(new Request(base+'data.json'))
  ]);
  if(!registryResponse.ok||!snapshotResponse.ok)throw Error('Public data assets unavailable');
  const [registry,snapshot]=await Promise.all([registryResponse.json(),snapshotResponse.json()]);
  if(!Array.isArray(registry.companies)||!Array.isArray(snapshot.jobs))
    throw Error('Invalid published registry or snapshot');
  return {registry,snapshot};
}
async function gather(env,fetchImpl=fetch,options={}){
  const {registry,snapshot}=await loadAssets(env);
  // Stale snapshots are NOT treated as fresh source checks.
  const fresh=stamp(snapshot.generated_at)>Date.now()-4*3600000;
  const fallback=fresh?snapshot.jobs.filter(x=>x&&typeof x==='object').map(x=>({...x,
    source_filter_proof:'catalog-fallback'})):[];
  const official=new Map();
  const failures=[];
  const sources=registry.companies.filter(e=>
    leverSlug(e)||publicBoardSlug(e,'ashby','jobs.ashbyhq.com')||
    publicBoardSlug(e,'workable','apply.workable.com'));
  // Source-specific live ATS reads; these are distinct from the discovery scan.
  // Immediate user-triggered scans have a shorter Worker waitUntil budget.
  // Run more independent employer API calls concurrently in that mode.
  const batchSize=options.immediate===true?12:4;
  for(let offset=0;offset<sources.length;offset+=batchSize){
    const group=sources.slice(offset,offset+batchSize);
    const result=await Promise.allSettled(group.map(e=>
      leverSlug(e)?leverBoard(e,fetchImpl):
      e.source_kind==='ashby'?ashbyBoard(e,fetchImpl):workableBoard(e,fetchImpl)));
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
        source_facets:j.source_facets,seniority:j.seniority||previous.seniority}:j);
  }
  return {jobs:[...combined.values()],official,registry,failures,snapshotFresh:fresh};
}
async function subscriptions(){
  return core.query(
    `SELECT u.id,u.email,p.egypt_only,p.internships,p.role_families,
            p.max_experience_years,p.career_levels,
            (p.email_alerts=true AND v.verified_at IS NOT NULL
              AND lower(COALESCE(v.verified_email,v.recipient_email,u.email))=lower(u.email)
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
async function reserveNew(user,signatureValue,jobs){
  // Persistent, account-scoped initial baseline: never email pre-existing jobs.
  const existing=await core.query(
    'SELECT preference_signature FROM public.sj_native_watch_state WHERE user_id=$1',[user.id]);
  const initial=!existing.length;
  const changed=!initial&&existing[0].preference_signature!==signatureValue;
  if(changed){
    // An account's old matches must disappear from its personal feed when
    // preferences change. A fresh scan creates a new no-email baseline.
    await core.query('DELETE FROM public.sj_native_watch_jobs WHERE user_id=$1',[user.id]);
  }
  const payload=jobs.filter(j=>j.qualification_status==='accepted').map(j=>({key:validHttps(j.url||j.apply_url),job:safeJob(j)}))
    .filter(j=>j.key&&j.key.length<=500);
  // Batch inserts avoid large Neon payloads. Mark baseline initialized ONLY
  // after every batch succeeds. Failed initial scans can be safely retried.
  for(let offset=0;offset<payload.length;offset+=150){
    await core.query(
      `INSERT INTO public.sj_native_watch_jobs(user_id,job_key,job_snapshot,status)
       SELECT $1,x.key,x.job,$3
       FROM jsonb_to_recordset($2::jsonb) AS x(key text,job jsonb)
       ON CONFLICT(user_id,job_key) DO UPDATE
       SET job_snapshot=EXCLUDED.job_snapshot`,
      [user.id,JSON.stringify(payload.slice(offset,offset+150)),
       initial||changed?'baseline':'pending']);
  }
  if(initial){
    await core.query(
      'INSERT INTO public.sj_native_watch_state(user_id,preference_signature) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [user.id,signatureValue]);
  }else if(changed){
    await core.query(
      `UPDATE public.sj_native_watch_state SET preference_signature=$2,
       updated_at=now() WHERE user_id=$1`,[user.id,signatureValue]);
  }else{
    // Saving notification settings without changing matching fields still
    // advances preferences.updated_at. Revalidate the watch without
    // clearing existing matches or producing spurious email alerts.
    await core.query(
      'UPDATE public.sj_native_watch_state SET updated_at=now() WHERE user_id=$1',
      [user.id]);
  }
  // Purge legacy or newly rejected records so an old, unverified job cannot
  // leak into either a personalized feed or the email dispatch queue.
  await core.query(`DELETE FROM public.sj_native_watch_jobs
     WHERE user_id=$1 AND job_snapshot->>'qualification_status' IS DISTINCT FROM 'accepted'`,[user.id]);
  return {initial,changed};
}
async function flush(user,sendImpl,credentials){
  const rows=await core.query(
    `WITH claimed AS (
       SELECT user_id,job_key FROM public.sj_native_watch_jobs
        WHERE user_id=$1 AND status IN ('pending','failed')
          AND job_snapshot->>'qualification_status'='accepted'
          AND (attempted_at IS NULL OR attempted_at < now()-interval '10 minutes')
        ORDER BY discovered_at ASC LIMIT ${MAX_JOBS_PER_EMAIL}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE public.sj_native_watch_jobs AS queue
      SET attempted_at=now(),status='pending'
      FROM claimed
      WHERE queue.user_id=claimed.user_id AND queue.job_key=claimed.job_key
      RETURNING queue.job_key,queue.job_snapshot`,[user.id]);
  if(!rows.length)return false;
  const body=rows.map(r=>{
    const j=r.job_snapshot||{};
    return (j.title||'Role')+' at '+(j.company||'Employer')+
      (j.source_filter_proof==='employer-native-filter'?' [Official company filter]':' [Requirements matched; verify details]')+
      '\n'+(j.url||'');
  }).join('\n\n');
  try{
    await sendImpl(user.email,'Secret J: New jobs matching your preferences',
      'New opportunities detected by your personalized job monitor:\n\n'+body+
      '\n\nManage alerts under Secret J > Preferences.',credentials);
    await core.query(
      `UPDATE public.sj_native_watch_jobs SET status='sent',sent_at=now()
       WHERE user_id=$1 AND job_key=ANY($2::text[]) AND status='pending'`,
      [user.id,rows.map(r=>r.job_key)]);
    return true;
  }catch{
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
async function qualifyJobs(jobs,p,env,fetchImpl=fetch){
  const strictAI=env.SECRETJ_AI_VERIFICATION_ENABLED==='true';
  const accepted=[],candidates=[];
  let rejected=0,needsReview=0,aiCalls=0;
  for(const j of jobs){
    const rules=qualification.reject(j,p);
    if(!rules.ok){rejected++;continue;}
    if(!strictAI){
      accepted.push({...j,qualification_status:'accepted',
        qualification_mode:'rules-only',qualification_reason:rules.reason});
    }else{
      const fingerprint=SHA(JSON.stringify({
        preferences:signature(p),title:j.title,company:j.company,url:j.url||j.apply_url,
        description:j.description||'',requirements:j.requirements||'',
        seniority:j.seniority||j.career_level||''
      }));
      candidates.push({job:j,fingerprint});
    }
  }
  if(!strictAI)return {accepted,rejected,needsReview,aiCalls,strictAI};
  const cache=new Map();
  for(let i=0;i<candidates.length;i+=300){
    const rows=await core.query(
      `SELECT fingerprint,status,reason FROM public.sj_ai_qualification_cache
       WHERE fingerprint=ANY($1::text[])`,
      [candidates.slice(i,i+300).map(x=>x.fingerprint)]);
    for(const row of rows)cache.set(row.fingerprint,row);
  }
  const pending=[];
  for(const item of candidates){
    const previous=cache.get(item.fingerprint);
    if(previous){
      if(previous.status==='accepted')accepted.push({...item.job,
        qualification_status:'accepted',qualification_mode:'ai-reviewed',
        qualification_reason:previous.reason});
      else rejected++;
    }else pending.push(item);
  }
  const max=Math.max(0,Math.min(20,Number(env.SECRETJ_AI_MAX_PER_RUN||12)));
  // At most 4 real model requests concurrently; no fabricated verdict when
  // a provider is unavailable or the review budget is exhausted.
  for(let offset=0;offset<Math.min(pending.length,max);offset+=4){
    const batch=pending.slice(offset,Math.min(offset+4,max));
    const results=await Promise.all(batch.map(x=>qualification.aiReview(x.job,p,env,fetchImpl)));
    for(let n=0;n<batch.length;n++){
      const item=batch[n],assessment=results[n];
      aiCalls++;
      if(assessment.status==='accepted'||assessment.status==='rejected'){
        await core.query(
          `INSERT INTO public.sj_ai_qualification_cache(fingerprint,status,confidence,reason)
           VALUES($1,$2,$3,$4)
           ON CONFLICT(fingerprint) DO UPDATE SET
            status=EXCLUDED.status,confidence=EXCLUDED.confidence,
            reason=EXCLUDED.reason,evaluated_at=now()`,
          [item.fingerprint,assessment.status,assessment.confidence,
            String(assessment.reason||'').slice(0,400)]);
        if(assessment.status==='accepted')accepted.push({...item.job,
          qualification_status:'accepted',qualification_mode:'ai-reviewed',
          qualification_reason:assessment.reason});
        else rejected++;
      }else needsReview++;
    }
  }
  needsReview+=Math.max(0,pending.length-max);
  return {accepted,rejected,needsReview,aiCalls,strictAI};
}
async function scanOneUser(env,userId,fetchImpl=fetch){
  if((env.SECRETJ_NATIVE_MONITOR_ENABLED??process.env.SECRETJ_NATIVE_MONITOR_ENABLED)!=='true')
    return {status:'disabled'};
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(userId||'')))
    throw Error('Invalid subscriber identity');
  const rows=await core.query(
    `SELECT p.user_id AS id,p.egypt_only,p.internships,p.role_families,
            p.max_experience_years,p.career_levels
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
            p.max_experience_years,p.career_levels
       FROM public.sj_preferences p WHERE p.user_id=$1 LIMIT 1`,[userId]);
  if(!latest.length)return {status:'no_preferences'};
  const selected=matching(gathered.jobs,latest[0]);
  const verified=await qualifyJobs(selected,latest[0],env,fetchImpl);
  await reserveNew(latest[0],signature(latest[0]),verified.accepted);
  return {status:'processed',matches:verified.accepted.length,needsReview:verified.needsReview,
    nativeBoards:gathered.official.size,failedSources:gathered.failures.length,
    snapshotFresh:gathered.snapshotFresh};
}
async function deliver(env,sendImpl=send,fetchImpl=fetch){
  if((env.SECRETJ_NATIVE_MONITOR_ENABLED??process.env.SECRETJ_NATIVE_MONITOR_ENABLED)!=='true')return {status:'disabled'};
  const mailEnv={RESEND_API_KEY:env.RESEND_API_KEY||process.env.RESEND_API_KEY,
    SECRETJ_EMAIL_FROM:env.SECRETJ_EMAIL_FROM||process.env.SECRETJ_EMAIL_FROM};
  // Matching Feed must still populate without verified email or configured
  // Resend. Only dispatch is conditional on the email service.
  const mailReady=(env.SECRETJ_ALERTS_ENABLED??process.env.SECRETJ_ALERTS_ENABLED)==='true'
    &&Boolean(mailEnv.RESEND_API_KEY&&mailEnv.SECRETJ_EMAIL_FROM);
  const users=await subscriptions();
  if(!users.length)return {status:'no_subscribers'};
  const result=await gather(env,fetchImpl);
  if(!result.jobs.length)return {status:'no_source_data',failedSources:result.failures.length};
  let processed=0,sent=0,failed=0;
  const eligible=new Map();
  const proofCache=new Map();
  let proofRequests=0;
  for(const user of users){
    try{
      let selected=matching(result.jobs,user);
      // Employer-side filtering: exact labels provided by the company's
      // own postings, only for sources that explicitly support ?level.
      // Never use the filtered response as a reason to discard an unlabeled
      // match from the full official board.
      let queries=0;
      const proof=new Set();
      for(const entry of result.registry.companies){
        if(queries>=8)break;
        const board=result.official.get(entry.name);
        if(!board?.length||!leverSlug(entry))continue;
        for(const facet of supportedNativeFacets(board,user)){
          if(queries>=8)break;
          queries++;
          try{
            const key=entry.name+'|'+facet.parameter+'|'+facet.value;
            if(!proofCache.has(key) && proofRequests<48){
              proofRequests++;
              proofCache.set(key,leverFacetProof(entry,facet,fetchImpl));
            }
            const pending=proofCache.get(key);
            if(!pending)continue;
            const urls=await pending;
            for(const url of urls)proof.add(url);
          }catch{ /* Keep fallback, never claim official proof after failure. */ }
        }
      }
      selected=selected.map(job=>proof.has(validHttps(job.url||job.apply_url))?
        {...job,source_filter_proof:'employer-native-filter'}:job);
      const verified=await qualifyJobs(selected,user,env,fetchImpl);
      await reserveNew(user,signature(user),verified.accepted);
      if(mailReady&&user.email_eligible===true&&prefs.hasFilters(user))eligible.set(user.id,user);
      processed++;
    }catch{failed++;}
  }
  // Fairly send oldest pending subscriber notifications first; no fixed user
  // order can starve members who joined later. Queue remains durable in Neon.
  if(eligible.size){
    const priority=await core.query(
      `SELECT user_id FROM public.sj_native_watch_jobs
       WHERE user_id=ANY($1::uuid[]) AND status IN ('pending','failed')
         AND job_snapshot->>'qualification_status'='accepted'
         AND (attempted_at IS NULL OR attempted_at < now()-interval '10 minutes')
       GROUP BY user_id ORDER BY MIN(discovered_at) ASC LIMIT ${MAX_EMAILS}`,
      [[...eligible.keys()]]);
    for(const row of priority){
      const user=eligible.get(row.user_id);
      if(!user)continue;
      if(await flush(user,sendImpl,mailEnv))sent++;else failed++;
    }
  }
  return {status:'processed',processed,sent,failed,failedSources:result.failures.length,
    nativeBoards:result.official.size,snapshotFresh:result.snapshotFresh,mailReady};
}
module.exports={deliver,leverSlug,leverBoard,ashbyBoard,workableBoard,leverFacetProof,supportedLevelFacets,supportedNativeFacets,
  gather,matching,signature,reserveNew,flush,scanOneUser,qualifyJobs};
