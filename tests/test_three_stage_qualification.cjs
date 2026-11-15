'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const gates=require('../lib/secretj/three-stage-qualification');
const monitor=require('../lib/secretj/native-preference-monitor');
const preference={egypt_only:true,role_families:['ai_ml','software'],career_levels:['entry','internship'],max_experience_years:null,internships:false};
const mk=(title,description='')=>({title,description,company:'Test',location:'Cairo, Egypt',
 url:'https://example.com/careers/'+encodeURIComponent(title)});
test('entry and internships reject senior/staff/principal/lead titles even if text mentions entry skills',()=>{
 for(const title of ['Senior AI Engineer','Staff Software Engineer','Principal ML Engineer',
   'Principle Software Engineer','Lead Machine Learning Engineer']){
   const result=gates.reject(mk(title,'0-2 years of experience'),preference);
   assert.equal(result.ok,false,title);
 }
});
test('unrelated senior keywords in junior job description do not reject title',()=>{
 assert.equal(gates.reject(mk('Junior AI Engineer','Collaborates with senior staff and tech leads.'),
   preference).ok,true);
});
test('required experience 5 years excludes entry level; preferred years are not treated as hard minimum',()=>{
 assert.equal(gates.reject(mk('Junior AI Engineer','Required: minimum 5 years of experience in AI'),
   preference).ok,false);
 assert.equal(gates.reject(mk('Junior AI Engineer','5 years of experience preferred; fresh graduates welcome'),
   preference).ok,true);
});
test('senior-only preferences reject junior/intern/graduate and respect explicit level',()=>{
 const high={...preference,career_levels:['senior'],role_families:['ai_ml','software']};
 for(const title of ['Junior AI Engineer','AI Intern','Early-career AI Engineer','Fresh Graduate Software Engineer']){
   assert.equal(gates.reject(mk(title),high).ok,false,title);
 }
 assert.equal(gates.reject(mk('Senior AI Engineer','Required: 5 years of experience'),high).ok,true);
});
test('AI output needs genuine model response with valid confidence and career level',()=>{
 assert.throws(()=>gates.parseOutput({output:[{content:[{type:'output_text',text:'{"match":true,"confidence":3,"level":"entry","reason":"bad"}'}]}]}));
 const parsed=gates.parseOutput({output:[{content:[{type:'output_text',text:'{"match":true,"confidence":0.95,"level":"entry","reason":"entry requirements"}'}]}]});
 assert.equal(parsed.confidence,0.95);
});
test('AI stage rejects a low-confidence response without faking a verdict',async()=>{
 const j=mk('Junior AI Engineer','Build models with Python and PyTorch.');
 const env={OPENAI_API_KEY:'test',SECRETJ_AI_MODEL:'test-model',SECRETJ_AI_CONFIDENCE_THRESHOLD:'0.85'};
 const low=await gates.aiReview(j,preference,env,async(url,request)=>{
   assert.equal(url,'https://api.openai.com/v1/responses');
   assert.equal(request.method,'POST');
   assert.equal(JSON.parse(request.body).store,false);
   return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:
     '{"match":true,"confidence":0.6,"level":"entry","reason":"insufficient evidence"}'}]}]})};
 });
 assert.equal(low.status,'rejected');
 const unavailable=await gates.aiReview(j,preference,{});
 assert.equal(unavailable.status,'unavailable');
});
test('both monitor paths must qualify BEFORE storing and sending',()=>{
 const code=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 const api=fs.readFileSync('api/secretj-native-status.js','utf8');
 assert.match(code,/await qualifyJobs\(selected,latest\[0\],env,fetchImpl\)/);
 assert.match(code,/await qualifyJobs\(selected,user,env,fetchImpl\)/);
 assert.match(code,/qualification_status'='accepted'/);
 assert.match(api,/job_snapshot->>'qualification_status'='accepted'/);
});
test('without AI configuration engine explicitly labels its qualification as rules only',async()=>{
 const jobs=[mk('Junior AI Engineer','Build machine learning products'),
   mk('Senior AI Engineer','Mentor ML team')];
 const r=await monitor.qualifyJobs(jobs,preference,{});
 assert.equal(r.accepted.length,1);
 assert.equal(r.accepted[0].qualification_mode,'rules-only');
 assert.equal(r.rejected,1);
});
