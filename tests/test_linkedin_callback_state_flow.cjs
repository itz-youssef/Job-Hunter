'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../lib/secretj/core');
const handler=require('../api/secretj-linkedin');
const env={
 LINKEDIN_CLIENT_ID:'test-id',
 LINKEDIN_CLIENT_SECRET:'test-secret',
 LINKEDIN_REDIRECT_URI:'https://www.jobsnow.tech/api/secretj-linkedin?action=callback'
};
const owner='aaaabbbb-0000-4000-8000-000000000001';
function request(action,extra={}){
 return {method:'GET',query:{action,...extra},headers:{},env};
}
function call(req){
 return new Promise((resolve,reject)=>{
  const headers={};
  const res={statusCode:200,setHeader(k,v){headers[k.toLowerCase()]=v;},
    end(body=''){resolve({status:this.statusCode,headers,body});}};
  Promise.resolve(handler(req,res)).catch(reject);
 });
}
test('callback succeeds with valid one-time state even if cross-site session cookie is missing',async()=>{
 const oldUser=core.requireUser;
 const oldFetch=global.fetch;
 let sessionChecks=0,consumed=0,saved=0;
 core.requireUser=async()=>{sessionChecks++;throw core.fail(401,'No cookie on OAuth callback');};
 core.setQueryForTests(async(sql,args)=>{
  if(sql.includes('DELETE FROM public.sj_linkedin_oauth_states')){
   assert.equal(args.length,1,'callback must match the hashed state only');
   if(consumed++)return [];
   return [{user_id:owner}];
  }
  if(sql.includes('WITH linked AS')){
   saved++;
   assert.equal(args[0],owner,'save to initiating state owner');
   assert.equal(args[1],'linkedin-subject');
   return [{user_id:owner}];
  }
  throw Error('Unexpected SQL');
 });
 global.fetch=async url=>{
  if(String(url).includes('/accessToken'))return {ok:true,json:async()=>({access_token:'temporary-test-token'})};
  if(String(url).includes('/userinfo'))return {ok:true,json:async()=>({sub:'linkedin-subject',name:'Test Member',email:'test@example.com'})};
  throw Error('Unexpected external URL');
 };
 try{
  const params={state:'A'.repeat(43),code:'authorization-code'};
  const success=await call(request('callback',params));
  assert.equal(success.status,302);
  assert.equal(success.headers.location,'/account.html?view=profile&linkedin=connected');
  assert.equal(sessionChecks,0,'cross-site callback must not require account cookie');
  assert.equal(saved,1);
  const replay=await call(request('callback',params));
  assert.equal(replay.status,302);
  assert.match(replay.headers.location,/reason=state$/);
  assert.equal(saved,1,'replayed state must not save anything');
  assert.doesNotMatch(success.headers.location,/temporary-test-token|authorization-code|test-secret/);
 }finally{
  core.requireUser=oldUser;
  core.setQueryForTests(null);
  global.fetch=oldFetch;
 }
});
test('start and status still require a signed-in member',async()=>{
 const prev=core.requireUser;
 core.requireUser=async()=>{throw core.fail(401,'Sign in to continue');};
 try{
  for(const action of ['start','status']){
   const r=await call(request(action));
   assert.equal(r.status,401);
  }
 }finally{core.requireUser=prev}
});

test('temporary LinkedIn status errors allow a retry rather than falsely claiming missing credentials',()=>{
 const fs=require('node:fs');
 const ui=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 assert.match(ui,/data-linkedin-retry/);
 assert.match(ui,/Retry LinkedIn status/);
 assert.match(ui,/linked\.status_error\?/);
 assert.match(ui,/await showView\('profile'\)/);
});
