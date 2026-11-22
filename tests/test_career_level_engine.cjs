'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const levels=require('../dist/assets/secretj-career-level');
const preferences=require('../dist/assets/secretj-job-preferences');
const selected=(career_levels,role_families=['ai_ml'])=>({
 career_levels,role_families,internships:true,egypt_only:false,max_experience_years:2});
test('selected internship and entry roles match only explicit title triggers',()=>{
 const p=selected(['entry','internship']);
 for(const title of ['Machine Learning Intern','Junior AI Engineer',
   'Applied Scientist - Graduate Program']){
   assert.equal(preferences.isMatch({title,location:'Cairo'},p),true,title);
 }
 for(const title of ['AI Engineer','Senior AI Engineer','Lead Machine Learning Engineer']){
   assert.equal(preferences.isMatch({title,location:'Cairo'},p),false,title);
 }
});
test('all levels have deterministic precedence in source dictionary',()=>{
 for(const [title,expected] of [
  ['Senior Backend Developer','senior'],['Staff Data Engineer','senior'],
  ['Principal Software Engineer','senior'],['Engineering Manager','manager'],
  ['Director of Engineering','director'],['Chief Technology Officer','director'],
  ['Software Development Intern','internship'],['Junior QA Engineer','entry'],
  ['Mid-level Software Engineer','mid']
 ]){
  assert.equal(levels.evaluate({title}).level,expected,title);
 }
});
test('conflicting senior ATS and junior title do not pass early-career selection',()=>{
 const job={title:'Junior AI Engineer',seniority:'Senior',location:'Cairo'};
 const a=preferences.assess(job,selected(['entry','internship']));
 assert.equal(a.match,false);
});
test('ambiguous title without level is excluded only from personal matching',()=>{
 const job={title:'Technology Specialist',location:'Cairo'};
 assert.equal(preferences.assess(job,selected(['entry','internship'])).match,false);
 assert.equal(preferences.isMatch({title:'Junior Marketing Specialist',location:'Cairo'},selected(['entry'])),false);
});
test('legacy experience-only settings remain supported',()=>{
 assert.equal(preferences.isMatch({title:'Senior AI Engineer'},{role_families:['ai_ml'],max_experience_years:2}),false);
});
test('site and account both load dictionary before level and category rules',()=>{
 for(const page of ['dist/index.html','dist/account.html']){
  const html=fs.readFileSync(page,'utf8');
  assert.ok(html.indexOf('secretj-career-dictionary.js')<html.indexOf('secretj-career-level.js'));
  assert.ok(html.indexOf('secretj-career-level.js')<html.indexOf('secretj-job-preferences.js'));
 }
 const js=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 assert.match(js,/name="career_levels"/);
});
