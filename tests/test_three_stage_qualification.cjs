'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const gates=require('../lib/secretj/three-stage-qualification');
const monitor=require('../lib/secretj/native-preference-monitor');
const p={egypt_only:true,role_families:['ai_ml','software'],
 career_levels:['entry','junior','internship'],max_experience_years:null,internships:false};
const job=title=>({title,company:'Example',location:'Cairo, Egypt',
 url:'https://example.com/jobs/'+encodeURIComponent(title)});
test('dictionary gate excludes senior titles and unrelated fields',()=>{
 for(const title of ['Senior AI Engineer','Staff Software Engineer',
   'Lead Machine Learning Engineer','HR Intern'])
   assert.equal(gates.reject(job(title),p).ok,false,title);
 for(const title of ['Junior AI Engineer','Software Engineer Intern'])
   assert.equal(gates.reject(job(title),p).ok,true,title);
});
test('model functions are absent from compatibility gate',()=>{
 assert.equal(typeof gates.aiReview,'undefined');
 assert.equal(typeof gates.parseOutput,'undefined');
});
test('both monitoring paths qualify without AI before storing or sending',()=>{
 const code=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 assert.match(code,/await qualifyJobs\(selected,latest\[0\],env,fetchImpl\)/);
 assert.match(code,/await qualifyJobs\(selected,user\)/);
 assert.match(code,/await reservePeriodic\(users,result\.jobs\)/);
 assert.match(code,/jobs:watchPayload\(sig,verified\.accepted\)/);
 assert.match(code,/qualification_status'='accepted'/);
 assert.doesNotMatch(code,/qualification\.aiReview\(/);
 assert.doesNotMatch(code,/sj_ai_qualification_cache/);
});
test('strict AI environment setting cannot suppress matching titles',async()=>{
 const candidate=job('Software Engineer Intern');
 const result=await monitor.qualifyJobs([candidate,job('Senior Software Engineer')],p,{
   SECRETJ_AI_VERIFICATION_ENABLED:'true',
   AI:{run(){throw Error('Do not call AI');}}
 });
 assert.equal(result.accepted.length,1);
 assert.equal(result.accepted[0].qualification_mode,'dictionary-title-v1');
 assert.equal(result.rejected,1);
 assert.equal(result.aiCalls,0);
});
test('baseline and sent status are preserved during dictionary migration',()=>{
 const code=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 assert.match(code,/ON CONFLICT\(user_id,job_key\) DO UPDATE SET/);
 assert.match(code,/WHEN public\.sj_native_watch_jobs\.status='sent' THEN 'sent'/);
 assert.match(code,/ELSE public\.sj_native_watch_jobs\.status END/);
 assert.match(code,/THEN 'baseline' ELSE 'pending' END/);
 assert.match(code,/IS DISTINCT FROM 'dictionary-title-v1'/);
});
