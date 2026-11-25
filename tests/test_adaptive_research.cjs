'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../research/shadow-engine.cjs'),A=require('../research/research-agent.cjs');
const job={company:'Example',title:'Technology Associate',department:'Artificial Intelligence & Data',description:'Develop machine learning models for client projects. Build deep learning pipelines for production applications.',location:'Cairo',url:'https://example.com/job/1'};
const id=E.fingerprint(job);
const doc={id:'d',job_id:id,company:job.company,url:job.url,text:'Department: Artificial Intelligence & Data. '+job.description,duties:job.description,live:false};
const proposal={kind:'family',job_id:id,evidence_id:'d',family:'ai_ml',quote:'Develop machine learning models for client projects.',corroboration:'Build deep learning pipelines for production applications.'};
const check=(p,d=doc,m=A.MODELS[0])=>E.validate(p,new Map([[d.id,d]]),new Map([[id,job]]),m,'2026-11-25');
test('two different models required; exact job fingerprint prevents title-wide contamination',()=>{
 const a=check(proposal),b=check(proposal,doc,A.MODELS[1]);assert.ok(a&&b);
 assert.equal(E.shadow(job,[a]).families.includes('ai_ml'),false);
 const rules=E.mergeRules([a],[b]);assert.equal(rules[0].status,'cross-checked');
 assert.deepEqual(E.shadow(job,rules).families,['ai_ml']);
 assert.equal(E.shadow({...job,department:'HR',description:'Coordinate employee records.'},rules).families.includes('ai_ml'),false);
});
test('reject invented quotes, unsupported classifications, wrong jobs, incidental tools',()=>{
 assert.equal(check({...proposal,quote:'invented machine learning responsibilities'}),null);
 assert.equal(check({...proposal,family:'cybersecurity'}),null);
 assert.equal(check({...proposal,job_id:'other'}),null);
 assert.equal(check({...proposal,corroboration:proposal.quote}),null);
 assert.equal(check({...proposal,quote:'Machine learning is optional for HR staff.'},{...doc,text:doc.text+' Machine learning is optional for HR staff.'}),null);
});
test('employer-scoped branded alias needs live evidence and explicit level',()=>{
 const d={id:'live',company:'Example',url:'https://example.com/careers',live:true,text:'Our Future X programme is an internship for university students.'};
 const p={kind:'career',evidence_id:'live',alias:'Future X',level:'internship',quote:d.text};
 const a=check(p,d),b=check(p,d,A.MODELS[1]);assert.ok(a&&b);
 const rules=E.mergeRules([a],[b]);
 assert.equal(E.shadow({title:'Future X',company:'Example'},rules).level,'internship');
 assert.notEqual(E.shadow({title:'Future X',company:'Different'},rules).level,'internship');
 assert.equal(check(p,{...d,live:false}),null);
 assert.equal(check({...p,level:'senior'},d),null);
 assert.equal(E.mergeRules(rules,[{...a,key:'different',level:'entry'}]).every(r=>r.status==='conflict'),true);
});
test('free-only IDs, shared budget and Cairo rotation',()=>{
 assert.ok(A.MODELS.every(m=>m.endsWith(':free')));
 assert.notEqual(A.modelFor('2026-11-25'),A.modelFor('2026-11-26'));
 assert.equal(A.localDate(new Date('2026-11-25T22:00:00Z')),'2026-11-26');
 assert.equal(A.localHour(new Date('2026-11-25T22:00:00Z')),0);
 assert.ok(A.MODEL_BUDGET<50&&A.SEARCH_BUDGET*31<=1000&&A.MONTH_BUDGET<=1000);
 const s=A.newState();A.ledger(s,'2026-11-25');s.usage.search=24;A.ledger(s,'2026-11-26');assert.equal(s.usage.search,24);assert.equal(s.usage.search_day,0);
});
test('approved employer hosts and ATS tenants, no local networks',()=>{
 const c={url:'https://jobs.lever.co/example/'};
 assert.equal(A.allowed('https://jobs.lever.co/example/123',c),true);
 assert.equal(A.allowed('https://jobs.lever.co/other/123',c),false);
 assert.equal(A.allowed('https://jobs.lever.co.evil.com/example/',c),false);
 assert.equal(A.publicIp('127.0.0.1'),false);
 assert.equal(A.publicIp('169.254.169.254'),false);
 assert.equal(A.publicIp('::1'),false);
});
test('workflow cannot push main or access production email and DB keys',()=>{
 const s=fs.readFileSync('.github/workflows/adaptive-dictionary-research.yml','utf8');
 assert.match(s,/HEAD:refs\/heads\/research\/shadow-state/);
 assert.doesNotMatch(s,/HEAD:main|DATABASE_URL|RESEND_API_KEY|pull_request:/);
 const r=fs.readFileSync('research/research-agent.cjs','utf8');
 assert.doesNotMatch(r,/secretj-native-scan|RESEND_API_KEY|DATABASE_URL/);
});
test('semantic benchmark reports actual metric counts, not invented accuracy',()=>{
 const m=E.metrics([{expected:true,actual:true},{expected:true,actual:false},{expected:false,actual:true}]);assert.equal(m.tp,1);assert.equal(m.fp,1);assert.equal(m.fn,1);assert.equal(m.precision,0.5);
});

test('missing credentials fail closed without modifying any candidate dictionaries',()=>{
 const path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sj-shadow-'));
 try{
  const original={mode:'shadow',rules:[{key:'existing'}]};
  fs.writeFileSync(path.join(dir,'career-level-dictionary.json'),JSON.stringify(original));
  const env={...process.env,RESEARCH_STATE_DIR:dir,RESEARCH_MODE:'daily',GITHUB_EVENT_NAME:'workflow_dispatch',OPENROUTER_API_KEY:'',TAVILY_API_KEY:''};
  const r=cp.spawnSync(process.execPath,['research/research-agent.cjs'],{env,encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));
  assert.equal(report.status,'awaiting-keys');assert.equal(report.production_unchanged,true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'career-level-dictionary.json'))),original);
  assert.equal(fs.existsSync(path.join(dir,'state.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('ERNIE replaces unavailable Kimi; Nemotron retained; daily batch budget covers 60 companies',()=>{
 assert.deepEqual(A.MODELS,['baidu/ernie-5.5-flash-preview:free','nvidia/nemotron-3-ultra-550b-a55b:free']);
 assert.equal(A.BATCH_COMPANIES,2);assert.ok(Math.ceil(60/A.BATCH_COMPANIES)<A.MODEL_BUDGET);
});
test('provider parsing accepts complete JSON, fenced JSON and text parts; never repairs incomplete JSON',()=>{
 const data=JSON.stringify({proposals:[]});
 assert.deepEqual(A.parseJSON(data),{proposals:[]});
 assert.deepEqual(A.parseJSON('\x60\x60\x60json\n'+data+'\n\x60\x60\x60'),{proposals:[]});
 assert.deepEqual(A.parseJSON('Here is the result:\n'+data),{proposals:[]});
 assert.deepEqual(A.parseJSON([{type:'text',text:data}]),{proposals:[]});
 assert.deepEqual(A.parseJSON('<think>ignore {bad}</think>'+data),{proposals:[]});
 assert.throws(()=>A.parseJSON('{"proposals":['),/truncated-json/);
 assert.throws(()=>A.parseJSON('prefix {} {}'),/multiple-json-objects/);
 assert.throws(()=>A.decodeResponse({choices:[{finish_reason:'length',message:{content:data}}]}),/output-token-limit/);
 assert.throws(()=>A.decodeResponse({error:{code:404,message:'private provider text'}}),e=>e.status===404&&A.diagnostic(e)==='provider-http-404');
});
test('compact evidence is a contiguous source excerpt; diagnostic messages never leak provider body',()=>{
 const text='x'.repeat(6000)+' Responsibilities: Develop machine learning models for clients. '+ 'y'.repeat(6000);
 const d=A.compactDoc({id:'abc',text});
 assert.equal(d.id,'abc');assert.ok(d.text.length<=A.DOC_CHARS);assert.ok(text.includes(d.text));assert.match(d.text,/machine learning/);
 assert.equal(A.diagnostic(new Error('sensitive provider body')),'network-or-response-error');
});
