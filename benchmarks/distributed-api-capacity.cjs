'use strict';
// Synthetic load only. The real API handlers, SQL and quota checks run against
// disposable databases. No production secrets, providers, emails or accounts.
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Pool}=require('pg');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const core=require('../lib/secretj/core');
const router=require('../lib/secretj/isolated-read-routing');
const feed=require('../api/secretj-native-status');
const bot=require('../api/secretj-botfolio');
const B=require('../lib/secretj/botfolio');
const cache=require('../lib/secretj/preference-cache');
const N=5000, C=25;
const host='127.0.0.1', port=5432, user='secretj_bench', password='synthetic_only';
const connection={host,port,user,password,max:C};
const primary=new Pool({...connection,database:'secretj_benchmark'});
const remotes={jobHunter:new Pool({...connection,database:'secretj_job_benchmark'}),botfolio:new Pool({...connection,database:'secretj_bot_benchmark'})};
const signature='a'.repeat(64);
const env={JOB_HUNTER_DATABASE_URL:'postgresql://test:test@ep-soft-cloud-bgoaznc6.c-9.eu-central-1.aws.neon.tech/neondb',BOTFOLIO_DATABASE_URL:'postgresql://test:test@ep-super-haze-bgxz5xuw.c-9.eu-central-1.aws.neon.tech/neondb'};
const hash=x=>createHash('sha256').update(x).digest('hex');
const token=id=>createHash('sha256').update('synthetic-session:'+id).digest('base64url');
const fakeAnswer=async(env,b)=>{assert.equal(b.knowledge[0].text,'Synthetic professional facts for '+b.user_id);return b.knowledge[0].text;};
const keys="ARRAY['qualification_status','qualification_mode','qualification_model','qualification_reason','qualification_preference_signature','qualification_matcher_fingerprint']";
async function fixture(){
 const db=await primary.query('SELECT current_database() AS db');assert.equal(db.rows[0].db,'secretj_benchmark');
 for(const [svc,p] of Object.entries(remotes)){
  const d=await p.query('SELECT current_database() AS db');
  assert.equal(d.rows[0].db,svc==='jobHunter'?'secretj_job_benchmark':'secretj_bot_benchmark');
 }
 const users=(await primary.query('SELECT id::text AS id FROM bench.users ORDER BY id')).rows;
 assert.equal(users.length,N);
 await primary.query("INSERT INTO public.sj_users(id,email,password_hash,role) SELECT id,id::text||'@example.invalid',repeat('x',64),'member' FROM bench.users");
 await primary.query("INSERT INTO public.sj_preferences(user_id,updated_at) SELECT id,'2026-11-27 00:00:00+00' FROM bench.users");
 await primary.query("INSERT INTO public.sj_native_watch_state(user_id,preference_signature,initialized_at,updated_at) SELECT id,$1,'2026-11-27 00:00:00+00','2026-11-27 00:00:00+00' FROM bench.users",[signature]);
 await primary.query("INSERT INTO public.sj_sessions(token_hash,user_id,expires_at) SELECT x.hash,x.id::uuid,now()+interval '1 day' FROM jsonb_to_recordset($1::jsonb) AS x(hash text,id text)",[JSON.stringify(users.map(({id})=>({id,hash:hash(token(id))})))]);
 await primary.query("INSERT INTO public.sj_native_watch_jobs(user_id,job_key,job_snapshot,status,discovered_at,attempted_at,sent_at) SELECT user_id,job_key,job_snapshot||jsonb_build_object('qualification_status','accepted','qualification_mode','dictionary-title-v1','qualification_preference_signature',$1::text,'qualification_matcher_fingerprint',$2::text),status,discovered_at,attempted_at,sent_at FROM bench.original",[signature,cache.fingerprint]);
 await primary.query("INSERT INTO public.sj_botfolio_bots(id,user_id,slot,name,headline,knowledge,embedding_model,published) SELECT md5('synthetic-bot-'||id::text)::uuid,id,1,'Synthetic portfolio','Engineer',jsonb_build_array(jsonb_build_object('text','Synthetic professional facts for '||id::text,'vector',(SELECT jsonb_agg((i%1000)*0.000123456789) FROM generate_series(1,1024) i))),$1,true FROM bench.users",[B.EMBED_MODEL]);
 await primary.query('ANALYZE public.sj_native_watch_jobs; ANALYZE public.sj_botfolio_bots; ANALYZE public.sj_sessions;');
 // Feed only synthetic content into COPY scripts; no credentials/data artifacts.
 fs.writeFileSync('/tmp/secretj-copy-jobs.sql', "COPY (SELECT DISTINCT encode(sha256(convert_to((job_snapshot-"+keys+")::text,'UTF8')),'hex') AS digest,job_snapshot-"+keys+" AS content FROM public.sj_native_watch_jobs) TO STDOUT;");
 fs.writeFileSync('/tmp/secretj-copy-records.sql', "COPY (SELECT 'jobHunter',user_id,job_key,row_number() OVER (ORDER BY user_id,job_key),encode(sha256(convert_to(to_jsonb(w)::text,'UTF8')),'hex'),to_jsonb(w)-'job_snapshot',encode(sha256(convert_to((job_snapshot-"+keys+")::text,'UTF8')),'hex'),(SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(job_snapshot) WHERE key=ANY("+keys+")) FROM public.sj_native_watch_jobs w) TO STDOUT;");
 fs.writeFileSync('/tmp/secretj-copy-bots.sql',"COPY (SELECT 'botfolio',user_id,id::text,row_number() OVER (ORDER BY id),encode(sha256(convert_to(to_jsonb(b)::text,'UTF8')),'hex'),to_jsonb(b),NULL::text,'{}'::jsonb FROM public.sj_botfolio_bots b) TO STDOUT;");
 console.log('Synthetic core ready: '+N+' accounts, '+(N*20)+' watch rows, '+N+' portfolios');
}
async function invoke(handler,req){
 let body;
 const res={statusCode:200,setHeader(){},end(v){body=JSON.parse(v);}};
 await handler(req,res);
 assert.equal(res.statusCode,200,JSON.stringify(body));
 assert.equal(body.ok,true);
 return body;
}
async function workload(){
 const users=(await primary.query("SELECT id::text AS id,md5('synthetic-bot-'||id::text)::uuid::text AS bot_id FROM bench.users ORDER BY id")).rows;
 assert.equal(users.length,N);
 for(const [svc,p] of Object.entries(remotes)){
  await p.query('ANALYZE secretj_migration_sync.records; ANALYZE secretj_migration_sync.payloads;');
  const n=(await p.query("SELECT count(*)::int AS n FROM secretj_migration_sync.reconstructed WHERE service=$1 AND record_digest=encode(sha256(convert_to(full_record::text,'UTF8')),'hex')",[svc])).rows[0].n;
  assert.equal(n,svc==='jobHunter'?N*20:N);
 }
 core.setQueryForTests(async(sql,params)=> (await primary.query(sql,params)).rows);
 const prior=B.answer;B.answer=fakeAnswer;
 const question='What technical experience does this person have?';
 assert.equal(B.localResponse(question),null);
 let phase='original',hits=0,attempts=0;
 router.setQueryForTests(async(service,sql,params)=>{
  attempts++;
  if(phase==='fallback')throw Error('Synthetic isolated database outage');
  const result=await remotes[service].query(sql,params);hits++;
  return result.rows;
 });
 const base={feed:new Array(N),botfolio:new Array(N)};
 try{
  for(const mode of ['original','distributed','fallback']){
   phase=mode;hits=0;attempts=0;
   const active=mode!=='original';
   const config={...env,SECRETJ_JOB_HUNTER_ISOLATED_READS:String(active),SECRETJ_BOTFOLIO_ISOLATED_READS:String(active)};
   const feedHandler=feed.createHandler(config);
   for(const kind of ['feed','botfolio']){
    const latencies=[];let cursor=0,completed=0;
    const started=performance.now(),attempt0=attempts,hit0=hits;
    await Promise.all(Array.from({length:C},async()=>{
     for(;;){
      const i=cursor++;if(i>=N)return;
      const u=users[i], headers={host:'synthetic.invalid',origin:'https://synthetic.invalid',cookie:'sj_session='+token(u.id),'x-forwarded-for':'synthetic-client-'+i};
      const t=performance.now();
      let body;
      if(kind==='feed'){
       body=await invoke(feedHandler,{method:'GET',query:{action:'feed',offset:'0'},headers,env:config});
       assert.equal(body.ready,true);assert.equal(body.jobs.length,20);
      }else{
       body=await invoke(bot,{method:'POST',query:{action:'chat'},headers,body:{id:u.bot_id,message:question},env:config});
       assert.equal(body.answer,'Synthetic professional facts for '+u.id);
      }
      const digest=hash(JSON.stringify(body));
      if(mode==='original')base[kind][i]=digest;
      else assert.equal(digest,base[kind][i],mode+' response mismatch');
      latencies.push(performance.now()-t);completed++;
     }
    }));
    latencies.sort((a,b)=>a-b);
    const p=q=>+latencies[Math.ceil(q*N)-1].toFixed(2);
    assert.equal(completed,N);
    assert.equal(attempts-attempt0,active?N:0);
    assert.equal(hits-hit0,mode==='distributed'?N:0);
    console.log(JSON.stringify({benchmark:'actual_handlers',mode,kind,accounts:N,concurrency:C,completed,failures:0,parity:true,remote_attempts:attempts-attempt0,remote_hits:hits-hit0,p50_ms:p(.5),p95_ms:p(.95),p99_ms:p(.99),rps:+(N*1000/(performance.now()-started)).toFixed(2)}));
   }
  }
 }finally{B.answer=prior;router.setQueryForTests(null);core.setQueryForTests(null);}
}
(async()=>{try{if(process.argv[2]==='fixture')await fixture();else if(process.argv[2]==='run')await workload();else throw Error('Use fixture or run');}finally{await Promise.all([primary.end(),...Object.values(remotes).map(p=>p.end())]);}})().catch(e=>{console.error(e.message);process.exitCode=1;});
