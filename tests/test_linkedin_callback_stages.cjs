'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
process.env.NODE_ENV='test';
const core=require('../lib/secretj/core');
const linkedin=require('../api/secretj-linkedin');
const ui=fs.readFileSync('dist/assets/secretj-account.js','utf8');
async function invoke(req){
 return await new Promise((resolve,reject)=>{
  const headers={};
  const res={statusCode:200,setHeader(k,v){headers[k]=v},end(body=''){resolve({status:this.statusCode,headers,body})}};
  Promise.resolve(linkedin(req,res)).catch(reject);
 });
}
const env={
 LINKEDIN_CLIENT_ID:'test-client-id',
 LINKEDIN_CLIENT_SECRET:'test-secret',
 LINKEDIN_REDIRECT_URI:'https://www.jobsnow.tech/api/secretj-linkedin?action=callback'
};
test('OAuth provider error results in safe provider reason with no confidential response',async()=>{
 const prev=core.requireUser;
 core.requireUser=async()=>({id:'f0000000-0000-4000-8000-000000000001'});
 try{
  const r=await invoke({method:'GET',query:{action:'callback',error:'access_denied',error_description:'SECRET_FROM_PROVIDER'},env,headers:{}});
  assert.equal(r.status,302);
  assert.equal(r.headers.Location,'/account.html?view=profile&linkedin=error&reason=provider');
  assert.doesNotMatch(r.headers.Location,/SECRET_FROM_PROVIDER|test-secret/);
 }finally{core.requireUser=prev}
});
test('malformed callback gets response reason without code or state leakage',async()=>{
 const prev=core.requireUser;
 core.requireUser=async()=>({id:'f0000000-0000-4000-8000-000000000001'});
 try{
  const r=await invoke({method:'GET',query:{action:'callback',code:'private-code'},env,headers:{}});
  assert.equal(r.status,302);
  assert.match(r.headers.Location,/reason=response$/);
  assert.doesNotMatch(r.headers.Location,/private-code/);
 }finally{core.requireUser=prev}
});
test('expired or unmatched OAuth state gets state reason, not a generic error',async()=>{
 const prev=core.requireUser;
 core.requireUser=async()=>({id:'f0000000-0000-4000-8000-000000000001'});
 core.setQueryForTests(async()=>[]);
 try{
  const r=await invoke({method:'GET',query:{action:'callback',code:'private-code',state:'a'.repeat(43)},env,headers:{}});
  assert.equal(r.status,302);
  assert.match(r.headers.Location,/reason=state$/);
 }finally{core.requireUser=prev;core.setQueryForTests(null)}
});
test('UI describes OAuth callback failures without displaying OAuth values',()=>{
 for(const reason of ['provider','session','response','state','exchange','storage'])assert.match(ui,new RegExp(reason+':'));
 assert.match(ui,/No profile information was changed/);
});
