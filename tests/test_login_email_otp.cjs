'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const auth=require('../api/secretj-auth');
const UID='e07bb2d6-a213-45d0-ab23-e5051967a616';
const password='correct horse battery staple';
const COOKIE='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
const req=(action,body={})=>({
 method:'POST',query:{action},body,
 headers:{host:'jobsnow.tech',origin:'https://jobsnow.tech'}
});
async function response(request){
 let body,headers={};
 const res={statusCode:200,setHeader(k,v){headers[k]=v;},end(s){body=JSON.parse(s);}};
 await auth(request,res);
 return {status:res.statusCode,body,headers};
}
async function fixture(task,{mailFails=false}={}){
 const prev={SECRETJ_LOGIN_OTP_ENABLED:process.env.SECRETJ_LOGIN_OTP_ENABLED,
  SECRETJ_EMAIL_FROM:process.env.SECRETJ_EMAIL_FROM,
  RESEND_API_KEY:process.env.RESEND_API_KEY};
 const oldFetch=global.fetch;
 let record=null,dispatched=[],sessionCount=0,attempts=0;
 const passhash=await core.hashPassword(password);
 process.env.SECRETJ_LOGIN_OTP_ENABLED='true';
 process.env.SECRETJ_EMAIL_FROM='alerts@example.org';
 process.env.RESEND_API_KEY='test-resend-key';
 global.fetch=async(url,opts)=>{
  assert.match(url,/api\.resend\.com\/emails/);
  const body=JSON.parse(opts.body);
  dispatched.push(body);
  if(mailFails)return {ok:false,status:503};
  return {ok:true,status:200};
 };
 core.setQueryForTests(async(sql,args=[])=>{
  if(sql.includes('sj_auth_attempts'))return [{attempts:1}];
  if(sql.includes('FROM public.sj_users WHERE email=$1'))return [{
    id:UID,email:'user@example.org',role:'member',is_active:true,password_hash:passhash}];
  if(sql.startsWith('DELETE FROM public.sj_login_challenges WHERE user_id=')){
    record=null;return [];
  }
  if(sql.includes('INSERT INTO public.sj_login_challenges')){
    record={token_hash:args[0],user_id:args[1],code_hash:args[2],
     code_salt:args[3],attempts:0,send_count:1};return [];
  }
  if(sql.includes('SET attempts=attempts+1')){
    if(!record||record.token_hash!==args[0]||record.attempts>=5)return [];
    record.attempts++;
    return [{user_id:UID,code_hash:record.code_hash,code_salt:record.code_salt}];
  }
  if(sql.includes('SET code_hash=$2,code_salt=$3')){
    if(!record||record.token_hash!==args[0]||record.send_count>=3)return [];
    record.code_hash=args[1];record.code_salt=args[2];record.send_count++;
    return [{email:'user@example.org'}];
  }
  if(sql.startsWith('DELETE FROM public.sj_login_challenges')&&sql.includes('WHERE token_hash=')){
    if(!record||record.token_hash!==args[0]||args[1]&&record.code_hash!==args[1])return [];
    record=null;return sql.includes('RETURNING user_id')?[{user_id:UID}]:[];
  }
  if(sql.includes('FROM public.sj_users WHERE id=$1 AND is_active=true'))
    return [{id:UID,email:'user@example.org',role:'member'}];
  if(sql.includes('INSERT INTO public.sj_sessions')){
    sessionCount++;return [];
  }
  throw Error('Unexpected SQL: '+sql.slice(0,100));
 });
 try{
  return await task({
    sent:()=>dispatched,
    getCode:()=>dispatched.at(-1)?.text?.match(/code is: (\d{6})/)?.[1],
    sessions:()=>sessionCount,
    attempts:()=>record?.attempts||0,
    record:()=>record
  });
 }finally{
  core.setQueryForTests(null);
  global.fetch=oldFetch;
  for(const [k,v] of Object.entries(prev)){
    if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 }
}
test('correct password sends six-digit code but NOT authenticated session',async()=>{
 await fixture(async f=>{
  const first=await response(req('login',{email:'user@example.org',password}));
  assert.equal(first.status,200);
  assert.equal(first.body.requires_otp,true);
  assert.match(first.body.challenge,/^[a-zA-Z0-9_-]{43}$/);
  assert.equal(first.body.user,undefined);
  assert.equal(first.headers['Set-Cookie'],undefined);
  assert.equal(f.sessions(),0);
  assert.match(f.getCode(),/^\d{6}$/);
  assert.equal(f.sent()[0].to[0],'user@example.org');
  const correct=await response(req('verify-login',{challenge:first.body.challenge,code:f.getCode()}));
  assert.equal(correct.status,200);
  assert.equal(correct.body.user.role,'member');
  assert.match(correct.headers['Set-Cookie'],/HttpOnly/);
  assert.equal(f.sessions(),1);
  const again=await response(req('verify-login',{challenge:first.body.challenge,code:f.getCode()}));
  assert.equal(again.status,400);
  assert.equal(f.sessions(),1);
 });
});
test('wrong codes do not establish sessions; five attempts exhaust challenge',async()=>{
 await fixture(async f=>{
  const first=await response(req('login',{email:'user@example.org',password}));
  for(let n=0;n<5;n++){
   const invalid=await response(req('verify-login',{
    challenge:first.body.challenge,code:f.getCode()==='000000'?'999999':'000000'}));
   assert.equal(invalid.status,400);
  }
  assert.equal(f.attempts(),5);
  assert.equal((await response(req('verify-login',{challenge:first.body.challenge,code:f.getCode()}))).status,400);
  assert.equal(f.sessions(),0);
 });
});
test('resend produces fresh code while retaining attempt counter',async()=>{
 await fixture(async f=>{
  const first=await response(req('login',{email:'user@example.org',password}));
  const old=f.getCode();
  await response(req('verify-login',{challenge:first.body.challenge,code:old==='000000'?'999999':'000000'}));
  const resend=await response(req('resend-login',{challenge:first.body.challenge}));
  assert.equal(resend.status,200);
  assert.equal(f.attempts(),1);
  assert.equal(f.sent().length,2);
  assert.equal(f.sessions(),0);
 });
});
test('provider failure does not establish session or leave usable challenge',async()=>{
 await fixture(async f=>{
  const failure=await response(req('login',{email:'user@example.org',password}));
  assert.equal(failure.status,503);
  assert.equal(f.record(),null);
  assert.equal(f.sessions(),0);
 },{mailFails:true});
});
test('invalid challenge and OTP format cannot query a session',async()=>{
 await fixture(async f=>{
  const bad=await response(req('verify-login',{challenge:'fake',code:'123456'}));
  assert.equal(bad.status,400);
  assert.equal(f.sessions(),0);
 });
});
test('login UI includes separate OTP form, resend and return actions',()=>{
 const html=fs.readFileSync('dist/account.html','utf8');
 const js=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 for(const id of ['login-code-panel','login-code-form','sj-login-code','sj-login-code-resend','sj-login-code-cancel'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/if\(result\.requires_otp\)/);
 assert.match(js,/authUrl\('verify-login'\)/);
 assert.match(js,/authUrl\('resend-login'\)/);
 assert.match(js,/loginChallenge=null/);
});

test('password sign-in requires OTP even if legacy flag is unset or false',async()=>{
 for(const flag of [undefined,'false']){
  await fixture(async f=>{
   if(flag===undefined)delete process.env.SECRETJ_LOGIN_OTP_ENABLED;
   else process.env.SECRETJ_LOGIN_OTP_ENABLED=flag;
   const first=await response(req('login',{email:'user@example.org',password}));
   assert.equal(first.status,200);
   assert.equal(first.body.requires_otp,true);
   assert.equal(first.body.user,undefined);
   assert.equal(first.headers['Set-Cookie'],undefined);
   assert.equal(f.sessions(),0);
   assert.equal(f.sent().length,1);
  });
 }
});
test('missing mail configuration never permits a password-only session',async()=>{
 await fixture(async f=>{
  delete process.env.SECRETJ_LOGIN_OTP_ENABLED;
  delete process.env.RESEND_API_KEY;
  const result=await response(req('login',{email:'user@example.org',password}));
  assert.equal(result.status,503);
  assert.equal(result.headers['Set-Cookie'],undefined);
  assert.equal(f.sessions(),0);
  assert.equal(f.record(),null);
  assert.equal(f.sent().length,0);
 });
});
