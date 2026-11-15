'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8');
const pref=require('../dist/assets/secretj-job-preferences');
const from=html.indexOf('  // A discoverable public vacancy is not necessarily a personal match.');
const to=html.indexOf('  // Only employer-published dates',from);
assert(from>=0&&to>from,'Expected public and personalized feed helpers');
const code=html.slice(from,to);
const sandbox={
 scoreOf:j=>Number(j.match_score??j.score??0)||0,
 titleOf:j=>j.title||'',
 companyOf:j=>j.company||'',
 locationOf:j=>j.location||'',
 jobKey:j=>String(j.id||j.title),
 jobURL:j=>String(j.url||'').startsWith('https://')?j.url:'#',
 jobs:()=>sandbox.rows||[],
 state:{member:null,memberPrefsConfigured:false,memberPrefs:null,watchFeed:[],watchFeedLoaded:false,query:'',reviewExcluded:false,jobType:'all'},
 window:{SecretJJobPreferences:pref},
 Date
};
vm.createContext(sandbox);
vm.runInContext(code+';this.api={publicJob,allPublicJobs,validJobs};',sandbox);
const {publicJob,validJobs}=sandbox.api;
const rows=[
 {id:1,title:'Senior AI Manager',score:0,matched:false,url:'https://company.example/role/1',location:'Cairo, Egypt'},
 {id:2,title:'Software Engineer Intern',score:8,matched:true,url:'https://company.example/role/2',location:'Cairo, Egypt'},
 {id:3,title:'Commercial Sales Specialist',score:0,matched:false,url:'https://company.example/role/3',location:'Cairo, Egypt'},
 {id:4,title:'HR Associate',score:0,matched:false,url:'https://company.example/role/4',location:'Cairo, Egypt'}
];
test('anonymous visitors see all genuine discovered jobs, including non-tech and senior',()=>{
 sandbox.rows=rows;sandbox.state.member=null;sandbox.state.memberPrefsConfigured=false;
 assert.equal(validJobs().length,4);
});
test('registered members without preferences see the same complete public catalog',()=>{
 sandbox.rows=rows;sandbox.state.member={id:'user'};sandbox.state.memberPrefsConfigured=false;
 assert.equal(validJobs().length,4);
});
test('after saving preferences the feed uses matching native watch records, including baseline',()=>{
 sandbox.rows=rows;sandbox.state.member={id:'user'};sandbox.state.memberPrefsConfigured=true;
 sandbox.state.memberPrefs={role_families:['software'],egypt_only:true,internships:true};
 sandbox.state.watchFeed=[{...rows[1],watch_status:'baseline'}];sandbox.state.watchFeedLoaded=true;
 assert.deepEqual(Array.from(validJobs(),j=>j.id),[2]);
 sandbox.state.reviewExcluded=true;assert.equal(validJobs().length,4);
 sandbox.state.reviewExcluded=false;sandbox.state.query='intern';assert.equal(validJobs().length,4);
 sandbox.state.query='';sandbox.state.watchFeedLoaded=false;assert.equal(validJobs().length,0);
});
test('invalid links and duplicate listings are not public jobs',()=>{
 sandbox.state.member=null;sandbox.state.memberPrefsConfigured=false;
 sandbox.rows=[rows[0],{...rows[0],id:5},{id:6,title:'Bad',url:'javascript:alert(1)'}];
 assert.equal(validJobs().length,1);
 assert.equal(publicJob({title:'No link'}),false);
});
test('new web app loads dedicated preference matcher and distinguishes configured status',()=>{
 assert.match(html,/secretj-job-preferences\.js/);
 assert.match(html,/memberPrefsConfigured=value\(5\)\?\.configured===true/);
 assert.match(html,/Explore all available jobs/);
 assert.match(html,/All detected opportunities/);
});
test('employer publishing dates never fall back to discovery timestamps',()=>{
 const rest=html.slice(to,html.indexOf('  function sourceItems()',to));
 vm.runInContext(rest+';this.dates={postedDate,firstSeenDate};',sandbox);
 assert.equal(sandbox.dates.postedDate({detected:'2026-11-12T18:38:57Z'}),'');
 assert.equal(sandbox.dates.firstSeenDate({detected:'2026-11-12T18:38:57Z'}),'2026-11-12T18:38:57Z');
});

test('the same full job listing is shown once despite distinct IDs and tracking URLs',()=>{
 sandbox.state.member=null;sandbox.state.memberPrefsConfigured=false;
 const description='A detailed IBM Consulting advertisement describing the same technical responsibilities, engineering requirements and working conditions for this exact vacancy.';
 sandbox.rows=[
  {id:'custom-1',title:'Data Engineer-Data Integration',company:'IBM',location:'Giza, EG',description,url:'https://ibm.example/job/100?source=one'},
  {id:'custom-2',title:'Data Engineer - Data Integration',company:'IBM',location:'Giza, EG',description,url:'https://ibm.example/job/100?source=two'},
  {id:'custom-3',title:'Data Engineer-Data Integration',company:'IBM',location:'Giza, EG',description,url:'https://ibm.example/job/100?source=three'}
 ];
 assert.equal(validJobs().length,1);
});
test('different vacancies sharing a title are preserved when their requirements differ',()=>{
 sandbox.state.member=null;sandbox.state.memberPrefsConfigured=false;
 const base={title:'Data Engineer',company:'IBM',location:'Giza, EG'};
 sandbox.rows=[
  {...base,id:1,url:'https://ibm.example/job/101',description:'Role one requires extensive SQL data modelling, ETL pipelines, cloud storage and warehouse transformation experience.'},
  {...base,id:2,url:'https://ibm.example/job/102',description:'Role two requires Kafka streaming infrastructure, Python services, realtime processing, Spark deployments and distributed observability.'},
  {...base,id:3,url:'https://ibm.example/job/103',description:''}
 ];
 assert.equal(validJobs().length,3);
});

test('search input is debounced rather than synchronously rendering the entire page',()=>{
 assert.match(html,/clearTimeout\(searchTimer\);\s*searchTimer=setTimeout\(/);
 assert.match(html,/if\(!field\.isConnected \|\| field\.value!==value\)return/);
 assert.match(html,/\},250\);/);
 const handler=html.slice(html.indexOf("document.addEventListener('input',event=>{"),html.indexOf("document.addEventListener('submit',async event=>"));
 assert.doesNotMatch(handler,/syncFeedCount\(\);render\(\);/);
});
test('feed renders only a bounded number of job cards and offers load more',()=>{
 assert.match(html,/const FEED_PAGE_SIZE=40/);
 assert.match(html,/const visible=list\.slice\(0,state\.feedLimit\)/);
 assert.match(html,/visible\.map\(jobCard\)/);
 assert.match(html,/data-load-more-jobs/);
 assert.match(html,/state\.feedLimit\+=FEED_PAGE_SIZE/);
 assert.doesNotMatch(html,/list\.map\(jobCard\)/);
});
