const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash}=require('node:crypto');

const html=fs.readFileSync('dist/index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('profile dashboard script parses',()=>assert.doesNotThrow(()=>new Function(script)));
test('private profile UI, photo, CV parsing and authenticated test email controls',()=>{
 for(const word of ['data-page="profile"','function profilePage()','function profileStore(mode,value)',
   'function refreshProfile()','function parseCVInfo(raw)','function pdfCVText(blob)',
   'function importProfileFromCV()','function setProfilePhoto(file)',
   'function saveCloudProfile(token)','function restoreCloudProfile(token)',
   'function sendEmailTest()','function emailTestStatus()',
   'data-email-test','data-email-status','data-cv-cloud-save','data-cv-cloud-load']){
   assert.ok(html.includes(word),'Missing '+word);
 }
 assert.match(script,/pdfjs-dist@4\.10\.38/);
 assert.match(script,/await profileStore\('save',profile\)/);
 assert.match(script,/profile\.photo=data/);
});
test('CV parser extracts explicit contact details and preserves section boundaries',()=>{
 const start=script.indexOf('  function parseCVInfo(raw)');
 const end=script.indexOf('  async function pdfCVText(blob)',start);
 assert.ok(start>=0&&end>start);
 const sandbox={};
 vm.createContext(sandbox);
 vm.runInContext(script.slice(start,end)+';this.parseCVInfo=parseCVInfo;',sandbox);
 const parsed=sandbox.parseCVInfo('Sample Candidate\nAI & Software Engineer\n'+
   'Email: candidate@example.com\nPhone +20 101 234 5678\n'+
   'https://linkedin.com/in/sample-candidate\nhttps://github.com/sample-candidate\n'+
   'SUMMARY\nBuild CV and RAG applications\nSKILLS\nPython, PyTorch, OpenCV\nEDUCATION\nComputer Science\nEXPERIENCE\nAI Engineering Intern');
 assert.equal(parsed.email,'candidate@example.com');
 assert.match(parsed.linkedin,/linkedin.com\/in/);
 assert.match(parsed.github,/github.com/);
 assert.match(parsed.skills,/PyTorch/);
 assert.match(parsed.education,/Computer Science/);
});
const profileHandler=require('../api/profile.js');
const emailHandler=require('../api/test-email.js');
function response(){
 return {headers:{},setHeader(k,v){this.headers[k]=v},end(text){this.value=JSON.parse(text)}};
}
function authorized(method,body={},kind='profile'){
 return {method,body,query:{kind},headers:{'x-admin-token':'x'.repeat(32)}};
}
async function envTest(fn){
 const old={...process.env};
 process.env.ADMIN_TOKEN='x'.repeat(32);
 process.env.GITHUB_REPO='itz-youssef/Job-Hunter';
 process.env.GITHUB_TOKEN='fake-test-token';
 process.env.PROFILE_GITHUB_TOKEN='fake-test-token';
 process.env.PROFILE_GITHUB_REPO='itz-youssef/Job-Hunter-Private-CV';
 process.env.PROFILE_GITHUB_BRANCH='main';
 try{return await fn();}
 finally{
  for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];
  for(const [key,value] of Object.entries(old))process.env[key]=value;
 }
}
test('private CV API refuses public repository even for authenticated admin',async()=>{
 await envTest(async()=>{
   process.env.PROFILE_GITHUB_REPO=process.env.GITHUB_REPO;
   const res=response();
   await profileHandler(authorized('PUT',{profile:{name:'Private'}}),res);
   assert.equal(res.statusCode,503);
   assert.match(res.value.error,/public/i);
 });
});
test('private CV API refuses unauthenticated requests',async()=>{
 await envTest(async()=>{
   const res=response();
   await profileHandler({method:'GET',headers:{},query:{kind:'profile'}},res);
   assert.equal(res.statusCode,401);
 });
});
test('private CV API refuses repositories which are not marked private',async()=>{
 await envTest(async()=>{
   const old=global.fetch;
   global.fetch=async()=>({ok:true,status:200,json:async()=>({private:false})});
   try{
     const res=response();
     await profileHandler(authorized('GET'),res);
     assert.equal(res.statusCode,503);
     assert.match(res.value.error,/PRIVATE/);
   }finally{global.fetch=old;}
 });
});
test('private CV API writes only to a verified private repository',async()=>{
 await envTest(async()=>{
   const requests=[];
   const old=global.fetch;
   global.fetch=async(url,opts)=>{
     requests.push({url,opts});
     if(url.endsWith('/Job-Hunter-Private-CV/'))
       return {ok:true,status:200,json:async()=>({private:true})};
     if(url.includes('/contents/private/profile.json?ref='))return {ok:false,status:404,json:async()=>({})};
     if(url.includes('/contents/private/profile.json')&&opts.method==='PUT')
       return {ok:true,status:201,json:async()=>({content:{sha:'abc'}})};
     throw Error('Unexpected URL '+url);
   };
   try{
     const res=response();
     await profileHandler(authorized('PUT',{profile:{name:'Example',email:'sample@example.com'}}),res);
     assert.equal(res.statusCode,200);
     assert.equal(res.value.saved,true);
     assert.ok(requests.every(x=>x.url.includes('Job-Hunter-Private-CV')));
     assert.ok(requests.some(x=>x.url.includes('/contents/private/profile.json')&&x.opts.method==='PUT'));
   }finally{global.fetch=old;}
 });
});
test('email tester requires admin and dispatches a real GitHub workflow',async()=>{
 await envTest(async()=>{
  const denied=response();
  await emailHandler({method:'POST',headers:{}},denied);
  assert.equal(denied.statusCode,401);
  const old=global.fetch;
  let called='';
  global.fetch=async(url,opts)=>{called=url;assert.equal(opts.method,'POST');return {ok:true,status:204};};
  try{
   const res=response();
   await emailHandler(authorized('POST'),res);
   assert.equal(res.statusCode,202);
   assert.equal(res.value.queued,true);
   assert.match(called,/actions\/workflows\/test-email\.yml\/dispatches$/);
  }finally{global.fetch=old;}
 });
});
