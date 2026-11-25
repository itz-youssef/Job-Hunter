'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const router=require('../api/legacy-email');
const destination=require('../lib/legacy-email/email-destination');
const emailTest=require('../lib/legacy-email/test-email');
const config=require('../vercel.json');
const token='fixture-admin-token-01234567890123456789';
const invoke=async(handler,req)=>{
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.body=JSON.parse(s);}};
 await handler(req,res);return {status:res.statusCode,headers:res.headers,body:res.body};
};
test('only twelve deployed functions; old public endpoints use explicit internal rewrites',()=>{
 const functions=fs.readdirSync('api').filter(f=>/\.(js|ts|mjs|cjs|py)$/.test(f));
 assert.equal(functions.length,12);
 assert.ok(functions.includes('secretj-botfolio.js'));
 assert.deepEqual(config.rewrites,[
 {source:'/api/email-destination',destination:'/api/legacy-email?__legacy_email_route=destination'},
 {source:'/api/test-email',destination:'/api/legacy-email?__legacy_email_route=test'}
 ]);
});
test('both rewritten routes preserve original handler status, body, headers, auth and methods',async()=>{
 const before={...process.env},oldFetch=global.fetch;
 Object.assign(process.env,{ADMIN_TOKEN:token,ALERT_EMAIL:'fixture@example.invalid',GITHUB_REPO:'example/repo',GITHUB_TOKEN:'fixture-not-real'});
 let fetches=0;
 global.fetch=async(url,opts)=>{fetches++;assert.match(url,/test-email\.yml\/(runs\?per_page=5|dispatches)$/);if(opts.method==='POST')return {ok:true,status:204};return {ok:true,json:async()=>({workflow_runs:[{id:1,status:'completed',conclusion:'success'}]})};};
 try{
  for(const [route,handler] of [['destination',destination],['test',emailTest]]){
   for(const method of ['GET','POST','PATCH','DELETE']){
    for(const provided of ['',token,'wrong']){
     const req={method,query:{__legacy_email_route:route},headers:{'x-admin-token':provided},body:{}};
     const original=await invoke(handler,req),routed=await invoke(router,req);
     // Timestamp is generated independently by the original handler.
     delete original.body.verified_at;delete routed.body.verified_at;
     assert.deepEqual(routed,original);
    }
   }
  }
  assert.equal(fetches,4);
  for(const route of [undefined,'unknown',['destination','test'],'__proto__']){
   const r=await invoke(router,{method:'GET',query:{__legacy_email_route:route},headers:{}});
   assert.equal(r.status,404);
  }
 }finally{global.fetch=oldFetch;for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}
});
