'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const levels=require('../dist/assets/secretj-career-level');
const dictionary=require('../dist/assets/secretj-career-dictionary');
const preferences=require('../dist/assets/secretj-job-preferences');
const selected=(career_levels,role_families=['ai_ml'])=>({
 career_levels,role_families,internships:false,egypt_only:false,max_experience_years:null});
test('exactly the eight selectable dictionary categories appear as checkboxes',()=>{
 const sourceKeys=Object.keys(dictionary).filter(key=>key!=='negative_keywords_global');
 assert.deepEqual(levels.levels.map(x=>x.key),sourceKeys);
 const names=levels.levels.map(x=>x.label);
 assert.ok(names.includes('Junior'));
 assert.ok(names.includes('Senior / Staff / Principal'));
 assert.ok(names.includes('Director / Head / Executive / VP / C-level'));
});
test('each checkbox maps to exactly its authored dictionary title category',()=>{
 for(const [key,title] of [
  ['internship','Software Development Intern'],
  ['entry','Graduate Trainee Software Engineer'],
  ['junior','Junior Software Engineer'],
  ['mid','Mid-level Software Engineer'],
  ['senior','Senior Backend Developer'],
  ['senior','Staff Data Engineer'],
  ['senior','Principal Software Engineer'],
  ['lead','Tech Lead Software Engineer'],
  ['manager','Engineering Manager'],
  ['director_head_executive','Director of Engineering'],
  ['director_head_executive','Head of Engineering'],
  ['director_head_executive','Chief Technology Officer']
 ]){
  assert.equal(levels.evaluate({title}).level,key,title);
  assert.equal(levels.match({title},[key]).match,true,title);
 }
});
test('entry and junior are different selections in the authored dictionary',()=>{
 assert.equal(levels.match({title:'Junior Software Engineer'},['entry']).match,false);
 assert.equal(levels.match({title:'Graduate Software Engineer'},['junior']).match,false);
 assert.equal(levels.match({title:'Junior Software Engineer'},['junior']).match,true);
});
test('multiple selected checkboxes mean OR, and role fields are still AND',()=>{
 const j={title:'Junior AI Engineer',location:'Cairo'};
 assert.equal(preferences.isMatch(j,selected(['junior','internship'])),true);
 assert.equal(preferences.isMatch(j,selected(['entry','internship'])),false);
 assert.equal(preferences.isMatch({title:'Machine Learning Intern',location:'Cairo'},
  selected(['junior','internship'])),true);
 assert.equal(preferences.isMatch({title:'Junior Marketing Specialist',location:'Cairo'},
  selected(['junior'])),false);
 assert.equal(levels.match({title:'Senior AI Engineer'},['senior','junior']).match,true);
});
test('senior ATS label excludes junior-only title',()=>{
 assert.equal(preferences.isMatch({title:'Junior AI Engineer',seniority:'Senior',location:'Cairo'},
 selected(['junior','internship'])),false);
});
test('legacy saved director and executive keys remain backward-compatible',()=>{
 assert.equal(levels.match({title:'Director of Engineering'},['director']).match,true);
 assert.equal(levels.match({title:'Chief Technology Officer'},['executive']).match,true);
});
test('legacy experience-only settings remain supported',()=>{
 assert.equal(preferences.isMatch({title:'Senior AI Engineer'},
 {role_families:['ai_ml'],max_experience_years:2}),false);
});
test('both pages load the original dictionary before level and category matching',()=>{
 for(const page of ['dist/index.html','dist/account.html']){
  const html=fs.readFileSync(page,'utf8');
  assert.ok(html.indexOf('secretj-career-dictionary.js')<
    html.indexOf('secretj-career-level.js'));
  assert.ok(html.indexOf('secretj-career-level.js')<
    html.indexOf('secretj-job-preferences.js'));
 }
 assert.match(fs.readFileSync('dist/assets/secretj-account.js','utf8'),/name="career_levels"/);
});
