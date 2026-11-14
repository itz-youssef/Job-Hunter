'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const admin=require('../api/secretj-admin');
const me='e07bb2d6-a213-45d0-ab23-e5051967a616';
const other='ff7bb2d6-a213-45d0-ab23-e5051967a616';
const cookie='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
async function call(method,action,body={},role='admin',id=me){
 const queries=[];
 core.setQueryForTests(async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
   return [{id,email:'owner@example.com',role,is_active:true}];
  if(sql.includes('FROM public.sj_users u')&&sql.includes('WHERE u.id=$1 LIMIT 1'))
   return [{id:other,email:'member@example.com',role:'member',is_active:true,saved_jobs:2}];
  if(sql.includes('SELECT count(*)::int AS total'))return [{total:2,active:2,admins:1,joined_week:1}];
  if(sql.includes('sj_email_alert_log WHERE status='))return [{opted_in:2,verified:1,sent:4,failed:0,pending:0}];
  if(sql.includes('INSERT INTO public.sj_admin_audit'))return [{target_user_id:other}];
  return [];
 });
 const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},
   end(s){this.body=JSON.parse(s);}};
 const req={method,query:{action,id:other},body,
   headers:{host:'www.jobsnow.tech',origin:'https://www.jobsnow.tech',cookie}};
 try{await admin(req,response);return {response,queries};}
 finally{core.setQueryForTests(null);}
}
test('regular members denied insights, user diagnostics and session revocation',async()=>{
 for(const [method,action] of [['GET','insights'],['GET','user-detail'],['PATCH','revoke-sessions']]){
  const {response,queries}=await call(method,action,{id:other},'member');
  assert.equal(response.statusCode,403);
  assert.equal(queries.length,1);
 }
});
test('admin insights expose aggregated metrics without sensitive account content',async()=>{
 const {response,queries}=await call('GET','insights');
 assert.equal(response.statusCode,200);
 assert.equal(response.body.accounts.total,2);
 assert.equal(response.body.alerts.sent,4);
 assert.ok(queries.some(x=>x.sql.includes('GROUP BY stage')));
 const body=JSON.stringify(response.body);
 assert.doesNotMatch(body,/password_hash|token_hash|content BYTEA|base64/);
});
test('user diagnostic filters by requested UUID and does not read CV bytes',async()=>{
 const {response,queries}=await call('GET','user-detail');
 assert.equal(response.statusCode,200);
 assert.equal(response.body.user.saved_jobs,2);
 const q=queries.find(x=>x.sql.includes('WHERE u.id=$1 LIMIT 1'));
 assert.deepEqual(q.args,[other]);
 assert.doesNotMatch(q.sql,/SELECT.*(?:password_hash|cv\.content|avatar\.content)/s);
});
test('session revocation is audited and forbids self revocation',async()=>{
 const self=await call('PATCH','revoke-sessions',{id:me});
 assert.equal(self.response.statusCode,403);
 assert.equal(self.queries.filter(x=>x.sql.includes('DELETE FROM public.sj_sessions')).length,0);
 const otherUser=await call('PATCH','revoke-sessions',{id:other});
 assert.equal(otherUser.response.statusCode,200);
 assert.ok(otherUser.queries.some(x=>x.sql.includes('DELETE FROM public.sj_sessions')&&x.sql.includes('sj_admin_audit')));
});
test('account signup cannot self-promote, admin page only loads on trusted session',()=>{
 const auth=fs.readFileSync('api/secretj-auth.js','utf8');
 const page=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 const ui=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');
 assert.match(auth,/VALUES\(\$1,\$2,\$3\)/);
 assert.match(page,/user\.role==='admin'\?'admin':'overview'/);
 assert.match(ui,/state\.user\?\.role!=='admin'/);
 assert.doesNotMatch(ui,/DATABASE_URL|password_hash|token_hash|npg_/);
 assert.match(fs.readFileSync('dist/account.html','utf8'),/secretj-admin-console\.js/);
});
test('admin role and suspend mutation preserve a last-active-admin safeguard',()=>{
 const src=fs.readFileSync('api/secretj-admin.js','utf8');
 assert.match(src,/SELECT count\(\*\) FROM public\.sj_users WHERE role='admin' AND is_active/);
 assert.match(src,/sj_admin_audit/);
});
