'use strict';
// The core database remains authoritative for authorization, queue state and
// exact record versions. Remote data is usable only when the complete source
// record digest is verified. The source outbox asynchronously maintains private
// mirrors; read activation remains explicit and independent.
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
 const t=TARGETS[service];if(!t)return false;
 const flag=env?.[t.flag]??process.env[t.flag];
 // Vercel production uses its existing encrypted, read-only connections;
 // no extra deployment token or environment flag is required. Explicit false
 // still disables routing on either platform. Preview/test remain opt-in.
 const productionVercel=process.env.VERCEL_ENV==='production';
 return (flag==='true'||(flag==null&&productionVercel))&&!!config(service,env);
}
let testQuery=null;
function setQueryForTests(fn){
 if(process.env.NODE_ENV!=='test')throw Error('Test injection is disabled');
 testQuery=fn;
}
async function remoteQuery(service,env,text,values,timeout=1000){
 const value=config(service,env);
 if(!value)throw Error('Isolated database not configured');
 if(testQuery)return testQuery(service,text,values);
 const {neon}=require('@neondatabase/serverless');
 const sql=neon(value);
 return sql.query(text,values,{fetchOptions:{signal:AbortSignal.timeout(timeout)}});
}
async function jobSnapshots(env,userId,rows){
 if(!Array.isArray(rows)||rows.length>251||rows.some(r=>typeof r.job_key!=='string'||!DIGEST.test(r.record_digest)))return null;
 if(!rows.length)return [];
 try{
  const remote=await remoteQuery('jobHunter',env,`SELECT record_digest,entity_key AS job_key,full_record->'job_snapshot' AS job_snapshot
    FROM secretj_migration_sync.reconstructed
    WHERE service='jobHunter' AND record_digest=ANY($1::text[]) AND owner_id=$2::uuid
      AND record_digest=encode(sha256(convert_to(full_record::text,'UTF8')),'hex')`,
    [rows.map(r=>r.record_digest),userId]);
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
  const rows=await remoteQuery('botfolio',env,`SELECT full_record->'knowledge' AS knowledge
    FROM secretj_migration_sync.reconstructed WHERE service='botfolio' AND entity_key=$1
      AND owner_id=$2::uuid AND record_digest=$3
      AND record_digest=encode(sha256(convert_to(full_record::text,'UTF8')),'hex')`,
   [bot.id,bot.user_id,bot.record_digest]);
  return Array.isArray(rows[0]?.knowledge)?rows[0].knowledge:null;
 }catch{return null;}
}

// Read the queue and the corresponding authoritative source records in one
// statement. Text transfer preserves PostgreSQL numeric/JSON precision.
const SOURCE_QUERIES={
 jobHunter:`SELECT q.owner_id::text AS owner_id,q.entity_key,q.revision::text AS revision,
  to_jsonb(w)::text AS record_text,encode(sha256(convert_to(to_jsonb(w)::text,'UTF8')),'hex') AS record_digest
  FROM (SELECT * FROM secretj_migration_sync.outbox WHERE service='jobHunter' ORDER BY revision LIMIT 100) q
  LEFT JOIN public.sj_native_watch_jobs w ON w.user_id=q.owner_id AND w.job_key=q.entity_key
  ORDER BY q.revision`,
 botfolio:`SELECT q.owner_id::text AS owner_id,q.entity_key,q.revision::text AS revision,
  to_jsonb(b)::text AS record_text,encode(sha256(convert_to(to_jsonb(b)::text,'UTF8')),'hex') AS record_digest
  FROM (SELECT * FROM secretj_migration_sync.outbox WHERE service='botfolio' ORDER BY revision LIMIT 2) q
  LEFT JOIN public.sj_botfolio_bots b ON b.user_id=q.owner_id AND b.id::text=q.entity_key
  ORDER BY q.revision`
};
async function syncService(service,env,sourceQuery=require('./core').query,scope=null){
 if(!SOURCE_QUERIES[service]||!config(service,env))return {status:'not_configured',count:0};
 const args=[];
 let source=SOURCE_QUERIES[service];
 if(scope){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.ownerId))throw Error('Invalid write scope');
  args.push(scope.ownerId);
  let clause=' AND owner_id=$1::uuid';
  if(scope.entityKey!==undefined){
   if(typeof scope.entityKey!=='string'||!scope.entityKey||scope.entityKey.length>500)throw Error('Invalid write key');
   args.push(scope.entityKey);clause+=' AND entity_key=$2';
  }
  source=source.replace(" ORDER BY revision LIMIT",()=>clause+" ORDER BY revision LIMIT");
 }
 const rows=await sourceQuery(source,args);
 if(!rows.length)return {status:'empty',count:0};
 // Bound the actual encoded transfer; a single oversized valid record must
 // still make progress. No truncation or splitting of JSON records.
 const batch=[];let bytes=2;
 for(const row of rows){
  const n=Buffer.byteLength(JSON.stringify(row),'utf8')+1;
  if(batch.length&&bytes+n>1500000)break;
  batch.push(row);bytes+=n;
 }
 const targetedBot=service==='botfolio'&&scope!==null;
 const result=targetedBot
  ?await remoteQuery(service,env,'SELECT secretj_migration_sync.apply_botfolio_write($1::jsonb) AS applied',[JSON.stringify(batch)],1800)
  :await remoteQuery(service,env,'SELECT secretj_migration_sync.apply_batch($1,$2::jsonb) AS applied',[service,JSON.stringify(batch)],15000);
 if(Number(result[0]?.applied)!==batch.length)throw Error('Incomplete mirror acknowledgement');
 // Delete only the exact revision successfully applied. Concurrent updates
 // remain queued; retries are safe even if acknowledgement failed.
 const keys=batch.map(({owner_id,entity_key,revision})=>({owner_id,entity_key,revision}));
 await sourceQuery(`DELETE FROM secretj_migration_sync.outbox q
   USING jsonb_to_recordset($2::jsonb) AS k(owner_id uuid,entity_key text,revision bigint)
   WHERE q.service=$1 AND q.owner_id=k.owner_id AND q.entity_key=k.entity_key AND q.revision=k.revision`,
   [service,JSON.stringify(keys)]);
 return {status:'synced',count:batch.length};
}
async function syncIsolated(env){
 if((env?.SECRETJ_ISOLATED_SYNC_ENABLED??process.env.SECRETJ_ISOLATED_SYNC_ENABLED)!=='true')return;
 const result=await Promise.allSettled(['jobHunter','botfolio'].map(service=>syncService(service,env)));
 for(let i=0;i<result.length;i++){
  const item=result[i],service=['jobHunter','botfolio'][i];
  console.log('secretj-isolated-sync',{service,status:item.status==='fulfilled'?item.value.status:'retry',count:item.status==='fulfilled'?item.value.count:0});
 }
}


// Core remains the atomic commit journal and fallback. Dispatch a write to the
// product database immediately after a successful commit; any failure leaves
// the exact revision in the durable outbox for the independent scheduler.
function writesEnabled(service,env=process.env){
 const flag=env?.SECRETJ_ISOLATED_WRITE_THROUGH??process.env.SECRETJ_ISOLATED_WRITE_THROUGH;
 return (flag==='true'||(flag==null&&process.env.VERCEL_ENV==='production'))&&!!config(service,env);
}
async function syncAfterWrite(service,env,ownerId,entityKey,waitUntil){
 if(!writesEnabled(service,env))return {status:'disabled',count:0};
 const task=syncService(service,env,undefined,{ownerId,entityKey}).catch(()=>{
  console.warn('secretj-isolated-write',{service,status:'queued_retry'});
  return {status:'queued_retry',count:0};
 });
 if(typeof waitUntil==='function'){
  try{waitUntil(task);return {status:'scheduled',count:0};}catch{return task;}
 }
 return task;
}
// Bounded, change-only catch-up; never poll a remote database for an empty queue.
// The source query and acknowledgement remain revision-safe across workers.
async function drainWrites(service,env,maxBatches=4){
 if(!writesEnabled(service,env))return {status:'disabled',count:0};
 let count=0;
 try{
  for(let i=0;i<Math.max(1,Math.min(8,maxBatches));i++){
   const result=await syncService(service,env);
   count+=result.count;
   if(result.status!=='synced')break;
   if(result.count<(service==='jobHunter'?100:2))break;
  }
  return {status:'synced',count};
 }catch{return {status:'queued_retry',count};}
}

module.exports={enabled,jobSnapshots,botKnowledge,setQueryForTests,syncService,syncIsolated,writesEnabled,syncAfterWrite,drainWrites};
