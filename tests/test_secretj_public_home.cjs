'use strict';

/** Marketing, session header, LinkedIn permission and migration regressions. */
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../lib/secretj/core');
const linkedin=require('../api/secretj-linkedin');

const html=fs.readFileSync('dist/index.html','utf8');
const account=fs.readFileSync('dist/account.html','utf8');
const homeJS=fs.readFileSync('dist/assets/secretj-home.js','utf8');
const accountJS=fs.readFileSync('dist/assets/secretj-account.js','utf8');
const sql=fs.readFileSync('database/migrations/002_secretj_linkedin_oauth.sql','utf8');

test('Secret J is the public homepage; existing Job Hunter controls retained',()=>{
  assert.match(html,/id="sj-public-home"/);
  assert.match(html,/id="sj-public-main"/);
  assert.match(html,/id="sj-about"/);
  assert.match(html,/id="sj-offerings"/);
  assert.match(html,/id="sj-product"/);
  assert.match(html,/data-page="jobs"/);
  assert.match(html,/data-page="companies"/);
  assert.match(html,/document\.body\.classList\.toggle\('sj-show-app',state\.page!=='home'\)/);
  assert.match(html,/src="\/assets\/secretj-mark\.svg"/);
  assert.match(html,/src="\/assets\/secretj-home\.js"/);
  assert.match(html,/href="https:\/\/www\.linkedin\.com\/company\/secretj\/home\/"/);
});
test('public Secret J branding does not disclose owner personal name',()=>{
  const landing=html.split('<div id="sj-public-home">')[1].split('<div class="layout">')[0];
  assert.doesNotMatch(landing,/Youssef|Yasser|Built for Youssef/i);
  assert.match(landing,/OUR STORY/);
  assert.match(landing,/OUR MISSION/);
  assert.match(landing,/Our vision/);
  assert.match(landing,/What we offer/);
  assert.match(landing,/Technology should/);
});
test('header displays login/signup guests and profile/admin when signed in',()=>{
  assert.match(html,/id="sj-guest-actions"/);
  assert.match(html,/href="\/account\.html\?mode=register&amp;after=home"/);
  assert.match(html,/id="sj-member-actions" hidden/);
  assert.match(html,/id="sj-profile-menu"/);
  assert.match(html,/id="sj-admin-link" hidden/);
  assert.match(homeJS,/\/api\/secretj-auth\?action=session/);
  assert.match(homeJS,/data\.user\.role !== 'admin'/);
  assert.match(homeJS,/\/api\/secretj-auth\?action=logout/);
  assert.doesNotMatch(homeJS,/DATABASE_URL|npg_|password_hash|neondb_owner/);
});
test('Google is clearly disabled and not connected to an imaginary provider',()=>{
  assert.match(account,/Continue with Google/);
  assert.match(account,/Coming soon/);
  assert.match(account,/disabled title="Google authentication is planned/);
  assert.doesNotMatch(accountJS,/accounts\.google\.com\/o\/oauth2/);
});
test('account profile menu honors account ownership and linked services',()=>{
  assert.match(account,/id="account-profile-menu" class="top-profile" hidden/);
  assert.match(account,/id="account-admin-profile-link" hidden/);
  assert.match(accountJS,/account-admin-profile-link'\)\.hidden=user\.role!=='admin'/);
  assert.match(accountJS,/view=profile/);
  assert.match(accountJS,/\/api\/secretj-linkedin\?action=status/);
  assert.match(accountJS,/\/api\/secretj-linkedin\?action=start/);
  assert.match(accountJS,/\/api\/secretj-linkedin\?action=disconnect/);
});
test('alert email comes from authenticated signup identity; preferences saved to Neon',()=>{
  assert.match(accountJS,/Alert destination:/);
  assert.match(accountJS,/esc\(state\.user\.email\)/);
  assert.match(accountJS,/api\(dataUrl\('preferences'\),'PUT'/);
  assert.match(accountJS,/email_alerts_enabled|email_alerts/);
  assert.match(accountJS,/Personalized email delivery is still being developed/);
});
test('new LinkedIn migration preserves existing tables and restricts public grants',()=>{
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.sj_linkedin_connections/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.sj_linkedin_oauth_states/);
  assert.match(sql,/state_hash CHAR\(64\)/);
  for(const name of ['sj_linkedin_connections','sj_linkedin_oauth_states'])
    assert.match(sql,new RegExp('ALTER TABLE public\\.'+name+' ENABLE ROW LEVEL SECURITY'));
  assert.match(sql,/REVOKE ALL ON TABLE/);
  assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+TABLE/);
  assert.doesNotMatch(sql,/access_token TEXT|refresh_token TEXT|client_secret TEXT/);
});
test('OAuth exchanges only permissioned name/photo/email, never steals work history',()=>{
  const code=fs.readFileSync('api/secretj-linkedin.js','utf8');
  assert.match(code,/scope','openid profile email'/);
  assert.match(code,/https:\/\/api\.linkedin\.com\/v2\/userinfo/);
  assert.match(code,/sj_linkedin_connections/);
  assert.match(code,/state_hash=\$1 AND user_id=\$2 AND expires_at>now\(\)/);
  assert.match(code,/display_name=CASE WHEN length\(trim\(sj_profiles\.display_name\)\)=0/);
  assert.doesNotMatch(code,/r_fullprofile|r_basicprofile|r_contactinfo/);
  assert.doesNotMatch(code,/sj_users SET email|UPDATE public\.sj_users SET email/i);
});
function request(method,action,{body={},query={},cookie,origin='https://www.jobsnow.tech'}={}){
  return {method,body,query:{action,...query},headers:{
    host:'www.jobsnow.tech',origin,
    ...(cookie?{cookie}:{})
  }};
}
function response(){
  let done;const result=new Promise(resolve=>done=resolve);
  const res={statusCode:200,headers:{},
    setHeader(k,v){this.headers[k]=v;},
    end(body){done({status:this.statusCode,headers:this.headers,
      body:body?JSON.parse(body):null});}
  };
  return {res,result};
}
async function call(req){
  const {res,result}=response();
  await linkedin(req,res);
  return result;
}
const COOKIE='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
const USER_ID='e07bb2d6-a213-45d0-ab23-e5051967a616';
function fakeSQL(fn){
  const calls=[];
  core.setQueryForTests(async (sql,args=[])=>{
    calls.push({sql,args});
    if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
      return [{id:USER_ID,email:'owner@example.com',role:'member',is_active:true}];
    if(sql.includes('sj_linkedin_connections WHERE'))return [];
    if(sql.includes('DELETE FROM public.sj_linkedin_oauth_states'))return [{user_id:USER_ID}];
    if(sql.includes('SELECT user_id FROM imported'))return [{user_id:USER_ID}];
    return [];
  });
  return Promise.resolve().then(()=>fn(calls)).finally(()=>core.setQueryForTests(null));
}
test('LinkedIn connect status requires a user session',async()=>{
  await fakeSQL(async calls=>{
    const result=await call(request('GET','status'));
    assert.equal(result.status,401);
    assert.equal(calls.length,0);
  });
});
test('LinkedIn connect is fail-closed without developer credentials',async()=>{
  await fakeSQL(async calls=>{
    const keys=['LINKEDIN_CLIENT_ID','LINKEDIN_CLIENT_SECRET','LINKEDIN_REDIRECT_URI'];
    const old=Object.fromEntries(keys.map(x=>[x,process.env[x]]));
    keys.forEach(x=>delete process.env[x]);
    try{
      const status=await call(request('GET','status',{cookie:COOKIE}));
      assert.equal(status.status,200);
      assert.equal(status.body.configured,false);
      const start=await call(request('GET','start',{cookie:COOKIE}));
      assert.equal(start.status,503);
    }finally{
      for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}
    }
  });
});
test('LinkedIn disconnect deletes only the session owner connection',async()=>{
  await fakeSQL(async calls=>{
    const denied=await call(request('POST','disconnect',{cookie:COOKIE,origin:'https://other.invalid'}));
    assert.equal(denied.status,403);
    const ok=await call(request('POST','disconnect',{cookie:COOKIE}));
    assert.equal(ok.status,200);
    const q=calls.find(x=>x.sql.includes('DELETE FROM public.sj_linkedin_connections'));
    assert.ok(q);
    assert.deepEqual(q.args,[USER_ID]);
  });
});
test('legacy dashboard inline script still compiles',()=>{
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
  for(const source of scripts)assert.doesNotThrow(()=>new vm.Script(source));
  assert.doesNotThrow(()=>new vm.Script(homeJS));
  assert.doesNotThrow(()=>new vm.Script(accountJS));
});
