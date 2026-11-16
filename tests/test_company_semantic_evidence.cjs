'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const evidence=require('../lib/secretj/company-semantics');
const qualification=require('../lib/secretj/three-stage-qualification');
const monitor=require('../lib/secretj/native-preference-monitor');
const p={egypt_only:true,internships:false,
  career_levels:['entry','internship'],role_families:['ai_ml','software','backend','cv'],
  max_experience_years:2};
const mk=(title,description,company='VOIS')=>({title,company,description,
  url:'https://jobs.vodafone.com/careers/job/123456',location:'Cairo, Egypt'});
test('Vodafone Work Experience Programme Technology: early-career + semantically technical',()=>{
 const job=mk('VOIS EG Work Experience Programme 2027 - Technology',
  'This 6-month Work Experience Internship Programme is for final-year students. Work on AI and machine learning, software development and DevOps.');
 assert.equal(evidence.employerTerms(job).program_level,'internship');
 assert.equal(evidence.preflight(job,p).ok,true);
 assert.equal(qualification.reject(job,p).ok,true);
});
test('Vodafone HR programme is an internship but not AI/software engineering',()=>{
 const job=mk('VOIS EG Work Experience Programme 2027 - HR Operations',
  'This internship involves employee onboarding, payroll, HR reporting and Excel.');
 assert.equal(evidence.employerTerms(job).program_level,'internship');
 assert.equal(evidence.fieldGate(job,p.role_families).decision,'reject');
 assert.equal(evidence.preflight(job,p).ok,false);
});
test('work experience alone without actual employer posting is NOT proof of internship',()=>{
 const j=mk('VOIS EG Work Experience Programme - Technology',
  'We are a technology company working with international customers.');
 assert.equal(evidence.employerTerms(j).program_level,null);
});
test('AI Sales Executive is irrelevant to AI/ML engineering despite keyword',()=>{
 const job=mk('AI Sales Executive','Sell AI products to clients and meet sales targets.');
 assert.equal(evidence.fieldGate(job,['ai_ml']).decision,'reject');
 assert.equal(qualification.reject(job,{...p,role_families:['ai_ml']}).ok,false);
});
test('Perception Engineer is semantically relevant to Computer Vision',()=>{
 const job=mk('Perception Engineer','Object detection, video analytics and visual recognition.', 'Example');
 assert.equal(evidence.preflight(job,{...p,role_families:['cv']}).ok,true);
});
test('Python API Developer is relevant to Backend',()=>{
 const job=mk('Python API Developer','Build REST APIs and backend services.', 'Example');
 assert.equal(evidence.fieldGate(job,['backend']).decision,'pass');
});
test('unusual but plausible title gets reviewed rather than deleted by keywords',()=>{
 const j=mk('Applied Intelligence Engineer','Develop and train machine learning models using PyTorch.');
 const result=evidence.preflight(j,{...p,role_families:['ai_ml']});
 assert.equal(result.ok,true);
 assert.equal(result.needsSemanticReview,true);
});
test('strict AI still decides ambiguous title before personal feed or emails',async()=>{
 const p2={...p,role_families:['ai_ml']};
 const candidate=mk('Applied Intelligence Engineer','Build machine learning models in Python.');
 const core=require('../lib/secretj/core');
 core.setQueryForTests(async sql=>{
  if(sql.includes('count(*)::int AS count FROM public.sj_ai_qualification_cache'))return [{count:0}];
  if(sql.includes('FROM public.sj_ai_qualification_cache'))return [];
  if(sql.includes('INSERT INTO public.sj_ai_qualification_cache'))return [];
  throw Error('Unexpected SQL: '+sql);
 });
 try{
  const ai={SECRETJ_AI_VERIFICATION_ENABLED:'true',AI:{
   run:async()=>({response:{match:true,confidence:0.91,level:'entry',
    reason:'machine learning development and engineering tasks'}})}};
  const out=await monitor.qualifyJobs([candidate],p2,ai);
  assert.equal(out.accepted.length,1);
  assert.equal(out.accepted[0].qualification_mode,'ai-reviewed');
 }finally{core.setQueryForTests(null);}
});

test('Corporate Security fraud internship is NOT cybersecurity engineering',()=>{
 const j=mk('VOIS EG Work Experience Programme - Corporate Security',
   'Fraud management team, fraud risk assessments, compliance and internal investigations.');
 assert.equal(evidence.fieldGate(j,['cybersecurity']).decision,'reject');
});
test('semantic uncertainty uses GPT-OSS, while explicit AI title stays on Llama',async()=>{
 const core=require('../lib/secretj/core');
 const calls=[];
 core.setQueryForTests(async sql=>{
   if(sql.includes('FROM public.sj_ai_qualification_cache'))return [];
   if(sql.includes('count(*)::int AS count FROM public.sj_ai_qualification_cache'))return [{count:0}];
   if(sql.includes('INSERT INTO public.sj_ai_qualification_cache'))return [];
   throw Error('Unexpected SQL: '+sql);
 });
 try{
  const env={SECRETJ_AI_VERIFICATION_ENABLED:'true',
   SECRETJ_CF_AI_MODEL:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',
   SECRETJ_SEMANTIC_AI_MODEL:'@cf/openai/gpt-oss-120b',
   AI:{run:async(model,opts)=>{
      calls.push(model);
      if(model.includes('gpt-oss'))
        return {choices:[{message:{content:JSON.stringify({
          match:true,confidence:0.93,level:'entry',reason:'Model development duties'
        })}}]};
      return {response:{match:true,confidence:0.91,level:'entry',
        reason:'Direct AI engineer role at junior level'}};
   }}};
  const roles=[
    mk('Applied Intelligence Engineer','Model training in PyTorch and machine learning pipelines.'),
    mk('Junior AI Engineer','Develop neural networks and ML inference applications.')
  ];
  const chosen=await monitor.qualifyJobs(roles,{...p,role_families:['ai_ml']},env);
  assert.equal(chosen.accepted.length,2);
  assert.ok(calls.includes('@cf/openai/gpt-oss-120b'));
  assert.ok(calls.includes('@cf/meta/llama-3.3-70b-instruct-fp8-fast'));
  assert.equal(chosen.accepted.find(x=>x.title.startsWith('Applied')).qualification_model,
    '@cf/openai/gpt-oss-120b');
 }finally{core.setQueryForTests(null);}
});
