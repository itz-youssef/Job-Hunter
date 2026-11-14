'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const prefs=require('../dist/assets/secretj-job-preferences');
const html=fs.readFileSync('dist/index.html','utf8');
const memberAlerts=fs.readFileSync('lib/secretj/member-alerts.js','utf8');
const cron=fs.readFileSync('cloudflare/site/wrangler.toml','utf8');

test('job feed roles are generated from saved profile career fields, not fixed historical options',()=>{
 assert.match(html,/function availableRoleOptions\(\)/);
 assert.match(html,/categories\.filter\(c=>selected\.includes\(c\.key\)\)/);
 assert.match(html,/roleOptions\.map\(c=>option\(c\.key,c\.label,state\.role\)\)/);
 assert.doesNotMatch(html,/option\('ai','AI \/ ML'/);
});

test('job badge updates on account hydration, filters, search and periodic snapshot refresh',()=>{
 assert.match(html,/state\.memberLoading\?'…'/);
 assert.match(html,/String\(filterJobs\(validJobs\(\)\)\.length\)/);
 assert.match(html,/memberLoading=false;syncFeedCount\(\);render\(\)/);
 assert.match(html,/syncFeedCount\(\);render\(\);/);
 assert.match(html,/if\(event\.target\.id==='job-search'\)[^\n]+syncFeedCount\(\)/);
});

test('date filters use employer posting dates instead of first detection',()=>{
 assert.match(html,/dateBasis:'posted'/);
 assert.match(html,/jobDateForFilter\(j\)/);
 assert.match(html,/state\.dateBasis==='firstseen'\?firstSeenDate\(j\):postedDate\(j\)/);
 assert.match(html,/\('6h','Past 6 hours'/);
 assert.match(html,/unknown dates are excluded from posted-date ranges/i);
 assert.match(html,/sortBy:'recent'/);
});

test('smart matching recognizes employer aliases and does not classify unrelated roles by description',()=>{
 assert.ok(prefs.classify({title:'API Engineer'}).includes('backend'));
 assert.ok(prefs.classify({title:'ETL Developer'}).includes('data_engineering'));
 assert.ok(prefs.classify({title:'Hiring Specialist'}).includes('talent_acquisition'));
 assert.ok(prefs.classify({title:'Security Operations Associate'}).includes('cybersecurity'));
 assert.ok(prefs.classify({title:'Technology Analyst',description:'Build REST APIs and microservices'}).includes('backend'));
 assert.deepEqual(prefs.classify({title:'HR Business Partner',description:'Our company develops AI software'}),['hr']);
 const chosen={role_families:['backend'],egypt_only:false,internships:false,max_experience_years:null};
 assert.equal(prefs.isMatch({title:'API Engineer',location:'Egypt'},chosen),true);
 assert.equal(prefs.isMatch({title:'HR Business Partner',description:'AI cloud python',location:'Egypt'},chosen),false);
});

test('verified member cron runs every five minutes and considers full public snapshot',()=>{
 assert.match(cron,/crons = \["\*\/5 \* \* \* \*"\]/);
 assert.match(memberAlerts,/MAX_RECIPIENTS=15/);
 assert.match(memberAlerts,/\.slice\(0,2500\)/);
 assert.match(memberAlerts,/p\.email_alerts=true AND v\.verified_at IS NOT NULL/);
 assert.match(memberAlerts,/ON CONFLICT\(user_id,job_key\)/);
});
