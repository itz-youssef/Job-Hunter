'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../lib/secretj/core');

const base='https://jobhunter-youssef.example.workers.dev';
let worker;
test.before(async()=>{
  worker=await import('../cloudflare/site/worker.mjs');
});
const cookie='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
async function handle(path,method='GET',body,extra={}){
  const req=new Request(base+path,{
    method,
    ...(method==='GET'?{}:{headers:{
      'content-type':'application/json',
      origin:base,
      'cf-connecting-ip':'203.0.113.10',
      ...(extra.headers||{})
    },body:body===undefined?'{}':JSON.stringify(body)}),
    ...(method==='GET'&&extra.headers?{headers:extra.headers}:{})
  });
  return worker.handleRequest(req,{
    ASSETS:{fetch:async()=>new Response('rendered current HTML',
      {status:200,headers:{'content-type':'text/html'}})}
  });
}
test('Worker serves index assets with explicit freshness and no Vercel calls',async()=>{
  const r=await handle('/');
  assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control'),/no-cache/);
  assert.equal(await r.text(),'rendered current HTML');
});
test('unknown legacy API returns safe 404, never a Vercel proxy',async()=>{
  const r=await handle('/api/companies');
  assert.equal(r.status,404);
  assert.match((await r.json()).error,/not available on Cloudflare/);
});
test('status on unconfigured Neon is explicit and does not leak URL',async()=>{
  const v=process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try{
    const r=await handle('/api/secretj-health');
    assert.equal(r.status,503);
    const info=await r.json();
    assert.equal(info.database,'not_configured');
    assert.doesNotMatch(JSON.stringify(info),/npg_|postgresql:\/\/|neondb_owner/);
  }finally{if(v!==undefined)process.env.DATABASE_URL=v;}
});
test('member session works through Worker transport adapter',async()=>{
  core.setQueryForTests(async(sql,params)=>{
    if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u')){
      assert.equal(params.length,1);
      return [{id:'e07bb2d6-a213-45d0-ab23-e5051967a616',
        email:'example@example.com',role:'member',is_active:true}];
    }
    return [];
  });
  try{
    const r=await handle('/api/secretj-auth?action=session','GET',undefined,
      {headers:{cookie}});
    assert.equal(r.status,200);
    const payload=await r.json();
    assert.equal(payload.user.email,'example@example.com');
    assert.equal(payload.user.role,'member');
    assert.equal(payload.user.password_hash,undefined);
  }finally{core.setQueryForTests(null);}
});
test('guest cannot save cloud jobs, even if user_id is spoofed',async()=>{
  core.setQueryForTests(async()=>{throw Error('Must not run SQL');});
  try{
    const r=await handle('/api/secretj-data?scope=saved','POST',{
      user_id:'e07bb2d6-a213-45d0-ab23-e5051967a616',
      key:'123',job:{title:'Software Developer',company:'Test'}
    });
    assert.equal(r.status,401);
  }finally{core.setQueryForTests(null);}
});
test('origins are verified at server boundary',async()=>{
  const r=await handle('/api/secretj-auth?action=logout','POST',{},
    {headers:{origin:'https://attacker.example'}});
  assert.equal(r.status,403);
});
test('Worker layer rejects excessive bodies and malformed JSON',async()=>{
  const large=await handle('/api/secretj-auth?action=login','POST',
    {junk:'x'.repeat(1_250_100)});
  assert.equal(large.status,413);
  const malformed=await worker.runNodeHandler(
    async()=>{},new Request(base+'/api/secretj-auth',{
      method:'POST',headers:{'content-type':'application/json'},
      body:'{not-json'
    })
  );
  assert.equal(malformed.status,400);
});
