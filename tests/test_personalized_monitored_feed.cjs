'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const api=require('../api/secretj-native-status');
const monitor=require('../lib/secretj/native-preference-monitor');
const UID='e07bb2d6-a213-45d0-ab23-e5051967a616';
const COOKIE='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
async function request(query,queryImpl,env){
  core.setQueryForTests(async(sql,args)=>{
    if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
      return [{id:UID,email:'member@example.com',is_active:true}];
    return queryImpl(sql,args);
  });
  let result={};
  const res={statusCode:200,setHeader(){},
    end(v){result=JSON.parse(v);}};
  try{await (env?api.createHandler(env):api)({method:'GET',headers:{cookie:COOKIE},query},res);
    return {status:res.statusCode,result};
  }finally{core.setQueryForTests(null);}
}
test('personal feed includes baseline, new and already alerted jobs for the signed-in member only',async()=>{
 const sqlCalls=[];
 const {status,result}=await request({action:'feed',offset:'0'},(sql,args)=>{
   sqlCalls.push({sql,args});
   if(sql.includes('sj_native_watch_state'))return [{initialized_at:'2026-11-15',updated_at:'2026-11-16',
     preferences_current:true}];
   if(sql.includes('FROM public.sj_native_watch_jobs'))return [
     {job_key:'https://company.com/one',job_snapshot:{title:'Junior AI Engineer',
       company:'A',url:'https://company.com/one',qualification_status:'accepted'},status:'baseline',
       discovered_at:'2026-11-15'},
     {job_key:'https://company.com/two',job_snapshot:{title:'AI Internship',
       company:'B',url:'https://company.com/two',qualification_status:'accepted'},status:'sent',
       discovered_at:'2026-11-16'}
   ];
   if(sql.includes('FROM public.sj_preferences WHERE user_id=$1'))return [{
     role_families:['ai_ml'],career_levels:['entry','junior','internship'],egypt_only:false,
     max_experience_years:null,internships:false}];
   throw Error('Unexpected SQL');
 });
 assert.equal(status,200);assert.equal(result.ready,true);
 assert.equal(result.jobs.length,2);
 assert.deepEqual(result.jobs.map(j=>j.watch_status),['baseline','sent']);
 assert.ok(sqlCalls.every(x=>x.args[0]===UID),'All reads scoped to the authenticated member');
 assert.equal(result.next_offset,null);
});
test('feed is empty and explicitly initializing before first/current-preference monitoring pass',async()=>{
 const {result}=await request({action:'feed'},sql=>{
   if(sql.includes('sj_native_watch_state'))return [];
   throw Error('Stale/absent watches must not be loaded');
 });
 assert.equal(result.ready,false);assert.deepEqual(result.jobs,[]);
});
test('old personalized monitor results must not leak across preference changes',async()=>{
 const {result}=await request({action:'feed'},sql=>{
   if(sql.includes('sj_native_watch_state'))return [{preferences_current:false}];
   throw Error('Stale preference results must not be loaded');
 });
 assert.equal(result.ready,false);
});
test('feed pagination remains deterministic and rejects invalid offsets',async()=>{
 let called;
 const valid=await request({action:'feed',offset:'250'},(sql,args)=>{
   if(sql.includes('sj_native_watch_state'))return [{preferences_current:true}];
   if(sql.includes('FROM public.sj_preferences WHERE user_id=$1'))return [{
     role_families:[],career_levels:[],egypt_only:false,max_experience_years:null}];
   if(sql.includes('FROM public.sj_native_watch_jobs'))called=args;
   return [{job_key:'https://company.com/new',job_snapshot:{title:'AI Engineer',qualification_status:'accepted'},
     status:'pending',discovered_at:'2026-11-16'}];
 });
 assert.equal(valid.result.jobs.length,1);
 assert.deepEqual(called,[UID,251,250]);
 const bad=await request({action:'feed',offset:'-7'},sql=>
   sql.includes('sj_native_watch_state')?[{preferences_current:true}]:[]);
 assert.equal(bad.status,400);
});
test('website personal feed is sourced exclusively from the watch feed, with global catalog review and search',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');
 assert.match(html,/loadMatchingFeed\(userId,sequence\)/);
 assert.match(html,/\/api\/secretj-native-status\?action=feed&offset=/);
 assert.match(html,/return state\.watchFeedLoaded\?state\.watchFeed\.filter\(publicJob\):\[\]/);
 assert.match(html,/if\(state\.reviewExcluded\|\|String\(state\.query\|\|''\)\.trim\(\)\|\|/);
 assert.match(html,/const all=allPublicJobs\(\)/);
 assert.match(html,/The general catalog currently contains/);
 assert.match(html,/Review all detected jobs/);
});
test('personal monitoring subscribers do not require alert opt-in; only email dispatch does',()=>{
 const source=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 assert.match(source,/LEFT JOIN public\.sj_email_verifications/);
 assert.match(source,/email_eligible/);
 const subscribers=source.slice(source.indexOf('async function subscriptions('),source.indexOf('function matching('));
 assert.doesNotMatch(subscribers,/WHERE u\.is_active=true AND p\.email_alerts=true/);
 assert.match(source,/knownUsers\.filter\(u=>u\.email_eligible===true&&prefs\.hasFilters\(u\)\)/);
 const standalone=source.slice(source.indexOf('async function queuedSubscriptions('),source.indexOf('async function deliverQueued('));
 assert.match(standalone,/WHERE u\.is_active=true AND p\.email_alerts=true AND v\.verified_at IS NOT NULL/);
 assert.match(source,/rows\.filter\(u=>u\.id&&u\.email_eligible===true&&prefs\.hasFilters\(u\)\)/);
});
test('clear preferences still populate a complete monitoring feed, without mass emailing',()=>{
 const result=monitor.matching([
   {title:'Senior Engineer',url:'https://example.com/a'},
   {title:'Intern',url:'https://example.com/b'}
 ],{role_families:[],career_levels:[],max_experience_years:null,
    egypt_only:false,internships:false});
 assert.equal(result.length,2);
});

test('matching feed generation is not blocked by missing Resend credentials',()=>{
 const source=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 assert.match(source,/const mailReady=/);
 const queue=source.slice(source.indexOf('async function deliverQueued('),source.indexOf('async function deliver(env'));
 assert.match(queue,/if\(!mailReady\)return/);
 const discovery=source.slice(source.indexOf('async function deliver(env'));
 assert.match(discovery,/await gather\(env,fetchImpl\)/);
 assert.doesNotMatch(discovery,/if\(!mailReady\)return/);
 assert.doesNotMatch(source,/if\(!mailEnv\.RESEND_API_KEY\|\|!mailEnv\.SECRETJ_EMAIL_FROM\)return/);
});

test('personalized feed never exposes catalog candidates that bypass server validation',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');
 assert.match(html,/return state\.watchFeedLoaded\?state\.watchFeed\.filter\(publicJob\):\[\]/);
 assert.doesNotMatch(html,/watch_status:'provisional'/);
 assert.match(html,/Your personalized feed only shows jobs accepted by the configured verification pipeline/);
});

test('legacy watch data is not treated as qualified until revalidated against stored preferences',async()=>{
 const rows=[
  {job_key:'https://example.com/senior',job_snapshot:{
   title:'Senior AI Engineer',location:'Cairo, Egypt',company:'Example',
   url:'https://example.com/senior'},status:'baseline'},
  {job_key:'https://example.com/junior',job_snapshot:{
   title:'Junior AI Engineer',location:'Cairo, Egypt',company:'Example',
   url:'https://example.com/junior'},status:'baseline'}
 ];
 const p={role_families:['ai_ml'],career_levels:['entry','junior','internship'],
   egypt_only:true,internships:false,max_experience_years:2};
 const query=sql=>{
   if(sql.includes('sj_native_watch_state'))return [{preferences_current:true}];
   if(sql.includes('FROM public.sj_native_watch_jobs'))return rows;
   if(sql.includes('FROM public.sj_preferences WHERE user_id'))return [p];
   throw Error('Unexpected SQL: '+sql);
 };
 const enabled=await request({action:'feed'},query,{SECRETJ_AI_VERIFICATION_ENABLED:'false'});
 assert.deepEqual(enabled.result.jobs.map(j=>j.title),['Junior AI Engineer']);
 assert.equal(enabled.result.jobs[0].qualification_mode,'dictionary-title-v1');
 const strict=await request({action:'feed'},query,{SECRETJ_AI_VERIFICATION_ENABLED:'true'});
 assert.deepEqual(strict.result.jobs.map(j=>j.title),['Junior AI Engineer'], 'The old AI environment toggle is ignored');
});

test('strict AI feed exposes ONLY actual ai-reviewed results, never historical rules-only accepted records',async()=>{
 const records=[
  {job_key:'https://example.com/rules',job_snapshot:{title:'Junior AI Engineer',
    url:'https://example.com/rules',qualification_status:'accepted',qualification_mode:'rules-only'},
    status:'baseline',discovered_at:'2026-11-16'},
  {job_key:'https://example.com/ai',job_snapshot:{title:'Junior AI Engineer',
    url:'https://example.com/ai',qualification_status:'accepted',qualification_mode:'ai-reviewed'},
    status:'baseline',discovered_at:'2026-11-16'}
 ];
 const sql=statement=>{
   if(statement.includes('sj_native_watch_state'))return [{preferences_current:true}];
   if(statement.includes('FROM public.sj_native_watch_jobs'))return records;
   if(statement.includes('FROM public.sj_preferences WHERE user_id=$1'))return [{
     role_families:['ai_ml'],career_levels:['junior'],egypt_only:false,max_experience_years:null}];
   throw Error('Unexpected SQL: '+statement);
 };
 const strict=await request({action:'feed'},sql,{SECRETJ_AI_VERIFICATION_ENABLED:'true'});
 assert.equal(strict.status,200);
 assert.deepEqual(strict.result.jobs.map(x=>x.url),['https://example.com/rules','https://example.com/ai']);
 const simple=await request({action:'feed'},sql,{SECRETJ_AI_VERIFICATION_ENABLED:'false'});
 assert.equal(simple.result.jobs.length,2);
});
test('subscriber queue has no AI provenance gate',()=>{
 const src=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 assert.doesNotMatch(src,/job_snapshot->>'qualification_mode'='ai-reviewed'/);
 assert.doesNotMatch(src,/qualification\.aiReview\(/);
 assert.match(src,/job_snapshot->>'qualification_status'='accepted'/);
});

test('Senior-only preference returns qualifying baseline jobs through feed API',async()=>{
 const rows=[
  {job_key:'https://example.com/senior',job_snapshot:{
   title:'Senior Software Engineer',company:'Example',location:'Cairo, Egypt',
   url:'https://example.com/senior',qualification_status:'accepted',
   qualification_mode:'dictionary-title-v1'},status:'baseline'},
  {job_key:'https://example.com/intern',job_snapshot:{
   title:'Software Engineering Intern',company:'Example',location:'Cairo, Egypt',
   url:'https://example.com/intern',qualification_status:'accepted',
   qualification_mode:'dictionary-title-v1'},status:'baseline'}
 ];
 const pref={role_families:[],career_levels:['senior'],egypt_only:true,
   max_experience_years:null,internships:false};
 const {status,result}=await request({action:'feed'},(sql)=>{
  if(sql.includes('sj_native_watch_state'))return [{preferences_current:true}];
  if(sql.includes('FROM public.sj_native_watch_jobs'))return rows;
  if(sql.includes('FROM public.sj_preferences WHERE user_id=$1'))return [pref];
  throw Error('Unexpected SQL: '+sql);
 });
 assert.equal(status,200);
 assert.equal(result.ready,true);
 assert.deepEqual(result.jobs.map(j=>j.title),['Senior Software Engineer']);
});

test('isolated feed has identical output and authoritative fallback on a missing version',async()=>{
 const isolated=require('../lib/secretj/isolated-read-routing');
 const env={SECRETJ_JOB_HUNTER_ISOLATED_READS:'true',JOB_HUNTER_DATABASE_URL:'postgresql://test:test@ep-soft-cloud-bgoaznc6.c-9.eu-central-1.aws.neon.tech/neondb'};
 const job={title:'Junior AI Engineer',company:'A',location:'Cairo, Egypt',url:'https://example.com/job'};
 const row={job_key:job.url,status:'baseline',discovered_at:'2026-11-16',sent_at:null};
 let fullReads=0,metaReads=0,remoteReads=0;
 const sql=(q,args)=>{
  assert.equal(args[0],UID);
  if(q.includes('sj_native_watch_state'))return [{preferences_current:true}];
  if(q.includes('record_digest')){metaReads++;return [{...row,record_digest:'a'.repeat(64)}];}
  if(q.includes('FROM public.sj_native_watch_jobs')){fullReads++;return [{...row,job_snapshot:job}];}
  if(q.includes('FROM public.sj_preferences'))return [{role_families:[],career_levels:[],egypt_only:false,max_experience_years:null,internships:false}];
  throw Error('Unexpected query');
 };
 try{
  const baseline=await request({action:'feed'},sql,{...env,SECRETJ_JOB_HUNTER_ISOLATED_READS:'false'});
  assert.equal(baseline.status,200);assert.equal(baseline.result.jobs.length,1);
  isolated.setQueryForTests(async(service,q,args)=>{remoteReads++;assert.equal(args[1],UID);return [{record_digest:'a'.repeat(64),job_key:job.url,job_snapshot:job}];});
  const hit=await request({action:'feed'},sql,env);assert.deepEqual(hit,baseline);
  assert.equal(fullReads,1);assert.equal(metaReads,1);assert.equal(remoteReads,1);
  isolated.setQueryForTests(async()=>[]);
  const miss=await request({action:'feed'},sql,env);assert.deepEqual(miss,baseline);
  assert.equal(fullReads,2);assert.equal(metaReads,2);
 }finally{isolated.setQueryForTests(null);}
});
