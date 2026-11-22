'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const prefs=require('../dist/assets/secretj-job-preferences');
const career=require('../dist/assets/secretj-career-level');
const monitor=require('../lib/secretj/native-preference-monitor');
const preference={egypt_only:true,role_families:['ai_ml','software'],
 career_levels:['entry','internship'],max_experience_years:2,internships:false};
const job=(title,description='',company='VOIS')=>({title,description,company,
 location:'Cairo, Egypt',url:'https://jobs.vodafone.com/careers/job/1234'});
test('work experience company program needs occupational title match',()=>{
 assert.equal(career.match(job('Work Experience Programme - Software Engineering'),['internship']).match,true);
 assert.equal(prefs.isMatch(job('Work Experience Programme - HR Operations','Software development'),preference),false);
 assert.equal(prefs.isMatch(job('Work Experience Programme - Software Engineering'),preference),true);
});
test('never accept AI Sales as AI engineering purely from AI token',()=>{
 const selected={...preference,role_families:['ai_ml']};
 // Role's actual title explicitly contains SALES; this is a separate field.
 assert.equal(prefs.isMatch(job('AI Sales Executive'),selected),false);
});
test('scoped company program labels and exact category intersection',()=>{
 assert.equal(career.match(job('Explore Internship - Software Engineering'),['internship']).match,true);
 assert.equal(career.match(job('Tadarab - Software Engineering','','Deloitte'),['internship']).match,true);
 assert.equal(career.match(job('Tadarab - Software Engineering','','VOIS'),['internship']).match,false);
});
test('description cannot transform generic title into unrelated category',()=>{
 assert.equal(prefs.classify(job('Technology Analyst','Build ML models and backend APIs')).includes('ai_ml'),false);
 assert.equal(prefs.classify(job('HR Business Partner','We build machine learning software')).includes('ai_ml'),false);
});
test('model credentials do not change result or trigger calls',async()=>{
 const calls=[];
 const env={SECRETJ_AI_VERIFICATION_ENABLED:'true',AI:{run(){calls.push('model');throw Error('Forbidden');}}};
 const chosen=await monitor.qualifyJobs([
  job('Software Engineer Intern'),job('HR Intern'),job('Senior Software Engineer')
 ],{...preference,role_families:['software']},env);
 assert.equal(chosen.accepted.length,1);
 assert.equal(chosen.accepted[0].qualification_mode,'dictionary-title-v1');
 assert.equal(calls.length,0);
});
