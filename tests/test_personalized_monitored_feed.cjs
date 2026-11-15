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
async function request(query,queryImpl){
  core.setQueryForTests(async(sql,args)=>{
    if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
      return [{id:UID,email:'member@example.com',is_active:true}];
    return queryImpl(sql,args);
  });
  let result={};
  const res={statusCode:200,setHeader(){},
    end(v){result=JSON.parse(v);}};
  try{await api({method:'GET',headers:{cookie:COOKIE},query},res);
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
       company:'A',url:'https://company.com/one'},status:'baseline',
       discovered_at:'2026-11-15'},
     {job_key:'https://company.com/two',job_snapshot:{title:'AI Internship',
       company:'B',url:'https://company.com/two'},status:'sent',
       discovered_at:'2026-11-16'}
   ];
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
   called=args;
   return [{job_key:'https://company.com/new',job_snapshot:{title:'AI Engineer'},
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
 assert.match(source,/if\(user\.email_eligible===true&&prefs\.hasFilters\(user\)\)/);
 assert.doesNotMatch(source,/WHERE u\.is_active=true AND p\.email_alerts=true/);
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
 assert.match(source,/if\(mailReady&&user\.email_eligible===true/);
 assert.doesNotMatch(source,/if\(!mailEnv\.RESEND_API_KEY\|\|!mailEnv\.SECRETJ_EMAIL_FROM\)return/);
});
