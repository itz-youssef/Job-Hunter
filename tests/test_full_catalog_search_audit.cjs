'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const search=require('../dist/assets/secretj-job-search');
const prefs=require('../dist/assets/secretj-job-preferences');
const {auditCatalog}=require('../scripts/audit-job-catalog.cjs');
const snapshot=JSON.parse(fs.readFileSync('dist/data.json','utf8'));
const jobs=snapshot.jobs;
const deloitte=jobs.find(j=>j.company==='Deloitte'&&/GIU Winter Internship Program/i.test(j.title||''));

test('GIU winter internship is in current snapshot and globally searchable by internship',()=>{
 assert.ok(deloitte,'The Deloitte GIU internship must exist in the published catalog');
 assert.equal(search.isInternship(deloitte),true);
 assert.ok(search.score(deloitte,'internship',prefs.classify)>0);
 assert.ok(search.score(deloitte,'GIU internship',prefs.classify)>0);
});
test('internship does not mistake unrelated international job titles for internships',()=>{
 assert.equal(search.matches({title:'International Marketing Specialist'},'internship'),false);
 assert.equal(search.isInternship({title:'International Operations Specialist'}),false);
});
test('catalog-wide query is independent of account preferences, but empty query is personalized',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');
 assert.match(html,/if\(state\.reviewExcluded \|\| String\(state\.query\|\|''\)\.trim\(\) \|\| !state\.member/);
 assert.match(html,/SecretJJobSearch\?\.matches\(j,q,window\.SecretJJobPreferences\?\.classify\)/);
 assert.match(html,/Searching all published listings, including those outside your saved preferences/);
 const opts={role_families:['ai_ml'],max_experience_years:2,egypt_only:true,internships:false};
 // The internship advertises no specialty and can be outside AI-only email
 // preferences, but MUST still appear under a deliberate search.
 assert.equal(prefs.isMatch(deloitte,opts),false);
 assert.equal(search.matches(deloitte,'internship',prefs.classify),true);
});
test('all discovered explicit internship posts are searchable',()=>{
 const candidates=jobs.filter(search.isInternship);
 assert.ok(candidates.length>=15,'Expected internship coverage');
 const missed=candidates.filter(j=>!search.matches(j,'internship',prefs.classify));
 assert.deepEqual(missed.map(j=>j.title),[]);
});
test('every published job can be found via its title',()=>{
 const missed=jobs.filter(j=>!search.matches(j,j.title||'',prefs.classify));
 assert.deepEqual(missed.map(j=>j.title),[]);
});
test('audit covers every job and compares matching against explanation',()=>{
 const result=auditCatalog(jobs,snapshot.generated_at);
 assert.equal(result.totalReviewed,jobs.length);
 assert.ok(result.totalReviewed>=1000);
 assert.equal(result.metrics.searchUnreachable,0);
 assert.equal(result.metrics.matchExplanationDisagreement,0);
 assert.equal(result.regression.deloitteGIUFound,1);
 assert.equal(result.regression.deloitteGIUSearchable,1);
 assert.equal(result.rows.length,jobs.length);
});
test('search ranking prefers title internship match over incidental description match',()=>{
 const fromTitle={title:'Winter Internship Program',company:'Deloitte'};
 const fromDescription={title:'Software Engineer',description:'Our company runs a winter internship program.'};
 assert.ok(search.score(fromTitle,'internship')>search.score(fromDescription,'internship'));
});
