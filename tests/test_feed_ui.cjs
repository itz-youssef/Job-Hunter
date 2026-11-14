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
 jobKey:j=>String(j.id||j.title),
 jobURL:j=>String(j.url||'').startsWith('https://')?j.url:'#',
 jobs:()=>sandbox.rows||[],
 state:{member:null,memberPrefsConfigured:false,memberPrefs:null},
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
test('only after saving preferences does the feed match that account',()=>{
 sandbox.rows=rows;sandbox.state.member={id:'user'};sandbox.state.memberPrefsConfigured=true;
 sandbox.state.memberPrefs={role_families:['software'],egypt_only:true,internships:true};
 assert.deepEqual(Array.from(validJobs(),j=>j.id),[2]);
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
