'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const levels=require('../dist/assets/secretj-career-level');
const preferences=require('../dist/assets/secretj-job-preferences');
const experience=require('../dist/assets/secretj-eligibility-core');
const selected=(career_levels,role_families=['ai_ml'])=>({career_levels,role_families,internships:true,egypt_only:false,max_experience_years:2});
test('entry and internship union is inclusive and ignores legacy exclusive internship switch',()=>{
 const p=selected(['entry','internship']);
 const cases=[
   {title:'Machine Learning Intern',location:'Cairo',description:'Build computer vision models.'},
   {title:'Junior AI Engineer',location:'Cairo',description:'0–2 years of experience.'},
   {title:'AI Engineer',location:'Cairo',description:'Requirements: 1 year of professional experience.'},
   {title:'Applied Scientist - Graduate Program',location:'Cairo',description:'ML engineering.'}
 ];
 for(const job of cases)assert.equal(preferences.isMatch(job,p),true,job.title);
 assert.equal(preferences.isMatch({title:'Senior AI Engineer',location:'Cairo'},p),false);
 assert.equal(preferences.isMatch({title:'Lead Machine Learning Engineer',location:'Cairo'},p),false);
 assert.equal(preferences.isMatch({title:'AI Engineer',description:'Requirements: minimum 5 years of experience.'},p),false);
});
test('same shared matcher handles senior lead manager and advanced career tracks',()=>{
 for(const [title,level] of [
  ['Senior Backend Developer','senior'],
  ['Staff Data Engineer','lead'],
  ['Principal Software Engineer','lead'],
  ['Engineering Manager','manager'],
  ['Director of Engineering','director'],
  ['Chief Technology Officer','executive'],
  ['Software Development Intern','internship'],
  ['Junior QA Engineer','entry'],
  ['Mid-level Software Engineer','mid']
 ]){
   const job={title,location:'Cairo'};
   assert.equal(levels.evaluate(job,experience).level,level,title);
   assert.equal(preferences.isMatch(job,selected([level],[])),true,title);
 }
});
test('contradictory ATS level and title are potential not confirmed',()=>{
 const job={title:'Junior AI Engineer',seniority:'Senior',location:'Cairo',description:'Build ML systems'};
 const assessment=preferences.assess(job,selected(['entry','internship']));
 assert.equal(assessment.match,true);
 assert.equal(assessment.status,'experience-unverified');
 assert.equal(levels.evaluate(job,experience).conflict,true);
});
test('ambiguous titles and missing descriptions do not vanish silently',()=>{
 const job={title:'Technology Specialist',location:'Cairo'};
 const a=preferences.assess(job,selected(['entry','internship']));
 assert.equal(a.match,true);
 assert.equal(a.status,'experience-unverified');
 assert.match(a.evidence.join(' '),/Career field unavailable or ambiguous/);
});
test('explicitly unrelated fields stay excluded; unclassified is not misrepresented as confirmed',()=>{
 const p=selected(['entry','internship']);
 assert.equal(preferences.isMatch({title:'Junior Marketing Specialist',location:'Cairo'},p),false);
 const unclear=preferences.assess({title:'Analyst',location:'Cairo'},p);
 assert.equal(unclear.status,'experience-unverified');
});
test('required years over two without title is not a confirmed entry-level job',()=>{
 const job={title:'AI Engineer',description:'Requirements: minimum 6 years of experience.'};
 assert.equal(preferences.isMatch(job,selected(['entry','internship'])),false);
});
test('legacy preferences remain unchanged when career levels are unset',()=>{
 assert.equal(preferences.isMatch({title:'Junior AI Engineer'},{
  role_families:['ai_ml'],internships:true,max_experience_years:null
 }),false);
});
test('site loads level resolver before matching bundle and account supports selection',()=>{
 const home=fs.readFileSync('dist/index.html','utf8');
 const account=fs.readFileSync('dist/account.html','utf8');
 const js=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 const api=fs.readFileSync('api/secretj-data.js','utf8');
 const mail=fs.readFileSync('lib/secretj/member-alerts.js','utf8');
 assert.ok(home.indexOf('secretj-career-level.js')<home.indexOf('secretj-job-preferences.js'));
 assert.ok(account.indexOf('secretj-career-level.js')<account.indexOf('secretj-job-preferences.js'));
 assert.match(js,/name="career_levels"/);
 assert.match(js,/career_levels:\[\.\.\.form\.querySelectorAll/);
 assert.match(api,/career_levels=EXCLUDED.career_levels/);
 assert.match(mail,/p.career_levels/);
});
