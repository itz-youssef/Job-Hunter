'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const auth=require('../api/secretj-auth');
const PASSWORD='correct horse battery staple';
const register={
  email:'new-user@example.org',password:PASSWORD,name:'New Member',
  accept_terms:true,terms_version:'2026-11-14',privacy_version:'2026-11-14'
};
function request(action,body){return{
  method:'POST',query:{action},body,
  headers:{host:'jobsnow.tech',origin:'https://jobsnow.tech'}
};}
async function call(action,body){
  let data,headers={};
  const res={statusCode:200,setHeader(k,v){headers[k]=v;},end(x){data=JSON.parse(x);}};
  await auth(request(action,body),res);
  return {status:res.statusCode,data,headers};
}
async function fixture(run,options={}){
  const previous=Object.fromEntries(
    ['SECRETJ_SIGNUP_OTP_ENABLED','SECRETJ_REGISTRATION_ENABLED',
     'RESEND_API_KEY','SECRETJ_EMAIL_FROM'].map(k=>[k,process.env[k]]));
  const oldFetch=global.fetch;
  Object.assign(process.env,{
    SECRETJ_SIGNUP_OTP_ENABLED:'true',SECRETJ_REGISTRATION_ENABLED:'true',
    RESEND_API_KEY:'fake-testing-secret',SECRETJ_EMAIL_FROM:'alerts@example.org'
  });
  const sent=[],users=new Map(),pending=new Map(),sessions=[];
  const sqlCalls=[];
  global.fetch=async(url,opts)=>{
    assert.equal(url,'https://api.resend.com/emails');
    const payload=JSON.parse(opts.body);sent.push(payload);
    if(options.failEmail)return {ok:false,status:503};
    return {ok:true,status:200};
  };
  core.setQueryForTests(async(sql,args=[])=>{
    sqlCalls.push(sql);
    if(sql.includes('sj_auth_attempts'))return [{attempts:1}];
    if(sql.startsWith('SELECT id FROM public.sj_users WHERE email=')){
      return users.has(args[0])?[{id:users.get(args[0]).id}]:[];
    }
    if(sql.includes('INSERT INTO public.sj_registration_challenges')){
      const existing=[...pending.values()].find(x=>x.email===args[1]);
      if(existing&&!existing.expired)return [];
      if(existing)pending.delete(existing.token_hash);
      pending.set(args[0],{token_hash:args[0],email:args[1],
        password_hash:args[2],display_name:args[3],code_hash:args[4],
        salt:args[5],attempts:0,send_count:1,expired:false});
      return [{token_hash:args[0]}];
    }
    if(sql.includes('UPDATE public.sj_registration_challenges')&&
       sql.includes('SET attempts=attempts+1')){
      const row=pending.get(args[0]);
      if(!row||row.expired||row.attempts>=5)return [];
      row.attempts++;return [{code_hash:row.code_hash,code_salt:row.salt}];
    }
    if(sql.includes('UPDATE public.sj_registration_challenges')&&
       sql.includes('SET code_hash=$2')){
      const row=pending.get(args[0]);
      if(!row||row.expired||row.attempts>=5||row.send_count>=3||
         options.resendCooldown)return [];
      row.code_hash=args[1];row.salt=args[2];row.send_count++;
      return [{email:row.email}];
    }
    if(sql.includes('WITH consumed AS')){
      const row=pending.get(args[0]);
      if(!row||row.code_hash!==args[1]||row.expired)return [];
      pending.delete(args[0]);
      if(users.has(row.email))return [];
      const user={id:args[2],email:row.email,role:'member',
        profile:{display_name:row.display_name}};
      users.set(row.email,user);
      return [user];
    }
    if(sql.startsWith('DELETE FROM public.sj_registration_challenges')){
      const row=pending.get(args[0]);
      if(row&&(!args[1]||args[1]===row.code_hash))pending.delete(args[0]);
      return [];
    }
    if(sql.includes('INSERT INTO public.sj_sessions')){
      sessions.push(args);return [];
    }
    throw Error('Unexpected SQL: '+sql.slice(0,130));
  });
  try{
    await run({
      sent,sessions,users,pending,sqlCalls,
      getCode:()=>sent.at(-1)?.text?.match(/code is: (\d{6})/)?.[1],
      expire:()=>{for(const row of pending.values())row.expired=true}
    });
  }finally{
    core.setQueryForTests(null);global.fetch=oldFetch;
    for(const [k,v] of Object.entries(previous))
      if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
}
test('sign-up sends code but does not create account or session before verification',async()=>{
 await fixture(async t=>{
  const start=await call('register',register);
  assert.equal(start.status,200);
  assert.equal(start.data.requires_otp,true);
  assert.equal(start.data.otp_purpose,'signup');
  assert.equal(start.data.user,undefined);
  assert.equal(start.headers['Set-Cookie'],undefined);
  assert.equal(t.users.size,0);
  assert.equal(t.sessions.length,0);
  assert.equal(t.pending.size,1);
  assert.match(t.getCode(),/^\d{6}$/);
  assert.equal(t.sent[0].to[0],register.email);
  assert.ok(!t.sent[0].text.includes(PASSWORD));
  const pending=[...t.pending.values()][0];
  assert.notEqual(pending.password_hash,PASSWORD);
  assert.match(pending.password_hash,/^scrypt\$/);
  assert.match(pending.code_hash,/^[a-f0-9]{64}$/);
  const done=await call('verify-signup',{challenge:start.data.challenge,code:t.getCode()});
  assert.equal(done.status,201);
  assert.equal(done.data.user.role,'member');
  assert.match(done.headers['Set-Cookie'],/HttpOnly/);
  assert.equal(t.users.size,1);
  assert.equal(t.sessions.length,1);
  assert.equal(t.users.get(register.email).profile.display_name,'New Member');
  assert.equal(t.pending.size,0);
  const replay=await call('verify-signup',{challenge:start.data.challenge,code:t.getCode()});
  assert.equal(replay.status,400);
  assert.equal(t.sessions.length,1);
 });
});
test('bad codes and five-attempt limit never create an account',async()=>{
 await fixture(async t=>{
  const start=await call('register',register);
  const wrong=t.getCode()==='000000'?'999999':'000000';
  for(let i=0;i<5;i++)
    assert.equal((await call('verify-signup',{challenge:start.data.challenge,code:wrong})).status,400);
  assert.equal((await call('verify-signup',{challenge:start.data.challenge,code:t.getCode()})).status,400);
  assert.equal(t.users.size,0);
  assert.equal(t.sessions.length,0);
 });
});
test('expired registration codes never create users',async()=>{
 await fixture(async t=>{
  const start=await call('register',register);
  t.expire();
  const done=await call('verify-signup',{challenge:start.data.challenge,code:t.getCode()});
  assert.equal(done.status,400);
  assert.equal(t.sessions.length,0);
  assert.equal(t.users.size,0);
 });
});
test('resend rotates OTP and preserves failed-attempt budget',async()=>{
 await fixture(async t=>{
  const start=await call('register',register);
  const wrong=t.getCode()==='000000'?'999999':'000000';
  await call('verify-signup',{challenge:start.data.challenge,code:wrong});
  const resend=await call('resend-signup',{challenge:start.data.challenge});
  assert.equal(resend.status,200);
  assert.equal(t.sent.length,2);
  assert.equal([...t.pending.values()][0].attempts,1);
  assert.equal(t.sessions.length,0);
 });
});
test('same-email sign-up cannot restart pending OTP and reset brute-force limit',async()=>{
 await fixture(async t=>{
  const first=await call('register',register);
  const again=await call('register',register);
  assert.equal(first.status,200);
  assert.equal(again.status,429);
  assert.equal(t.sent.length,1);
  assert.equal(t.pending.size,1);
 });
});
test('email outage cleans challenge and does not create account',async()=>{
 await fixture(async t=>{
  const res=await call('register',register);
  assert.equal(res.status,503);
  assert.equal(t.pending.size,0);
  assert.equal(t.users.size,0);
  assert.equal(t.sessions.length,0);
 },{failEmail:true});
});
test('invalid legal consent is rejected before sending any code',async()=>{
 await fixture(async t=>{
  const res=await call('register',{...register,accept_terms:false});
  assert.equal(res.status,400);
  assert.equal(t.sent.length,0);
  assert.equal(t.pending.size,0);
 });
});
test('signup and login code UI remain distinct and supported',()=>{
 const html=fs.readFileSync('dist/account.html','utf8');
 const js=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 assert.match(html,/id="sj-code-heading"/);
 assert.match(js,/otp_purpose==='signup'/);
 assert.match(js,/authUrl\('verify-signup'\)/);
 assert.match(js,/authUrl\('resend-signup'\)/);
 assert.match(js,/authUrl\('verify-login'\)/);
 assert.match(js,/authUrl\('resend-login'\)/);
});
