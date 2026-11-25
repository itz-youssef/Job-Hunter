'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const monitor=require('../lib/secretj/native-preference-monitor');
const core=require('../lib/secretj/core');
const preferences={role_families:['software'],career_levels:['internship','entry'],
  internships:false,egypt_only:true,max_experience_years:2};
const oldJob={title:'Software Engineer Intern',company:'Microsoft',location:'Cairo, Egypt',
  url:'https://example.com/careers/software-intern',description:'Develop services'};
test('stale public catalog still supplies personalized feed candidates',async()=>{
  const env={ASSETS:{fetch:async request=>{
    const key=String(request.url);
    return {ok:true,json:async()=>key.includes('native-source-registry')?
      {companies:[]}:{generated_at:'2001-01-01T00:00:00Z',jobs:[oldJob]}};
  }}};
  const gathered=await monitor.gather(env,async()=>{throw Error('No external network')});
  assert.equal(gathered.snapshotFresh,false);
  assert.equal(gathered.jobs.length,1);
  assert.equal(gathered.jobs[0].source_catalog_stale,true);
  assert.equal(gathered.jobs[0].source_filter_proof,'catalog-stale');
  const selected=monitor.matching(gathered.jobs,preferences);
  assert.equal(selected.length,1);
  const qualified=await monitor.qualifyJobs(selected,preferences,{});
  assert.equal(qualified.accepted.length,1);
  assert.equal(qualified.accepted[0].qualification_mode,'dictionary-title-v1');
});
test('stale records remain queued but cannot be emailed until fresh evidence arrives',async()=>{
  const user={id:'e07bb2d6-a213-45d0-ab23-e5051967a616',...preferences};
  let write=null;
  core.setQueryForTests(async(sql,args=[])=>{
    if(sql.startsWith('SELECT preference_signature'))return [{preference_signature:monitor.signature(user)}];
    if(sql.includes('FROM jsonb_to_recordset')){write={sql,args};return [];}
    if(sql.startsWith('UPDATE public.sj_native_watch_state'))return [];
    throw Error('Unexpected SQL');
  });
  try{
    await monitor.reserveNew(user,monitor.signature(user),[{
      ...oldJob,source_catalog_stale:true,qualification_status:'accepted',
      qualification_mode:'dictionary-title-v1'}]);
    assert.ok(write,'Stale matching job should still be stored for display');
    assert.match(write.sql,/EXCLUDED\.job_snapshot->>'source_catalog_stale'='true'/);
    assert.equal(JSON.parse(write.args[1])[0].job.source_catalog_stale,true);
    assert.equal(write.args[2],'pending','Fresh jobs remain eligible for email');
  }finally{core.setQueryForTests(null);}
});
test('new published snapshots remain eligible for real new-job notifications',async()=>{
  const env={ASSETS:{fetch:async request=>({ok:true,json:async()=>String(request.url).includes('native-source-registry')?
    {companies:[]}:{generated_at:new Date().toISOString(),jobs:[oldJob]}})}};
  const result=await monitor.gather(env);
  assert.equal(result.snapshotFresh,true);
  assert.equal(result.jobs[0].source_catalog_stale,false);
  assert.equal(result.jobs[0].source_filter_proof,'catalog-fallback');
});
