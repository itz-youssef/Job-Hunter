'use strict';
// Shared public vacancies + dictionary facts. No user preferences are stored
// here. The exact existing matcher remains the final decision authority.
const {createHash}=require('node:crypto');
const prefs=require('../../dist/assets/secretj-job-preferences');
const cache=require('./preference-cache');
const isolated=require('./isolated-read-routing');
const SHA=x=>createHash('sha256').update(x).digest('hex');
const version=SHA(cache.fingerprint+'\n'+prefs.prepare.toString()+'\n'+prefs.assessPrepared.toString()+'\n'+require('../../dist/assets/secretj-career-level').matchPrepared.toString()+'\n'+require('../../dist/assets/secretj-eligibility-core').extractExperience.toString()+'\n'+JSON.stringify(prefs.exportDictionary()));
// Include every input used by the existing title/role/location/years engines.
// Source timestamps and alert metadata are deliberately not matching inputs.
const keys=['title','position','job_title','company','company_name','employer',
 'location','job_location','seniority','career_level','experience_level','level',
 'employment','job_type','program_type','requirements','description'];
const digest=job=>SHA(JSON.stringify(keys.map(k=>job[k]??null)));
const validKey=job=>{try{const u=new URL(job.url||job.apply_url);return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=500?u.href:'';}catch{return '';}};
function validFacts(f){
 return !!f&&Array.isArray(f.fields)&&f.fields.every(x=>typeof x==='string')&&
  typeof f.inEgypt==='boolean'&&f.level&&Array.isArray(f.level.evidence)&&
  (f.level.level===null||typeof f.level.level==='string')&&
  Array.isArray(f.early)&&f.early.length===3&&f.early.every(x=>x&&Array.isArray(x.evidence)&&Array.isArray(x.reasons)&&Array.isArray(x.sourceSpans))&&
  (f.years===null||Number.isFinite(f.years));
}
function prepareRows(jobs,prior=[],compact=x=>x){
 const existing=new Map(prior.map(r=>[r.job_key,r]));
 const rows=new Map(),factsByJob=new WeakMap();
 let reused=0,classified=0;
 for(const job of jobs){
  if(!job||typeof job!=='object')continue;
  const key=validKey(job);if(!key)continue;
  const hash=digest(job),old=existing.get(key);
  let facts;
  if(old?.evidence_digest===hash&&old.matcher_fingerprint===version&&validFacts(old.facts)){
   facts=old.facts;reused++;
  }else{facts=prefs.prepare(job);classified++;}
  factsByJob.set(job,facts);
  rows.set(key,{job_key:key,evidence_digest:hash,job:compact(job),facts,
   role_families:facts.fields,career_level:facts.level?.level??null,in_egypt:facts.inEgypt});
 }
 return {rows:[...rows.values()],factsByJob,reused,classified};
}
async function publish(env,gathered,compact,started){
 let prior=[];
 try{prior=await isolated.dictionaryCatalogQuery(env,
   'SELECT job_key,evidence_digest,matcher_fingerprint,facts FROM secretj_migration_sync.dictionary_catalog_jobs WHERE matcher_fingerprint=$1',
   [version],5000);}catch{/* A cache outage never changes matching. */}
 const result=prepareRows(gathered.jobs,prior,compact);
 if(!result.rows.length)return {...result,published:false};
 let published=false;
 try{
  const r=await isolated.dictionaryCatalogQuery(env,
   'SELECT secretj_migration_sync.publish_dictionary_catalog($1::jsonb,$2,$3::timestamptz,$4,$5,$6) AS published',
   [JSON.stringify(result.rows),version,started,gathered.snapshotFresh===true,gathered.failures.length,gathered.official.size],15000);
  published=r[0]?.published===true;
 }catch(error){console.warn('secretj-dictionary-catalog-publish',{status:'fallback',code:String(error?.code||'unavailable').slice(0,30)});}
 return {...result,published};
}
// These indexes narrow only predicates already enforced by the dictionary.
// Unknown/legacy level keys use exactly the existing alias/empty-set behavior.
// The final authoritative assess() still checks every remaining condition.
function selection(p){
 const aliases={director:'director_head_executive',executive:'director_head_executive'};
 const valid=new Set(prefs.careerLevels.map(x=>x.key));
 const chosen=Array.isArray(p.career_levels)?p.career_levels:[];
 const levels=chosen.length?chosen.map(x=>aliases[x]||x).filter(x=>valid.has(x)):
   p.internships===true?['internship']:[];
 return {roles:Array.isArray(p.role_families)?p.role_families:[],levels,egypt:p.egypt_only===true};
}
const READ_SQL=`SELECT m.job_count,m.snapshot_fresh,m.failed_sources,m.native_boards,m.published_at,
 j.job_key,j.job,j.facts
 FROM secretj_migration_sync.dictionary_catalog_manifest m
 LEFT JOIN LATERAL (
  SELECT job_key,job,facts FROM secretj_migration_sync.dictionary_catalog_jobs
  WHERE matcher_fingerprint=$1
    AND (cardinality($2::text[])=0 OR role_families && $2::text[])
    AND (cardinality($3::text[])=0 OR career_level=ANY($3::text[]))
    AND (NOT $4::boolean OR in_egypt)
  ORDER BY job_key
 ) j ON true
 WHERE m.singleton AND m.matcher_fingerprint=$1
 AND m.published_at>=now()-interval '4 hours'`;
async function read(env,p){
 try{
  const {roles,levels,egypt}=selection(p);
  const rows=await isolated.dictionaryCatalogQuery(env,READ_SQL,[version,roles,levels,egypt],5000);
  if(!rows.length||!Number(rows[0].job_count))return null;
  const jobs=[],factsByJob=new WeakMap();
  for(const row of rows){
   if(row.job_key===null)continue;
   if(!row.job||!validFacts(row.facts)||validKey(row.job)!==row.job_key)return null;
   jobs.push(row.job);factsByJob.set(row.job,row.facts);
  }
  return {jobs,factsByJob,snapshotFresh:rows[0].snapshot_fresh===true,
   failedSources:Number(rows[0].failed_sources)||0,nativeBoards:Number(rows[0].native_boards)||0};
 }catch{return null;}
}
module.exports={version,digest,validFacts,prepareRows,publish,read,selection,READ_SQL};
