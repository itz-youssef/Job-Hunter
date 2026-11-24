'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const auth=require('../api/secretj-auth');
const prefs=require('../dist/assets/secretj-job-preferences');
const native=require('../lib/secretj/native-preference-monitor');
const account=fs.readFileSync('dist/assets/secretj-account.js','utf8');
const markup=fs.readFileSync('dist/account.html','utf8');
const UID='e07bb2d6-a213-45d0-ab23-e5051967a616';

test('career level alone matches jobs from unrelated fields, not only selected specialties',()=>{
 const p={role_families:[],career_levels:['internship'],max_experience_years:null,egypt_only:false,internships:false};
 const jobs=[
  {title:'Marketing Intern',location:'Cairo, Egypt',url:'https://example.org/jobs/marketing'},
  {title:'Software Engineering Intern',location:'Cairo, Egypt',url:'https://example.org/jobs/engineering'},
  {title:'Senior Software Engineer',location:'Cairo, Egypt',url:'https://example.org/jobs/senior'}
 ];
 assert.equal(prefs.hasFilters(p),true);
 assert.equal(prefs.isMatch(jobs[0],p),true);
 assert.equal(prefs.isMatch(jobs[1],p),true);
 assert.equal(prefs.isMatch(jobs[2],p),false);
 const matches=native.matching(jobs,p);
 assert.equal(matches.length,2);
 assert.ok(matches.some(j=>j.title==='Marketing Intern'));
 assert.ok(matches.some(j=>j.title==='Software Engineering Intern'));
 const entry={...p,career_levels:['entry']};
 assert.equal(prefs.isMatch({title:'Graduate Business Analyst',url:'https://example.org/jobs/grad',location:'Cairo'},entry),true);
});
test('signup displays required confirmation field and checks equality before API',()=>{
 assert.match(markup,/id="confirm-password-label" hidden>Confirm password/);
 assert.match(markup,/name="confirm_password" autocomplete="new-password"/);
 assert.match(account,/form\.elements\.confirm_password\.required=register/);
 assert.match(account,/if\(values\.password!==values\.confirm_password\)/);
 assert.match(account,/delete values\.confirm_password/);
});
test('alternative passwordless sign-in uses existing challenge verification',()=>{
 assert.match(markup,/id="sj-email-login-toggle"/);
 assert.match(account,/authUrl\('request-email-login'\)/);
 assert.match(account,/showLoginCode\(result\.challenge,false\)/);
 assert.match(account,/authUrl\('verify-login'\)/);
});
test('email-only OTP requires a valid code, issues no session before verification and conceals missing accounts',async()=>{
 const old={SECRETJ_EMAIL_FROM:process.env.SECRETJ_EMAIL_FROM,RESEND_API_KEY:process.env.RESEND_API_KEY};
 const fetchOld=global.fetch;
 process.env.SECRETJ_EMAIL_FROM='alerts@example.org';
 process.env.RESEND_API_KEY='test-resend-key';
 let emailCode=null,challengeRow=null,sessions=0,known=true;
 global.fetch=async(_url,options)=>{
   emailCode=JSON.parse(options.body).text.match(/code is: (\d{6})/)?.[1];
   return {ok:true,status:200};
 };
 core.setQueryForTests(async(sql,args=[])=>{
   if(sql.includes('sj_auth_attempts'))return [{attempts:1}];
   if(sql.includes('FROM public.sj_users WHERE email=$1 AND is_active=true LIMIT 1'))
     return known?[{id:UID,email:'member@example.org'}]:[];
   if(sql.startsWith('DELETE FROM public.sj_login_challenges WHERE user_id=')){challengeRow=null;return [];}
   if(sql.includes('INSERT INTO public.sj_login_challenges')){
     challengeRow={token_hash:args[0],code_hash:args[2],code_salt:args[3],attempts:0};
     return [];
   }
   if(sql.includes('SET attempts=attempts+1')){
     if(!challengeRow||challengeRow.token_hash!==args[0]||challengeRow.attempts>=5)return [];
     challengeRow.attempts++;
     return [{user_id:UID,code_hash:challengeRow.code_hash,code_salt:challengeRow.code_salt}];
   }
   if(sql.includes('DELETE FROM public.sj_login_challenges')&&sql.includes('RETURNING user_id')){
     if(!challengeRow||challengeRow.token_hash!==args[0]||challengeRow.code_hash!==args[1])return [];
     challengeRow=null;return [{user_id:UID}];
   }
   if(sql.includes('FROM public.sj_users WHERE id=$1 AND is_active=true'))
     return [{id:UID,email:'member@example.org',role:'member'}];
   if(sql.includes('INSERT INTO public.sj_sessions')){sessions++;return [];}
   throw Error('Unexpected SQL: '+sql.slice(0,110));
 });
 const call=async(action,body)=>{
   const request={method:'POST',query:{action},body,
     headers:{host:'jobsnow.tech',origin:'https://jobsnow.tech'}};
   let value=null,headers={};
   const response={statusCode:200,setHeader(k,v){headers[k]=v},end(s){value=JSON.parse(s)}};
   await auth(request,response);
   return {status:response.statusCode,body:value,headers};
 };
 try{
   const first=await call('request-email-login',{email:'member@example.org'});
   assert.equal(first.status,200);
   assert.equal(first.body.requires_otp,true);
   assert.equal(sessions,0);
   assert.equal(first.headers['Set-Cookie'],undefined);
   assert.match(emailCode,/^\d{6}$/);
   const wrong=await call('verify-login',{challenge:first.body.challenge,code:'000000'});
   assert.equal(wrong.status,400);
   const verified=await call('verify-login',{challenge:first.body.challenge,code:emailCode});
   assert.equal(verified.status,200);
   assert.equal(verified.body.user.role,'member');
   assert.equal(sessions,1);
   assert.match(verified.headers['Set-Cookie'],/HttpOnly/);
   known=false;
   const missing=await call('request-email-login',{email:'absent@example.org'});
   assert.equal(missing.status,200);
   assert.equal(missing.body.requires_otp,true);
   assert.equal(missing.body.user,undefined);
   assert.equal(missing.headers['Set-Cookie'],undefined);
 }finally{
   core.setQueryForTests(null);global.fetch=fetchOld;
   for(const [k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }
});
