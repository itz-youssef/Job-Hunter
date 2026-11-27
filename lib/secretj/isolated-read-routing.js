'use strict';
// The core database remains authoritative for authorization, queue state and
// exact record versions. Remote data is usable only when the complete source
// record digest is verified. No cross-project writes or automatic cutover.
const TARGETS=Object.freeze({
 jobHunter:{key:'JOB_HUNTER_DATABASE_URL',host:'ep-soft-cloud-bgoaznc6.c-9.eu-central-1.aws.neon.tech',flag:'SECRETJ_JOB_HUNTER_ISOLATED_READS'},
 botfolio:{key:'BOTFOLIO_DATABASE_URL',host:'ep-super-haze-bgxz5xuw.c-9.eu-central-1.aws.neon.tech',flag:'SECRETJ_BOTFOLIO_ISOLATED_READS'}
});
const DIGEST=/^[a-f0-9]{64}$/;
function config(service,env=process.env){
 const t=TARGETS[service];if(!t)return null;
 const value=env?.[t.key]??process.env[t.key];
 if(typeof value!=='string'||!value)return null;
 try{
  const u=new URL(value),pooled=t.host.replace('.', '-pooler.');
  if(!['postgres:','postgresql:'].includes(u.protocol)||![t.host,pooled].includes(u.hostname)||u.pathname!=='/neondb'||!u.username||!u.password||u.hash||u.port&&u.port!=='5432')return null;
  return value;
 }catch{return null;}
}
function enabled(service,env=process.env){
 const t=TARGETS[service];return !!t&&(env?.[t.flag]??process.env[t.flag])==='true'&&!!config(service,env);
}
let testQuery=null;
function setQueryForTests(fn){
 if(process.env.NODE_ENV!=='test')throw Error('Test injection is disabled');
 testQuery=fn;
}
async function remoteQuery(service,env,text,values){
 const value=config(service,env);
 if(!value)throw Error('Isolated database not configured');
 if(testQuery)return testQuery(service,text,values);
 const {neon}=require('@neondatabase/serverless');
 const sql=neon(value);
 return sql.query(text,values,{fetchOptions:{signal:AbortSignal.timeout(1000)}});
}
const RUN_JOB='20261127-jobhunter-shadow-v1',RUN_BOT='20261127-botfolio-shadow-v1';
async function jobSnapshots(env,userId,rows){
 if(!Array.isArray(rows)||rows.length>251||rows.some(r=>typeof r.job_key!=='string'||!DIGEST.test(r.record_digest)))return null;
 if(!rows.length)return [];
 try{
  const remote=await remoteQuery('jobHunter',env,`WITH reconstructed AS (
    SELECT r.record_digest,r.record||jsonb_build_object('job_snapshot',p.payload||r.qualifiers) AS full_record
    FROM secretj_migration_shadow.records r
    JOIN secretj_migration_shadow.payloads p ON p.digest=r.payload_digest
    WHERE r.run_id=$1 AND r.kind='sj_native_watch_jobs' AND r.record_digest=ANY($2::text[])
      AND r.record->>'user_id'=$3::text
   )
   SELECT record_digest,full_record->>'job_key' AS job_key,full_record->'job_snapshot' AS job_snapshot
   FROM reconstructed WHERE record_digest=encode(sha256(convert_to(full_record::text,'UTF8')),'hex')`,
   [RUN_JOB,rows.map(r=>r.record_digest),userId]);
  const byDigest=new Map(remote.map(r=>[r.record_digest,r]));
  const assembled=[];
  for(const r of rows){
   const hit=byDigest.get(r.record_digest);
   if(!hit||hit.job_key!==r.job_key||!hit.job_snapshot||typeof hit.job_snapshot!=='object'||Array.isArray(hit.job_snapshot))return null;
   const {record_digest,...meta}=r;
   assembled.push({...meta,job_snapshot:hit.job_snapshot});
  }
  return assembled;
 }catch{return null;}
}
async function botKnowledge(env,bot){
 if(!bot?.id||!bot.user_id||!DIGEST.test(bot.record_digest))return null;
 try{
  const rows=await remoteQuery('botfolio',env,`SELECT record->'knowledge' AS knowledge
    FROM secretj_migration_shadow.bot_records WHERE run_id=$1 AND id=$2::uuid
      AND record->>'user_id'=$3::text AND record_digest=$4
      AND record_digest=encode(sha256(convert_to(record::text,'UTF8')),'hex')`,
   [RUN_BOT,bot.id,bot.user_id,bot.record_digest]);
  return Array.isArray(rows[0]?.knowledge)?rows[0].knowledge:null;
 }catch{return null;}
}
module.exports={enabled,jobSnapshots,botKnowledge,setQueryForTests};
