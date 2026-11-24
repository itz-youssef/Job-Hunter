'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const search=require('../dist/assets/secretj-job-search');
const prefs=require('../dist/assets/secretj-job-preferences');
const levels=require('../dist/assets/secretj-career-level');
const home=fs.readFileSync('dist/index.html','utf8');
const header=fs.readFileSync('dist/assets/secretj-home.js','utf8');
const companies=JSON.parse(fs.readFileSync('companies.json','utf8'));
const registry=JSON.parse(fs.readFileSync('dist/native-source-registry.json','utf8'));
test('back-and-forth tab focus does not trigger immediate expensive account hydration',()=>{
 assert.match(home,/const TAB_SYNC_MIN_MS=120000/);
 assert.match(home,/if\(memberSyncRunning\|\|document\.hidden\)return/);
 assert.match(home,/Date\.now\(\)-lastMemberSyncAt<TAB_SYNC_MIN_MS/);
 assert.match(home,/const preferencesChanged=changed\|\|previousPrefs!==/);
 assert.match(home,/if\(preferencesChanged\)\{/);
 assert.match(home,/if\(document\.hidden\)return/);
 assert.match(header,/const ACCOUNT_REFRESH_TTL_MS=120000/);
 assert.match(header,/if\(accountChanged\|\|force\)await loadAvatar/);
});
test('typing schedules work without synchronous full rerenders or sorting twice',()=>{
 const handler=home.slice(home.indexOf("document.addEventListener('input',event=>{"),
  home.indexOf("document.addEventListener('submit',async event=>"));
 assert.match(handler,/clearTimeout\(searchTimer\)/);
 assert.match(handler,/searchTimer=setTimeout/);
 assert.match(handler,/\},440\)/);
 assert.doesNotMatch(handler,/syncFeedCount\(\);render\(\);/);
 assert.match(home,/const prepared=new WeakMap|const lastResults=\{/);
 assert.match(home,/if\(lastResults\.list===list&&lastResults\.key===cacheKey\)return lastResults\.value/);
 assert.match(home,/if\(source&&source===dedupSnapshot&&dedupPublic\)return dedupPublic/);
});
test('search results retain multi-term matching, internship aliases and ranking',()=>{
 const rows=[
  {title:'Software Engineer Intern',company:'Blink22',location:'Alexandria, Egypt',url:'https://example.com/1'},
  {title:'Senior Software Engineer',company:'Example',location:'Cairo, Egypt',url:'https://example.com/2'},
  {title:'QA Tester',company:'Demo',location:'Cairo, Egypt',url:'https://example.com/3'},
  {title:'Backend Developer',company:'Sample',location:'Giza, Egypt',url:'https://example.com/4'}
 ];
 const classification=prefs.classify;
 for(let i=0;i<5;i++){
  assert.equal(search.matches(rows[0],'software engineer intern',classification),true);
  assert.equal(search.matches(rows[0],'blink22 intern',classification),true);
  assert.equal(search.matches(rows[0],'software senior',classification),false);
  assert.equal(search.matches(rows[0],'internship',classification),true);
  assert.equal(search.matches(rows[3],'backend',classification),true);
  assert.equal(search.matches(rows[2],'software intern',classification),false);
 }
 assert.ok(search.score(rows[0],'software engineer intern',classification)>
   search.score(rows[1],'software engineer intern',classification));
});
test('Software Engineer Intern matches existing dictionary, not a new regex',()=>{
 const job={title:'Software Engineer Intern',company:'Blink22',location:'Alexandria, Egypt',
  url:'https://blink22.com/careers/j/TEST/'};
 const pref={career_levels:['internship'],role_families:['software'],
  egypt_only:true,internships:false,max_experience_years:null};
 assert.equal(levels.evaluate(job).level,'internship');
 assert.ok(prefs.classify(job).includes('software'));
 assert.equal(prefs.isMatch(job,pref),true);
});
test('Blink22 uses its live employer career listing rather than the empty Workable board',()=>{
 const entry=companies.find(x=>x.name==='Blink22');
 const source=registry.companies.find(x=>x.name==='Blink22');
 assert.equal(entry.url,'https://apply.workable.com/blink22-3/');
 assert.equal(source.source_kind,'blink22_egypt');
 assert.equal(source.source_url,entry.url);
 assert.equal(source.preference_mode,'internal-fallback');
 assert.equal(source.supports_employer_side_filter,false);
});
