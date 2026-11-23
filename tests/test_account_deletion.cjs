'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const auth=require('../api/secretj-auth');
const admin=require('../api/secretj-admin');
const member='e07bb2d6-a213-45d0-ab23-e5051967a616';
const operator='fdc01d09-20e9-466f-bf8b-afdca97fec01';
const cookie='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
const password='correct horse battery staple';
async function request(handler,method,action,body,role,id){
 const sql=[];
 const digest=await core.hashPassword(password);
 core.setQueryForTests(async(query,args=[])=>{
   sql.push({query,args});
   if(query.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
     return [{id,email:'member@example.com',role,is_active:true}];
   if(query.includes('SELECT password_hash FROM public.sj_users'))
     return [{password_hash:digest}];
   if(query.includes('sj_auth_attempts'))return [{attempts:1}];
   if(query.includes('WITH subject AS'))return [{id:args[0]}];
   return [];
 });
 const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
   end(v){this.body=JSON.parse(v)}};
 try{
  await handler({method,query:{action},body,
    headers:{host:'www.jobsnow.tech',origin:'https://www.jobsnow.tech',cookie}},response);
  return {response,sql};
 }finally{core.setQueryForTests(null)}
}
test('member can delete own verified account only with password and typed confirmation',async()=>{
 const {response,sql}=await request(auth,'POST','delete-account',{password,confirm:'DELETE'},'member',member);
 assert.equal(response.statusCode,200);
 assert.equal(response.body.deleted,true);
 assert.match(response.headers['Set-Cookie'],/Max-Age=0/);
 const d=sql.find(x=>x.query.includes('WITH subject AS'));
 assert.ok(d);
 assert.deepEqual(d.args,[member]);
 assert.match(d.query,/role='member'/);
 assert.match(d.query,/DELETE FROM public.sj_admin_audit/);
 assert.match(d.query,/UPDATE public.sj_admin_audit SET target_user_id=NULL/);
 assert.match(d.query,/DELETE FROM public.sj_users/);
});
test('invalid deletion confirmation never runs user deletion',async()=>{
 const {response,sql}=await request(auth,'POST','delete-account',{password,confirm:'YES'},'member',member);
 assert.equal(response.statusCode,400);
 assert.equal(sql.some(x=>x.query.includes('WITH subject AS')),false);
});
test('admin cannot delete their own administrator account via self-service endpoint',async()=>{
 const {response,sql}=await request(auth,'POST','delete-account',{password,confirm:'DELETE'},'admin',operator);
 assert.equal(response.statusCode,403);
 assert.equal(sql.some(x=>x.query.includes('WITH subject AS')),false);
});
test('admin can delete only a different member and writes sanitized audit in the same statement',async()=>{
 const {response,sql}=await request(admin,'DELETE','delete-user',{id:member,confirm:'DELETE'},'admin',operator);
 assert.equal(response.statusCode,200);
 const d=sql.find(x=>x.query.includes('WITH subject AS'));
 assert.deepEqual(d.args.slice(0,2),[member,operator]);
 assert.match(d.query,/INSERT INTO public.sj_admin_audit/);
 assert.match(d.query,/target_user_id,detail/);
 assert.match(d.query,/role='member'/);
});
test('non-admin cannot delete another account',async()=>{
 const {response,sql}=await request(admin,'DELETE','delete-user',{id:operator,confirm:'DELETE'},'member',member);
 assert.equal(response.statusCode,403);
 assert.equal(sql.some(x=>x.query.includes('WITH subject AS')),false);
});
test('Cloudflare parses DELETE request bodies and UI controls are exposed',()=>{
 const worker=fs.readFileSync('cloudflare/site/worker.mjs','utf8');
 const profile=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 const consoleJS=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');
 const page=fs.readFileSync('dist/account.html','utf8');
 assert.match(worker,/\['POST','PUT','PATCH','DELETE'\]/);
 assert.match(profile,/data-delete-account/);
 assert.match(consoleJS,/data-admin-delete/);
 assert.match(page,/\.sj-linkedin-connect/);
 assert.match(page,/\.sj-linkedin-disconnect/);
});

test('LinkedIn button branding is explicitly enforced in rendered markup',()=>{
 const js=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 assert.match(js,/sj-linkedin-connect" style="background:#0a66c2!important;color:#fff!important/);
 assert.match(js,/sj-linkedin-disconnect" style="background:#c62828!important;color:#fff!important/);
});
