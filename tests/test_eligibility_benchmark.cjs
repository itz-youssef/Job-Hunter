'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lab=require('../dist/assets/secretj-eligibility-lab');
const {evaluate}=require('../scripts/benchmark-eligibility.cjs');
const snapshot=JSON.parse(fs.readFileSync('dist/data.json','utf8'));
const ref=JSON.parse(fs.readFileSync('benchmarks/eligibility-manual-reference.json','utf8'));
const frozen=JSON.parse(fs.readFileSync('benchmarks/eligibility-reviewed-snapshot.json','utf8'));
test('five independent methods exist, rather than renaming the same method',()=>{
 assert.deepEqual(Object.keys(lab.methods),
  ['A_baseline','B_title_only','C_requirements_only','D_multi_evidence','E_uncertainty_first']);
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
 assert.equal(result.methods.length,5);
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
