'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../lib/secretj/core');
const cache=require('../lib/secretj/preference-cache');
const monitor=require('../lib/secretj/native-preference-monitor');
const prefs=require('../dist/assets/secretj-job-preferences');
const handler=require('../api/secretj-native-status');
const UID='e07bb2d6-a213-45d0-ab23-e5051967a616';
const COOKIE='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
const preference={role_families:['software'],career_levels:['junior','internship'],
  egypt_only:true,internships:false,max_experience_years:null};
const sig=monitor.signature(preference);
const job=(title,url)=>({title,url,company:'Example',location:'Cairo, Egypt',
  qualification_status:'accepted',qualification_mode:'dictionary-title-v1'});
const approved=job('Junior Software Engineer','https://example.com/job/1');
const excluded=job('Senior Software Engineer','https://example.com/job/2');
const stamp=(item,signature=sig,version=cache.fingerprint)=>({
  ...item,qualification_preference_signature:signature,
  qualification_matcher_fingerprint:version
});
async function call(rows,option={}){
 const calls=[];
 core.setQueryForTests(async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
    return [{id:UID,email:'member@example.com',is_active:true}];
  if(sql===handler.CORE_FEED_SQL){
    const state={initialized_at:'2026-11-22',preferences_current:true,preference_signature:sig};
    return rows.length?rows.map(row=>({...state,...row})):[{...state,job_key:null}];
  }
  if(sql.includes('sj_native_watch_state'))
    return [{initialized_at:'2026-11-22',preferences_current:true,
      preference_signature:sig}];
  if(sql.includes('FROM public.sj_native_watch_jobs'))return rows;
  if(sql.includes('FROM public.sj_preferences WHERE user_id=$1')){
    if(option.noPreferenceQuery)throw Error('Unnecessary preferences read');
    return [preference];
  }
  throw Error('Unexpected SQL: '+sql);
 });
 const res={statusCode:200,setHeader(){},body:null,end(body){this.body=JSON.parse(body);}};
 try{
  await handler({method:'GET',headers:{cookie:COOKIE},query:{action:'feed'}},res);
  return {status:res.statusCode,body:res.body,calls};
 }finally{core.setQueryForTests(null);}
}
const row=(item)=>({job_key:item.url,job_snapshot:item,status:'baseline',
 discovered_at:'2026-11-23'});

test('exact preference and matching version let feed reuse persisted results',async()=>{
 assert.equal(cache.verified(stamp(approved),sig),true);
 const result=await call([row(stamp(approved))],{noPreferenceQuery:true});
 assert.equal(result.status,200);
 assert.deepEqual(result.body.jobs.map(j=>j.title),[approved.title]);
 assert.equal(result.body.jobs[0].watch_status,'baseline');
 assert.equal(result.body.next_offset,null);
 assert.equal(result.calls.filter(x=>x.sql.includes('sj_native_watch_jobs')).length,1);
 assert.equal(result.calls.length,2,'Authentication plus one atomic feed query');
});

test('old rows and old dictionary versions retain original strict matcher',async()=>{
 const oldVersion=stamp(excluded,sig,'outdated');
 const legacy=job('Software Engineering Intern','https://example.com/job/3');
 const result=await call([row(stamp(approved)),row(oldVersion),row(legacy)]);
 assert.equal(result.status,200);
 assert.deepEqual(result.body.jobs.map(j=>j.title),[
   'Junior Software Engineer','Software Engineering Intern'
 ]);
 assert.equal(result.calls.filter(x=>x.sql.includes('FROM public.sj_preferences WHERE user_id=$1')).length,1);
});

test('preference changes invalidate old cached approvals and never show stale jobs',async()=>{
 const seniorPreference={...preference,career_levels:['senior']};
 const oldSig=monitor.signature(seniorPreference);
 assert.notEqual(oldSig,sig);
 assert.equal(cache.verified(stamp(excluded,oldSig),sig),false);
 const result=await call([row(stamp(excluded,oldSig))]);
 assert.deepEqual(result.body.jobs,[]);
});

test('unapproved or fabricated cache marker never bypasses dictionary matching',async()=>{
 assert.equal(cache.verified(stamp({...excluded,qualification_status:'review'}),sig),false);
 assert.equal(cache.verified(stamp({...excluded,qualification_mode:'ai-reviewed'}),sig),false);
 assert.equal(cache.verified({...excluded,qualification_matcher_fingerprint:cache.fingerprint},sig),false);
 const result=await call([row(stamp({...excluded,qualification_status:'review'}))]);
 assert.deepEqual(result.body.jobs,[]);
});

test('fast path and reference matcher return identical results for every dictionary checkbox',()=>{
 const categories=[
  ['internship','Software Engineer Intern'],
  ['entry','Graduate Software Engineer'],
  ['junior','Junior Software Engineer'],
  ['mid','Mid-level Software Engineer'],
  ['senior','Senior Software Engineer'],
  ['lead','Tech Lead Software Engineer'],
  ['manager','Engineering Manager'],
  ['director_head_executive','Director of Engineering']
 ];
 for(const [category,title] of categories){
  const p={...preference,career_levels:[category],role_families:[]};
  const signature=monitor.signature(p);
  const candidate=job(title,'https://example.com/'+category);
  const expected=prefs.isMatch(candidate,p);
  // This cached marker may only exist after the actual matcher accepted.
  if(expected){
   const record=stamp(candidate,signature);
   assert.equal(cache.shouldDisplay(record,signature,null),expected,category);
  }
  assert.equal(cache.shouldDisplay(candidate,signature,p),expected,category);
 }
});

test('cache fingerprint is deterministic and safely rejects missing proof',()=>{
 assert.match(cache.fingerprint,/^[0-9a-f]{64}$/);
 assert.equal(cache.verified(null,sig),false);
 assert.equal(cache.verified(stamp(approved),''),false);
 assert.equal(cache.verified(stamp(approved),sig+'x'),false);
});
