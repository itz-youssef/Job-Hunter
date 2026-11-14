'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const preferences=require('../dist/assets/secretj-job-preferences');
const api=require('../api/secretj-data');
const core=require('../lib/secretj/core');
process.env.NODE_ENV='test';

test('expanded account categories filter according to role, not owner relevance score',()=>{
 const p={role_families:['software','ai_ml'],egypt_only:true,internships:false,max_experience_years:null};
 assert.equal(preferences.isMatch({title:'Senior Software Engineer',score:0,matched:false,location:'Cairo, Egypt'},p),true);
 assert.equal(preferences.isMatch({title:'Software Engineer Intern',score:8,matched:true,location:'Cairo, Egypt'},p),true);
 assert.equal(preferences.isMatch({title:'HR Specialist',score:0,matched:false,location:'Cairo, Egypt'},p),false);
 assert.equal(preferences.isMatch({title:'Junior Software Engineer',score:8,matched:true,location:'Berlin, Germany'},p),false);
});

test('preferences do not become configured on account creation without a saved row',async()=>{
 const token='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
 const uid='e07bb2d6-a213-45d0-ab23-e5051967a616';
 core.setQueryForTests(async(sql,args)=>{
  if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
    return [{id:uid,email:'member@example.com',role:'member',is_active:true}];
  if(sql.includes('FROM public.sj_preferences'))return [];
  throw Error('Unexpected SQL statement');
 });
 const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},
  end(body){this.body=JSON.parse(body)}};
 try{
  await api({method:'GET',query:{scope:'preferences'},headers:{cookie:token,host:'www.jobsnow.tech'}},response);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.configured,false);
  assert.equal(response.body.preferences.email_alerts,false);
 }finally{core.setQueryForTests(null)}
});

test('brand hover exception overrides generic inverse selector and has keyboard focus outline',()=>{
 const css=fs.readFileSync('dist/assets/secretj-global-theme.css','utf8');
 const broad=css.lastIndexOf('body :is(button,a[href],summary,[role="button"])');
 const specific=css.lastIndexOf('body a.brand.brand[href]:not([hidden])');
 assert.ok(broad>0&&specific>broad);
 assert.match(css,/body a\.brand\.brand\[href\]:not\(\[hidden\]\):not\(\[aria-disabled="true"\]\):is\(:hover,:active,:focus-visible\)/);
 assert.match(css,/outline-offset:4px/);
});

test('company cards distinguish discovered vacancies from personalized matches',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');
 assert.match(html,/public_jobs:scan\?\.public_jobs\?\?scan\?\.parsed_jobs/);
 assert.match(html,/Detected vacancies: \$\{c\.public_jobs\}/);
});

test('all unchecked with blank experience means all detected jobs for logged-in members',()=>{
 const prefs={role_families:[],max_experience_years:null,egypt_only:false,internships:false};
 assert.equal(preferences.hasFilters(prefs),false);
 for(const title of ['Senior Software Architect','Recruitment Specialist','Cybersecurity Analyst','Frontend Developer']){
  assert.equal(preferences.isMatch({title,score:0,matched:false,location:'Germany'},prefs),true);
 }
});
test('categories cover technical roles and talent acquisition',()=>{
 const names=new Set(preferences.categories.map(x=>x.key));
 for(const k of ['backend','frontend','cybersecurity','cloud','data_engineering','talent_acquisition','hr','qa','devops','ux_ui','mobile','embedded','network','sales','other'])
  assert.ok(names.has(k),k);
 const p={role_families:['talent_acquisition'],egypt_only:false,internships:false,max_experience_years:null};
 assert.equal(preferences.isMatch({title:'Talent Acquisition Specialist',score:0,location:'Cairo'},p),true);
 assert.equal(preferences.isMatch({title:'Backend Engineer',score:9,location:'Cairo'},p),false);
});
test('optional experience differs from zero and rejects explicitly over-budget experience',()=>{
 const job={title:'Backend Developer',location:'Cairo',description:'Requires 5 years of experience'};
 assert.equal(preferences.isMatch(job,{role_families:['backend'],max_experience_years:null}),true);
 assert.equal(preferences.isMatch(job,{role_families:['backend'],max_experience_years:0}),false);
 assert.equal(preferences.isMatch({...job,description:'Build APIs'},{role_families:['backend'],max_experience_years:0}),true);
});
