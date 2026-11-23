'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
process.env.NODE_ENV='test';
const linkedin=require('../api/secretj-linkedin');
const core=require('../lib/secretj/core');

const id='e07bb2d6-a213-45d0-ab23-e5051967a616';
function invoke(req){
 return new Promise((resolve,reject)=>{
   const headers={};
   const res={statusCode:200,
     setHeader(k,v){headers[k]=v;},
     end(body){resolve({status:this.statusCode,headers,body});}};
   Promise.resolve(linkedin(req,res)).catch(reject);
 });
}
test('Cloudflare website passes its native bindings to LinkedIn handlers',()=>{
 const worker=fs.readFileSync('cloudflare/site/worker.mjs','utf8');
 assert.match(worker,/runNodeHandler\(handler,request,env\)/);
 assert.match(worker,/env:workerEnv/);
 const handler=fs.readFileSync('api/secretj-linkedin.js','utf8');
 assert.match(handler,/const env=req\?\.env\|\|process\.env/);
 assert.match(handler,/client_id:options\.id/);
 assert.match(handler,/client_secret:options\.secret/);
});
test('LinkedIn connection uses Worker environment even when process.env has no credentials',async()=>{
 const previous=core.requireUser;
 const existing={id,email:'member@example.com'};
 core.requireUser=async()=>existing;
 const oldQuery=core.query;
 core.setQueryForTests(async sql=>{
   if(sql.includes('sj_linkedin_connections'))return [];
   return [];
 });
 const env={
   LINKEDIN_CLIENT_ID:'test-client-id',
   LINKEDIN_CLIENT_SECRET:'test-private-secret',
   LINKEDIN_REDIRECT_URI:'https://www.jobsnow.tech/api/secretj-linkedin?action=callback'
 };
 try{
   const request={method:'GET',query:{action:'status'},headers:{},env};
   const enabled=await invoke(request);
   assert.equal(enabled.status,200);
   assert.equal(JSON.parse(enabled.body).configured,true);
   const disabled=await invoke({...request,env:{LINKEDIN_CLIENT_ID:'test-client-id'}});
   const disabledInfo=JSON.parse(disabled.body);
   assert.equal(disabledInfo.configured,false);
   assert.deepEqual(disabledInfo.setup_issues,['LINKEDIN_CLIENT_SECRET_missing']);
   assert.doesNotMatch(disabled.body,/test-private-secret/);
   const mismatch=await invoke({...request,env:{...env,LINKEDIN_REDIRECT_URI:'https://invalid.example/callback'}});
   assert.deepEqual(JSON.parse(mismatch.body).setup_issues,['LINKEDIN_REDIRECT_URI_mismatch']);
 }finally{
   core.requireUser=previous;
   core.setQueryForTests(null);
 }
});

test('missing LinkedIn database table reports migration requirement instead of missing credentials',async()=>{
 const original=core.requireUser;
 core.requireUser=async()=>({id,email:'member@example.com'});
 core.setQueryForTests(async()=>{const e=new Error('relation does not exist');e.code='42P01';throw e;});
 try{
   const r=await invoke({method:'GET',query:{action:'status'},headers:{},env:{
     LINKEDIN_CLIENT_ID:'valid-id',LINKEDIN_CLIENT_SECRET:'secret-value',
     LINKEDIN_REDIRECT_URI:'https://www.jobsnow.tech/api/secretj-linkedin?action=callback'
   }});
   assert.equal(r.status,200);
   const data=JSON.parse(r.body);
   assert.equal(data.configured,true);
   assert.deepEqual(data.setup_issues,['LINKEDIN_DATABASE_MIGRATION_REQUIRED']);
   assert.doesNotMatch(r.body,/secret-value|relation does not exist/);
 }finally{core.requireUser=original;core.setQueryForTests(null);}
});
