'use strict';
process.env.NODE_ENV='test';
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../lib/secretj/isolated-read-routing');
const env={JOB_HUNTER_DATABASE_URL:'postgresql://test:test@ep-soft-cloud-bgoaznc6-pooler.c-9.eu-central-1.aws.neon.tech/neondb',BOTFOLIO_DATABASE_URL:'postgresql://test:test@ep-super-haze-bgxz5xuw.c-9.eu-central-1.aws.neon.tech/neondb',SECRETJ_JOB_HUNTER_ISOLATED_READS:'true',SECRETJ_BOTFOLIO_ISOLATED_READS:'true'};
const digest='a'.repeat(64),d2='b'.repeat(64);
test('explicit opt-in and strict allowlisted service endpoints',()=>{
 assert.equal(R.enabled('jobHunter',env),true);assert.equal(R.enabled('botfolio',env),true);
 assert.equal(R.enabled('jobHunter',{...env,SECRETJ_JOB_HUNTER_ISOLATED_READS:'false'}),false);
 assert.equal(R.enabled('jobHunter',{...env,JOB_HUNTER_DATABASE_URL:env.BOTFOLIO_DATABASE_URL}),false);
 assert.equal(R.enabled('botfolio',{...env,BOTFOLIO_DATABASE_URL:'https://example.com'}),false);
 assert.equal(R.enabled('other',env),false);
});
test('job read reconstruction preserves authoritative metadata and exact order',async()=>{
 const source=[{job_key:'a',record_digest:digest,status:'sent',discovered_at:'a',sent_at:'b'},{job_key:'b',record_digest:d2,status:'baseline',discovered_at:'b',sent_at:null}];
 R.setQueryForTests(async(service,sql,params)=>{
  assert.equal(service,'jobHunter');assert.match(sql,/record->>'user_id'=\$3/);assert.match(sql,/sha256/);
  assert.deepEqual(params,['20261127-jobhunter-shadow-v1',[digest,d2],'owner']);
  return [{record_digest:d2,job_key:'b',job_snapshot:{title:'B'}},{record_digest:digest,job_key:'a',job_snapshot:{title:'A'}}];
 });
 try{
  assert.deepEqual(await R.jobSnapshots(env,'owner',source),[{job_key:'a',status:'sent',discovered_at:'a',sent_at:'b',job_snapshot:{title:'A'}},{job_key:'b',status:'baseline',discovered_at:'b',sent_at:null,job_snapshot:{title:'B'}}]);
  R.setQueryForTests(async()=>[{record_digest:digest,job_key:'a',job_snapshot:{title:'A'}}]);
  assert.equal(await R.jobSnapshots(env,'owner',source),null);
  R.setQueryForTests(async()=>[{record_digest:digest,job_key:'wrong',job_snapshot:{title:'A'}}]);
  assert.equal(await R.jobSnapshots(env,'owner',source.slice(0,1)),null);
  R.setQueryForTests(async()=>{throw Error('unavailable')});
  assert.equal(await R.jobSnapshots(env,'owner',source),null);
  assert.deepEqual(await R.jobSnapshots(env,'owner',[]),[]);
 }finally{R.setQueryForTests(null);}
});
test('Botfolio remote reads require matching owner and complete record version',async()=>{
 const bot={id:'bot',user_id:'owner',record_digest:digest};const knowledge=[{text:'original',vector:[1,2]}];
 R.setQueryForTests(async(service,sql,params)=>{
  assert.equal(service,'botfolio');assert.match(sql,/record->>'user_id'=\$3/);assert.match(sql,/sha256/);
  assert.deepEqual(params,['20261127-botfolio-shadow-v1','bot','owner',digest]);return [{knowledge}];
 });
 try{
  assert.deepEqual(await R.botKnowledge(env,bot),knowledge);
  R.setQueryForTests(async()=>[]);assert.equal(await R.botKnowledge(env,bot),null);
  R.setQueryForTests(async()=>{throw Error('unavailable')});assert.equal(await R.botKnowledge(env,bot),null);
  assert.equal(await R.botKnowledge(env,{...bot,record_digest:'bad'}),null);
 }finally{R.setQueryForTests(null);}
});
