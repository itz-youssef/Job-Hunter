'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
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
   assert.equal(JSON.parse(disabled.body).configured,false);
 }finally{
   core.requireUser=previous;
   core.setQueryForTests(null);
 }
});
