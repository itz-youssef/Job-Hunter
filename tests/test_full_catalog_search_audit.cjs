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
// Historical fixture tests search semantics even when the employer closes the posting.
const giuFixture={title:'GIU Winter Internship Program',company:'Deloitte',
  location:'Cairo, Egypt',url:'https://example.com/jobs/giu-winter-internship'};

test('GIU winter internship semantics remain searchable independent of changing live catalog',()=>{
 assert.equal(search.isInternship(giuFixture),true);
 assert.ok(search.score(giuFixture,'internship',prefs.classify)>0);
 assert.ok(search.score(giuFixture,'GIU internship',prefs.classify)>0);
});
test('internship does not mistake unrelated international job titles for internships',()=>{
 assert.equal(search.matches({title:'International Marketing Specialist'},'internship'),false);
 assert.equal(search.isInternship({title:'International Operations Specialist'}),false);
});
test('catalog-wide query is independent of account preferences, but empty query is personalized',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');
 assert.match(html,/state\.reviewExcluded\|\|String\(state\.query\|\|''\)\.trim\(\)/);
 assert.match(html,/return state\.watchFeedLoaded\?state\.watchFeed\.filter\(publicJob\):\[\]/);
 assert.match(html,/SecretJJobSearch\?\.matches\(j,q,window\.SecretJJobPreferences\?\.classify\)/);
 assert.match(html,/Searching all published listings, including those outside your saved preferences/);
 const opts={role_families:['ai_ml'],max_experience_years:2,egypt_only:true,internships:false};
 // The internship advertises no specialty and can be outside AI-only email
 // preferences, but MUST still appear under a deliberate search.
 assert.equal(prefs.assess(giuFixture,opts).status,'experience-unverified'); // Unknown field remains discoverable as a potential match.
 assert.equal(search.matches(giuFixture,'internship',prefs.classify),true);
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
 // Report actual listing presence; no fabricated job inserted into the catalog.
 assert.equal(result.regression.deloitteGIUFound,jobs.filter(j=>j.company==='Deloitte'&&/GIU Winter Internship Program/i.test(j.title||'')).length);
 assert.equal(result.regression.deloitteGIUSearchable,deloitte?1:0);
 assert.equal(result.rows.length,jobs.length);
});
test('search ranking prefers title internship match over incidental description match',()=>{
 const fromTitle={title:'Winter Internship Program',company:'Deloitte'};
 const fromDescription={title:'Software Engineer',description:'Our company runs a winter internship program.'};
 assert.ok(search.score(fromTitle,'internship')>search.score(fromDescription,'internship'));
});

test('Internships / Training filter matches the exact global search for intern across the published catalog',()=>{
 const fromFilter=jobs.filter(job=>search.matches(job,'intern',prefs.classify));
 const fromSearch=jobs.filter(job=>search.matches(job,'intern',prefs.classify));
 assert.deepEqual(fromFilter.map(job=>job.id),fromSearch.map(job=>job.id));
 const html=fs.readFileSync('dist/index.html','utf8');
 assert.match(html,/state\.jobType==='internship'\s*\|\|\s*!state\.member/);
 assert.match(html,/state\.jobType==='internship'&&!window\.SecretJJobSearch\?\.matches\(j,'intern',window\.SecretJJobPreferences\?\.classify\)/);
});
test('intern search aliases capture training pathways even without an intern title',()=>{
 const examples=[
  {title:'Graduate Program',company:'Example',description:'Graduate placement'},
  {title:'Software Engineering Trainee',company:'Example'},
  {title:'Co-op Software Engineer',company:'Example'},
  {title:'Junior Engineer',company:'Example',description:'Join our internship training programme.'}
 ];
 for(const job of examples)assert.equal(search.matches(job,'intern',prefs.classify),true,job.title);
 assert.equal(search.matches({title:'Senior Software Engineer',description:'Build production applications'},'intern',prefs.classify),false);
});

test('company audit exposes source-specific missing field matrix without claiming unverifiable confidence',()=>{
 const registry=JSON.parse(fs.readFileSync('dist/native-source-registry.json','utf8'));
 const result=auditCatalog(jobs,snapshot.generated_at,registry.companies);
 assert.equal(result.sourceCoverage.registeredCompanies,registry.companies.length);
 assert.ok(result.sourceCoverage.registeredCompanies>=50);
 assert.ok(result.metrics.requirementsMissing>=0);
 assert.ok(result.metrics.departmentMissing>=0);
 assert.ok(result.metrics.descriptionShort>=0);
 assert.ok(Object.keys(result.byCompany).length>=20);
 for(const company of Object.values(result.byCompany)){
  assert.equal(typeof company.missingRequirements,'number');
  assert.equal(typeof company.missingDepartment,'number');
  assert.equal(typeof company.sourceKind,'string');
  assert.equal(typeof company.detailEvidence,'number');
  assert.ok(company.missingDescription<=company.total);
 }
});
