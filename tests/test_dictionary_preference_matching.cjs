'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const career=require('../dist/assets/secretj-career-level');
const prefs=require('../dist/assets/secretj-job-preferences');
const monitor=require('../lib/secretj/native-preference-monitor');
const filter={role_families:['software'],career_levels:['internship'],
  egypt_only:true,max_experience_years:null,internships:false};
const job=(title,company='Deloitte',other={})=>({
  title,company,location:'Cairo, Egypt',url:'https://example.com/jobs/1',...other
});
test('one complete title phrase is sufficient but substring is not',()=>{
  assert.equal(career.match(job('Software Engineering Intern'),['internship']).match,true);
  assert.equal(career.match(job('International Software Engineer'),['internship']).match,false);
  assert.equal(career.match(job('Software Engineering Internship'),['internship']).match,true);
});
test('internship AND occupational category both required',()=>{
  assert.equal(prefs.isMatch(job('Software Engineer Intern'),filter),true);
  assert.equal(prefs.isMatch(job('HR Intern'),filter),false);
  assert.equal(prefs.isMatch(job('Senior Software Engineer'),filter),false);
  assert.equal(prefs.isMatch(job('Backend Developer Intern'),filter),true);
  assert.equal(prefs.isMatch(job('Machine Learning Intern'),filter),false);
});
test('employer names are scoped and never imply an unrelated job family',()=>{
  assert.equal(career.match(job('Tadarab - Software Engineer','Deloitte'),['internship']).match,true);
  assert.equal(career.match(job('Tadarab - Software Engineer','IBM'),['internship']).match,false);
  assert.equal(prefs.isMatch(job('Tadarab HR','Deloitte'),filter),false);
});
test('technical lead versus lead generation, company brand context',()=>{
  assert.equal(career.match(job('Lead Generation Specialist'),['lead']).match,false);
  assert.equal(career.match(job('Tech Lead Software Engineer'),['lead']).match,true);
  assert.equal(career.match(job('Senior Software Engineer Intern'),['internship']).match,false);
});
test('no AI calls even if old strict AI verification enabled',async()=>{
  const input=job('Software Engineering Intern');
  const result=await monitor.qualifyJobs([input,job('Senior Software Engineer')],filter,{
    SECRETJ_AI_VERIFICATION_ENABLED:'true',
    AI:{run(){throw Error('Should never call AI');}}
  });
  assert.equal(result.accepted.length,1);
  assert.equal(result.accepted[0].qualification_mode,'dictionary-title-v1');
  assert.equal(result.rejected,1);
  assert.equal(result.aiCalls,0);
});
test('dictionary available before career matcher on all pages',()=>{
  for(const page of ['dist/index.html','dist/account.html']){
    const html=fs.readFileSync(page,'utf8');
    assert.ok(html.indexOf('secretj-career-dictionary.js')>=0);
    assert.ok(html.indexOf('secretj-career-dictionary.js')<html.indexOf('secretj-career-level.js'));
  }
});

test('Big4 associate trigger is employer-scoped, not globally applied',()=>{
 const assoc='Associate Cloud Engineer';
 assert.equal(career.match(job(assoc,'Deloitte'),['entry']).match,true);
 assert.equal(career.match(job(assoc,'NonBig4 Enterprises'),['entry']).match,false);
});
