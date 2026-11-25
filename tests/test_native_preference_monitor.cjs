'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const monitor=require('../lib/secretj/native-preference-monitor');
const ID='e07bb2d6-a213-45d0-ab23-e5051967a616';
const other=(id,title,description='')=>({id,company:'Example',title,description,
  location:'Cairo, Egypt',url:'https://example.com/jobs/'+id});
function fixture(){
 let state=null,settings={egypt_only:false,internships:false,
   career_levels:['entry','junior','internship'],role_families:['ai_ml'],max_experience_years:2};
 const queue=new Map(),sent=[];
 let jobs=[other('old','Junior AI Engineer','Internship machine learning models')];
 const responses=[];
 const env={ASSETS:{fetch:async req=>({
  ok:true,json:async()=>String(req.url).includes('registry')?
   {companies:[{name:'Bosta',source_kind:'lever',source_url:'https://jobs.lever.co/Bosta/'}]}:
   {generated_at:new Date().toISOString(),jobs}
 })}};
 core.setQueryForTests(async(sql,args=[])=>{
  if(sql.includes('FROM public.sj_users u'))return [{id:ID,email:'member@example.com',email_eligible:true,...settings}];
  if(sql.startsWith('SELECT preference_signature'))return state?[{preference_signature:state}]:[];
  if(sql.startsWith('INSERT INTO public.sj_native_watch_state')){state=args[1];return [];}
  if(sql.startsWith('UPDATE public.sj_native_watch_state')){state=args[1];return [];}
  if(sql.startsWith('DELETE FROM public.sj_native_watch_jobs')){
   if(sql.includes("qualification_status")) {
     for(const [key,row] of queue)if(row.job_snapshot?.qualification_status!=='accepted')queue.delete(key);
   } else queue.clear();
   return [];
  }
  if(sql.includes('FROM jsonb_to_recordset')){
   for(const item of JSON.parse(args[1]))if(!queue.has(item.key))queue.set(item.key,{job_key:item.key,job_snapshot:item.job,status:args[2]});
   return [];
  }
  if(sql.includes('GROUP BY user_id')&&sql.includes('sj_native_watch_jobs')){
   return [...queue.values()].some(x=>['pending','failed'].includes(x.status))?[{user_id:ID}]:[];
  }
  if(sql.includes('FOR UPDATE SKIP LOCKED')){
   const batch=[...queue.values()].filter(x=>['pending','failed'].includes(x.status)).slice(0,20);
   batch.forEach(x=>x.status='pending');return batch;
  }
  if(sql.includes("SET status='sent'")){for(const key of args[1])queue.get(key).status='sent';return [];}
  if(sql.includes("SET status='failed'")){for(const key of args[1])queue.get(key).status='failed';return [];}
  throw Error('Unexpected SQL: '+sql.slice(0,100));
 });
 const fetchImpl=async url=>{
  responses.push(String(url));
  return {ok:true,json:async()=>[]};
 };
 return {env,queue,sent,responses,fetchImpl,
   add(job){jobs.push(job);},change(p){settings={...settings,...p};},
   async run(){
    const previous={enabled:process.env.SECRETJ_NATIVE_MONITOR_ENABLED,
      alerts:process.env.SECRETJ_ALERTS_ENABLED,key:process.env.RESEND_API_KEY,
      from:process.env.SECRETJ_EMAIL_FROM};
    Object.assign(process.env,{SECRETJ_NATIVE_MONITOR_ENABLED:'true',
      SECRETJ_ALERTS_ENABLED:'true',RESEND_API_KEY:'test',SECRETJ_EMAIL_FROM:'alerts@example.org'});
    try{return await monitor.deliver(env,async(to,subject,body)=>{sent.push({to,subject,body});},fetchImpl);}
    finally{for(const [k,v] of Object.entries({SECRETJ_NATIVE_MONITOR_ENABLED:previous.enabled,SECRETJ_ALERTS_ENABLED:previous.alerts,RESEND_API_KEY:previous.key,SECRETJ_EMAIL_FROM:previous.from})){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }}
   },
   finish(){core.setQueryForTests(null);}
 };
}
test('personalized scanner baselines existing jobs then emails only new ones once',async()=>{
 const f=fixture();
 try{
  const first=await f.run();assert.equal(first.processed,1);assert.equal(f.sent.length,0);
  assert.equal(f.queue.get('https://example.com/jobs/old').status,'baseline');
  f.add(other('new','Machine Learning Intern','Develop ML models'));
  assert.equal((await f.run()).sent,1);assert.equal(f.sent.length,1);
  assert.match(f.sent[0].body,/Machine Learning Intern/);
  await f.run();assert.equal(f.sent.length,1,'No duplicate mail for same posting');
  assert.equal(f.queue.get('https://example.com/jobs/new').status,'sent');
 }finally{f.finish();}
});
test('changing subscriber preferences rebaselines currently visible jobs',async()=>{
 const f=fixture();
 try{
  await f.run();f.change({career_levels:['senior']});
  f.add(other('senior','Senior AI Engineer','Design ML platform'));
  await f.run();assert.equal(f.sent.length,0,'Existing posting after preference change is baseline');
  f.add(other('senior2','Senior ML Engineer','Lead inference optimization'));
  await f.run();assert.equal(f.sent.length,1);
  assert.match(f.sent[0].body,/Senior ML Engineer/);
 }finally{f.finish();}
});
test('official board URL is pinned to known Lever host and native filters are not invented',async()=>{
 assert.equal(monitor.leverSlug({source_kind:'lever',source_url:'https://jobs.lever.co/Bosta/'}),'Bosta');
 assert.equal(monitor.leverSlug({source_kind:'lever',source_url:'https://evil.example/Bosta/'}),'');
 const job={title:'Junior AI Engineer',source_facets:{level:'Junior'}};
 assert.deepEqual(monitor.supportedLevelFacets([job],{career_levels:['junior']}),['Junior']);
 assert.deepEqual(monitor.supportedLevelFacets([job],{career_levels:['senior']}),[]);
});
test('public catalog and account-only monitor maintain separate data stores',()=>{
 const main=fs.readFileSync('app/custom_monitor.py','utf8');
 const worker=fs.readFileSync('cloudflare/site/worker.mjs','utf8');
 const registry=JSON.parse(fs.readFileSync('dist/native-source-registry.json','utf8'));
 assert.match(main,/snapshot\["jobs"\] = list/);
 assert.doesNotMatch(main,/sj_native_watch_jobs/);
 assert.match(worker,/nativeMonitor\.deliver\(env\)/);
 assert.equal(registry.company_count,58);
 assert.equal(registry.companies.filter(x=>x.preference_mode==='server-query').length,6);
 assert.match(fs.readFileSync('cloudflare/site/wrangler.toml','utf8'),/SECRETJ_NATIVE_MONITOR_ENABLED = "true"/);
});

test('Ashby official API is fetched live independently from catalog snapshot',async()=>{
 const entry={name:'Thndr',source_kind:'ashby',source_url:'https://jobs.ashbyhq.com/thndr'};
 const calls=[];
 const rows=await monitor.ashbyBoard(entry,async url=>{
   calls.push(url);
   return {ok:true,json:async()=>({jobs:[
     {title:'Junior Machine Learning Engineer',jobUrl:'https://jobs.ashbyhq.com/thndr/123',
      location:'Egypt',team:'Engineering',employmentType:'FullTime',isListed:true},
     {title:'Unlisted role',jobUrl:'https://jobs.ashbyhq.com/thndr/hidden',isListed:false}
   ]})};
 });
 assert.equal(calls.length,1);assert.match(calls[0],/api\.ashbyhq\.com\/posting-api\/job-board\/thndr/);
 assert.equal(rows.length,1);assert.equal(rows[0].source_filter_proof,'employer-public-board');
});
test('Workable official widget jobs are not prefiltered by the owner career field',async()=>{
 const entry={name:'Integrant',source_kind:'workable',source_url:'https://apply.workable.com/integrant/'};
 const rows=await monitor.workableBoard(entry,async url=>{
   assert.match(url,/apply\.workable\.com\/api\/v1\/widget\/accounts\/integrant/);
   return {ok:true,json:async()=>({jobs:[
     {title:'Senior Accountant',shortcode:'ACCT',location:{city:'Cairo',country:'Egypt'}},
     {title:'Junior Software Engineer',shortcode:'SWE',location:{city:'Cairo',country:'Egypt'}}
   ]})};
 });
 assert.equal(rows.length,2,'Company feed is not silently limited to AI or entry');
 assert.ok(rows.every(x=>x.source_filter_proof==='employer-public-board'));
});

test('official Lever field, seniority and internship facets are used by source query planner',async()=>{
 const entry={name:'Bosta',source_kind:'lever',source_url:'https://jobs.lever.co/Bosta'};
 const rows=[
 {title:'AI Engineering Intern',source_facets:{team:'Machine Learning',department:'AI & Machine Learning',
   commitment:'Internship',level:'Junior'}},
 {title:'HR Manager',source_facets:{team:'Human Resources',level:'Manager'}}
 ];
 const matched=monitor.supportedNativeFacets(rows,{
   career_levels:['internship','entry','junior'],role_families:['ai_ml']});
 assert.ok(matched.some(f=>f.parameter==='team'&&f.value==='Machine Learning'));
 assert.ok(matched.some(f=>f.parameter==='commitment'&&f.value==='Internship'));
 assert.ok(matched.some(f=>f.parameter==='level'&&f.value==='Junior'));
 assert.ok(!matched.some(f=>f.value==='Manager'));
 let requested='';
 const links=await monitor.leverFacetProof(entry,{parameter:'team',value:'Machine Learning'},async url=>{
   requested=url;return {ok:true,json:async()=>[{hostedUrl:'https://jobs.lever.co/Bosta/abc'}]};
 });
 assert.match(requested,/team=Machine%20Learning/);
 assert.equal(links.has('https://jobs.lever.co/Bosta/abc'),true);
});

test('overlapping source monitoring invocations use atomic row reservation',()=>{
 const source=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 assert.match(source,/FOR UPDATE SKIP LOCKED/);
 assert.match(source,/UPDATE public\.sj_native_watch_jobs AS queue/);
 assert.match(source,/attempted_at < now\(\)-interval '10 minutes'/);
});

test('subscribers are not silently dropped after an arbitrary first-100 cap',()=>{
 const source=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 assert.doesNotMatch(source,/LIMIT \$\{MAX_USERS\}/);
 assert.match(source,/ORDER BY MIN\(discovered_at\) ASC/);
 assert.match(source,/WHERE user_id=ANY\(\$1::uuid\[\]\)/);
 assert.match(source,/Lever board exceeds verified pagination cap/);
});

test('already queued notifications drain without any source scan',async()=>{
 const f=fixture();
 try{
  await f.run();
  const job=other('queued','Junior AI Engineer','Develop ML models');
  f.queue.set(job.url,{job_key:job.url,job_snapshot:{...job,qualification_status:'accepted'},status:'pending'});
  const requests=f.responses.length;
  const env={SECRETJ_ALERTS_ENABLED:'true',RESEND_API_KEY:'test',SECRETJ_EMAIL_FROM:'alerts@example.org'};
  const result=await monitor.deliverQueued(env,async(to,subject,body,config)=>{
    f.sent.push({to,subject,body});
    assert.match(config.IDEMPOTENCY_KEY,/^native-alert-[a-f0-9]{64}$/);
  });
  assert.equal(result.sent,1);
  assert.equal(f.responses.length,requests,'Outbox must not fetch employer boards');
  assert.equal(f.queue.get(job.url).status,'sent');
 }finally{f.finish();}
});
test('cron has standalone queue draining and source failures cannot suppress existing outbox',()=>{
 const source=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 const worker=fs.readFileSync('cloudflare/site/worker.mjs','utf8');
 assert.match(worker,/nativeMonitor\.deliverQueued\(env\)/);
 assert.ok(source.indexOf('const before=await deliverQueued')<source.indexOf('const result=await gather(env,fetchImpl);',source.indexOf('async function deliver(env')));
 assert.match(source,/w\.updated_at>=p\.updated_at/);
 assert.match(source,/job_snapshot->>'qualification_preference_signature'=\$2/);
 assert.match(source,/job_snapshot->>'source_catalog_stale' IS DISTINCT FROM 'true'/);
 assert.doesNotMatch(source,/DELETE FROM public\.sj_native_watch_jobs WHERE user_id=\$1/);
});
