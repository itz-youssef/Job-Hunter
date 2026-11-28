'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const prefs=require('../dist/assets/secretj-job-preferences');
const catalog=require('../lib/secretj/dictionary-catalog');
const jobs=JSON.parse(fs.readFileSync('dist/data.json','utf8')).jobs;
test('prepared dictionary decisions and indexed candidate predicates match original full catalog',()=>{
 const facts=jobs.map(j=>prefs.prepare(j));
 const profiles=[{role_families:[],career_levels:[],egypt_only:false,internships:false,max_experience_years:null}];
 for(const level of [...prefs.careerLevels.map(x=>x.key),'director','executive','unknown'])profiles.push({role_families:[],career_levels:[level],egypt_only:true,internships:false,max_experience_years:2});
 for(const years of [0,1,2,3,5,30,null])profiles.push({role_families:['software','ai','other'],career_levels:[],egypt_only:true,internships:years===null,max_experience_years:years});
 for(const c of prefs.categories)profiles.push({role_families:[c.key],career_levels:['junior','entry','internship'],egypt_only:false,internships:false,max_experience_years:null});
 for(const p of profiles){
  const {roles,levels,egypt}=catalog.selection(p);
  for(let i=0;i<jobs.length;i++){
   const original=prefs.assess(jobs[i],p),prepared=prefs.assessPrepared(jobs[i],p,facts[i]);
   assert.deepEqual(prepared,original);
   if(original.match)assert.ok((!roles.length||facts[i].fields.some(k=>roles.includes(k)))&&(!levels.length||levels.includes(facts[i].level.level))&&(!egypt||facts[i].inEgypt));
  }
 }
});
test('unchanged evidence reuses classification; changed evidence or rule version invalidates it',()=>{
 const job={title:'Junior Software Engineer',company:'Example',location:'Cairo',url:'https://example.com/job'};
 const first=catalog.prepareRows([job]);assert.equal(first.classified,1);
 const prior=first.rows.map(x=>({...x,matcher_fingerprint:catalog.version}));
 const second=catalog.prepareRows([{...job,published_at:'2026-11-27'}],prior);assert.equal(second.reused,1);assert.equal(second.classified,0);
 assert.equal(catalog.prepareRows([{...job,title:'Senior Software Engineer'}],prior).classified,1);
 assert.equal(catalog.prepareRows([job],prior.map(x=>({...x,matcher_fingerprint:'old'}))).classified,1);
});

 test('display can read the last complete catalog without treating it as fresh monitoring evidence',async()=>{
 const isolated=require('../lib/secretj/isolated-read-routing');
 const original=isolated.dictionaryCatalogQuery;
 const j={title:'Junior AI Engineer',url:'https://example.com/job',location:'Cairo, Egypt'};
 const p={role_families:['ai_ml'],career_levels:['junior'],egypt_only:true};
 try{
  isolated.dictionaryCatalogQuery=async(env,sql,args)=>{
   assert.equal(sql,catalog.READ_SQL);assert.equal(args[0],catalog.version);
   if(!args[4])return [];
   return [{job_count:1,job_key:j.url,job:j,facts:prefs.prepare(j),catalog_current:false,snapshot_fresh:true,published_at:'2026-11-27T21:40:10Z'}];
  };
  assert.equal(await catalog.read({},p),null);
  const display=await catalog.read({},p,{allowStale:true});
  assert.equal(display.jobs.length,1);assert.equal(display.snapshotFresh,false);
  assert.equal(prefs.assessPrepared(j,p,display.factsByJob.get(j)).match,true);
 }finally{isolated.dictionaryCatalogQuery=original;}
});
