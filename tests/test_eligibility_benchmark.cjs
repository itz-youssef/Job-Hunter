'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lab=require('../dist/assets/secretj-eligibility-lab');
const {evaluate}=require('../scripts/benchmark-eligibility.cjs');
const snapshot=JSON.parse(fs.readFileSync('dist/data.json','utf8'));
const ref=JSON.parse(fs.readFileSync('benchmarks/eligibility-manual-reference.json','utf8'));
test('five independent methods exist, rather than renaming the same method',()=>{
 assert.deepEqual(Object.keys(lab.methods),
  ['A_baseline','B_title_only','C_requirements_only','D_multi_evidence','E_uncertainty_first']);
 const j={title:'Junior Software Engineer',description:'Requirements: 0–2 years of experience'};
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
 const result=evaluate(snapshot.jobs,ref);
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
test('real-world advanced and junior cases are not incorrectly certified by uncertainty-first',()=>{
 const get=q=>snapshot.jobs.find(j=>q.test(j.title||''));
 const policy=lab.methods.E_uncertainty_first;
 const negative=[
  /Senior Software Engineer/i,
  /Principal Solution Architect/i,
  /AI Team Manager.*AI4ALL/i,
  /Full-Stack Engineer/i
 ];
 for(const name of negative){
  let j=get(name);assert.ok(j,String(name));
  if(/Full-Stack/.test(name.source))j=snapshot.jobs.find(x=>x.company==='mylo by B.TECH'&&/^Full-Stack Engineer$/i.test(x.title));
  assert.equal(policy(j).decision,'exclude',j.title);
 }
 for(const name of [/Junior Software Engineer, BRAIN/i,/Graduate In Training Program/i,/GIU Winter Internship Program/i]){
  const j=get(name);assert.ok(j,String(name));
  assert.equal(policy(j).decision,'include',j.title);
 }
});
test('unverified job is review, not treated as confirmed match',()=>{
 const o=lab.methods.E_uncertainty_first({title:'Software Engineer',description:''});
 assert.equal(o.decision,'review');
 assert.equal(o.evidence.confidence,'insufficient');
});
