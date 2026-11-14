'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lab=require('../dist/assets/secretj-eligibility-lab');
const {evaluate}=require('../scripts/benchmark-eligibility.cjs');
const snapshot=JSON.parse(fs.readFileSync('dist/data.json','utf8'));
const ref=JSON.parse(fs.readFileSync('benchmarks/eligibility-manual-reference.json','utf8'));
const frozen=JSON.parse(fs.readFileSync('benchmarks/eligibility-reviewed-snapshot.json','utf8'));
test('six independent methods exist, rather than renaming the same method',()=>{
 assert.deepEqual(Object.keys(lab.methods),
  ['A_baseline','B_title_only','C_requirements_only','D_multi_evidence','E_uncertainty_first','F_constraint_aware']);
 const j={title:'Software Engineer',description:'No experience requirement stated'};
 assert.ok(new Set(Object.values(lab.methods).map(f=>f(j).decision)).size>=2);
});
test('reference is static, deduplicated and excludes ambiguous cases from truth',()=>{
 const all=[...ref.include,...ref.exclude,...ref.uncertain];
 assert.equal(new Set(all.map(r=>r.id)).size,all.length);
 assert.ok(ref.include.length>=25);
 assert.ok(ref.exclude.length>=35);
 assert.ok(ref.uncertain.length>=25);
});
test('every currently published job receives five method predictions',()=>{
 const result=evaluate(snapshot.jobs,ref,frozen.jobs);
 assert.equal(result.meta.totalJobs,snapshot.jobs.length);
 assert.equal(result.allRows.length,snapshot.jobs.length);
 assert.equal(result.methods.length,6);
 assert.equal(result.meta.referenceMissing,0);
 assert.equal(result.meta.referenceFound,ref.include.length+ref.exclude.length);
 for(const row of result.allRows){
  for(const name of Object.keys(lab.methods))
   assert.ok(['include','exclude','review'].includes(row[name]));
 }
});
test('frozen advanced and junior cases are tested without dependence on current scanner updates',()=>{
 const get=q=>frozen.jobs.find(j=>q.test(j.title||''));
 const policy=lab.methods.E_uncertainty_first;
 for(const name of [/Senior Software Engineer/i,/Principal Solution Architect/i,/Senior Backend Engineer/i]){
  const job=get(name);assert.ok(job,String(name));
  assert.equal(policy(job).decision,'exclude',job.title);
 }
 for(const name of [/Junior Software Engineer, BRAIN/i,/Graduate In Training Program/i]){
  const job=get(name);assert.ok(job,String(name));
  assert.equal(policy(job).decision,'include',job.title);
 }
 const olderMylo={
  title:'Full-Stack Engineer',
  description:'Requirements: 7+ years of professional experience as a software engineer'
 };
 assert.equal(policy(olderMylo).decision,'exclude');
});

test('unverified job is review, not treated as confirmed match',()=>{
 const o=lab.methods.E_uncertainty_first({title:'Software Engineer',description:''});
 assert.equal(o.decision,'review');
 assert.equal(o.evidence.confidence,'insufficient');
});

test('conjunctive requirements use strongest mandatory minimum, but OR pathways use easier one',()=>{
 const f=lab.methods.F_constraint_aware;
 assert.equal(f({title:'Civil Engineer',description:'Requirements: 5+ years of construction supervision experience, including at least 3 years on industrial projects and at least 2 years of direct site supervision experience.'}).decision,'exclude');
 assert.equal(f({title:'Product Engineer',description:"Qualifications: Bachelor's with 3+ years of relevant experience, or Master's with 2+ years of experience."}).decision,'include');
 assert.equal(f({title:'Software Engineer',description:'Requirements: 1+ years of customer support or 4+ years of stakeholder management experience.'}).decision,'include');
 assert.equal(f({title:'Junior Software Engineer',description:'Minimum 5 years of professional experience required.'}).decision,'exclude');
});

test('a two-to-five year professional range allows a two-year applicant',()=>{
 const x=lab.methods.F_constraint_aware({title:'Fullstack-AI Engineer',
  description:'Professional Experience 2-5 years of professional software engineering experience.'});
 assert.notEqual(x.decision,'exclude',JSON.stringify(x));
});
test('experience marked preferred is not an automatic exclusion',()=>{
 const x=lab.methods.F_constraint_aware({title:'Maintenance Technician',
  description:'Practical maintenance experience of 3 to 5 years in traction power supply or comparable electrical infrastructure is preferred.'});
 assert.notEqual(x.decision,'exclude',JSON.stringify(x));
});

test('production preference matcher uses the exact winning evidence decision for every reviewed job',()=>{
 const prefs=require('../dist/assets/secretj-job-preferences');
 const p={role_families:[],max_experience_years:2,egypt_only:false,internships:false};
 for(const job of frozen.jobs){
   const selected=lab.methods.F_constraint_aware(job);
   const live=prefs.assess(job,p);
   assert.equal(live.match,selected.decision!=='exclude',job.title);
   assert.equal(live.status,selected.decision==='exclude'?'excluded':
     selected.decision==='review'?'experience-unverified':'matched',job.title);
 }
});
test('real-world company history and preferred years never become proven hard requirements',()=>{
 const prefs=require('../dist/assets/secretj-job-preferences');
 const p={role_families:[],max_experience_years:2};
 for(const caseJob of [
  {title:'Maintenance Technician',description:'Experience of 3 to 5 years in infrastructure is preferred.'},
  {title:'Finance Analyst',description:'Our company has over 27 years of experience in offering consumer financing.'},
  {title:'Full Stack Engineer',description:'Requirements: 2-5 years of professional software engineering experience.'}
 ])assert.equal(prefs.assess(caseJob,p).match,true,caseJob.title);
});
test('browser and verified member emails both load the same selected core',()=>{
 const home=fs.readFileSync('dist/index.html','utf8');
 const account=fs.readFileSync('dist/account.html','utf8');
 const alerts=fs.readFileSync('lib/secretj/member-alerts.js','utf8');
 const core=require('../dist/assets/secretj-eligibility-core');
 assert.ok(typeof core.evaluate==='function');
 for(const page of [home,account]){
  const a=page.indexOf('/assets/secretj-eligibility-core.js?v=constraint-aware-f-1');
  const b=page.indexOf('/assets/secretj-job-preferences.js?v=constraint-aware-f-1');
  assert.ok(a>=0&&b>a,'core must execute before preferences');
 }
 assert.match(alerts,/const \{isMatch,hasFilters,assess\}=require/);
 assert.match(alerts,/POTENTIAL MATCH/);
 assert.match(home,/Needs review · experience not verified/);
});
