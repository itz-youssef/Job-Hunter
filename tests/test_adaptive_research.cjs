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
 const conflicting=E.mergeRules(rules,[{...a,key:'different',level:'entry'}]);
 assert.deepEqual(conflicting[0],rules[0]);assert.equal(conflicting[1].status,'conflict');
});
test('free-only IDs, shared budget and Cairo rotation',()=>{
 assert.ok(A.NEMOTRON.endsWith(':free'));assert.equal(A.HYDROGEN,'gemini-4-hydrogen');assert.ok(!A.MODELS.includes(A.LITE));
 assert.notEqual(A.modelFor('2026-11-25'),A.modelFor('2026-11-26'));
 assert.equal(A.localDate(new Date('2026-11-25T22:00:00Z')),'2026-11-26');
 assert.equal(A.localHour(new Date('2026-11-25T22:00:00Z')),0);
 assert.ok(A.MODEL_BUDGET===124&&A.MODEL_LIMITS[A.NEMOTRON]<=40&&A.SEARCH_BUDGET*31<=1000&&A.MONTH_BUDGET<=1000);
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
  const env={...process.env,RESEARCH_STATE_DIR:dir,RESEARCH_MODE:'daily',GITHUB_EVENT_NAME:'workflow_dispatch',OPENROUTER_API_KEY:'',GEMINI_API_KEY:'',GROQ_API_KEY:'',TAVILY_API_KEY:''};
  const r=cp.spawnSync(process.execPath,['research/research-agent.cjs'],{env,encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(fs.readFileSync(path.join(dir,'report.json')));
  assert.equal(report.status,'awaiting-keys');assert.equal(report.production_unchanged,true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'career-level-dictionary.json'))),original);
  assert.equal(fs.existsSync(path.join(dir,'state.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Hydrogen replaces ERNIE; Nemotron retained; Lite is preprocessing only',()=>{
 assert.deepEqual(A.MODELS,['gemini-4-hydrogen','nvidia/nemotron-3-ultra-550b-a55b:free']);
 assert.equal(A.BATCH_COMPANIES,1);assert.ok(A.DAILY_COMPANIES*2<A.MODEL_BUDGET);
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

test('cohort revisits same employers when model roles swap; benchmark small',()=>{
 const companies=Array.from({length:60},(_,i)=>({name:'Company '+i})),s=A.newState(),m=A.MODELS[0];
 const first=A.cohort(companies,s,'2026-11-25',m,'daily');assert.equal(first.length,10);
 s.research_cohort={day:'2026-11-25',model:m,names:first.map(c=>c.name)};
 assert.deepEqual(A.cohort(companies,s,'2026-11-26',A.MODELS[1],'daily'),first);
 assert.deepEqual(A.taskModels('career',m,'daily'),[m]);assert.deepEqual(A.taskModels('family',m,'daily'),[A.MODELS[1]]);
 assert.deepEqual(A.taskModels('family',m,'benchmark'),A.MODELS);
 assert.equal(A.cohort(companies,s,'2026-11-25',m,'benchmark').length,2);
});
test('independent tasks send only relevant evidence and keep quotes verifiable',()=>{
 const group={company:{name:job.company},documents:[doc,{id:'web',url:'https://example.com',company:job.company,live:true,text:'Our Future X programme is an internship for university students.'}],jobs:new Map([[id,job]])};
 const c=A.makeTask(group,'career',[]),f=A.makeTask(group,'family',[]);
 assert.equal(c.payload.documents.length,1);assert.equal(c.payload.documents[0].id,'web');
 assert.equal(f.payload.documents.length,1);assert.equal(f.payload.documents[0].job_id,id);
 assert.ok(f.docs[0].text.includes(proposal.quote));assert.ok(E.validate(proposal,new Map([[doc.id,f.docs[0]]]),f.jobs,A.MODELS[1],'2026-11-25'));
 assert.ok(c.payload.documents.every(d=>d.text.length<=A.TASK_TEXT_CHARS));
 assert.ok(f.payload.documents.every(d=>d.text.length<=A.TASK_TEXT_CHARS));
 assert.ok(A.cooldownMs({retryAfter:120000})>=120000);
});

test('append only preserves existing evidence and classifications, adds independent confirmations',()=>{
 const a=check(proposal),b=check(proposal,doc,A.MODELS[1]);assert.ok(a&&b);
 const updated=E.mergeRules([a],[{...b,evidence:{...b.evidence,checked_at:'2026-11-26'}}]);
 assert.deepEqual(updated[0].evidence,a.evidence);
 assert.equal(updated[0].status,'cross-checked');assert.deepEqual(updated[0].models,[A.MODELS[0],A.MODELS[1]]);
 assert.deepEqual(E.mergeRules(updated,[]),updated);
 assert.deepEqual(E.mergeRules(updated,[{...a,evidence:{quote:'replacement'}}]),updated);
 assert.throws(()=>E.assertAdditive(updated,[]),/rule-removal/);
 assert.throws(()=>E.assertAdditive(updated,[{...updated[0],family:'marketing'}]),/rule-overwrite/);
 assert.throws(()=>E.assertAdditive(updated,[{...updated[0],status:'candidate'}]),/status-downgrade/);
 assert.throws(()=>E.assertAdditive(updated,[{...updated[0],models:[]}]),/model-removal/);
});
test('new conflicting aliases are quarantined without mutating an existing accepted rule',()=>{
 const a={key:'a',kind:'career',company:'Example',alias:'Future X',level:'entry',models:[A.MODELS[0],A.MODELS[1]],status:'cross-checked',evidence:{quote:'original'}};
 const b={...a,key:'b',level:'internship'};
 const r=E.mergeRules([a],[b]);assert.deepEqual(r[0],a);assert.equal(r[1].status,'conflict');
 const fresh=E.mergeRules([],[a,b]);assert.ok(fresh.every(x=>x.status==='conflict'));
});

test('Gemini response parser ignores thoughts and rejects partial outputs',()=>{
 const valid={candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private reasoning'},{text:'{"proposals":[]}'}]}}]};
 assert.deepEqual(A.decodeGemini(valid),{proposals:[]});
 assert.throws(()=>A.decodeGemini({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}),/output-token-limit/);
 assert.throws(()=>A.decodeGemini({promptFeedback:{blockReason:'SAFETY'}}),/provider-finish-error/);
});
test('separate quota ledgers count failures before calls and respect Pacific and Cairo days',()=>{
 const s=A.newState(),now=new Date('2026-11-25T14:00:00Z');A.ledger(s,A.localDate(now));
 for(let i=0;i<A.MODEL_LIMITS[A.HYDROGEN];i++)A.recordCall(s,A.HYDROGEN,now);
 assert.equal(A.canCall(s,A.HYDROGEN,now),false);
 assert.equal(A.canCall(s,A.NEMOTRON,now),true);
 assert.equal(A.canCall(s,A.LITE,now),true);
 A.recordCall(s,A.LITE,now);assert.equal(s.usage.model,A.MODEL_LIMITS[A.HYDROGEN]);assert.equal(s.usage.preprocess,1);
 const later=new Date('2026-11-25T22:00:00Z');A.ledger(s,A.localDate(later));
 assert.equal(A.canCall(s,A.HYDROGEN,later),false);
 assert.equal(A.canCall(s,A.HYDROGEN,new Date('2026-11-26T08:01:00Z')),true);
 assert.ok(A.MODEL_INTERVALS[A.HYDROGEN]>=12000);
 assert.equal(A.MODEL_LIMITS[A.LITE],200);
});
test('Lite preserves original documents, accepts only verbatim evidence, and has no validation vote',()=>{
 const text='Our Future X programme is an internship for university students. Applications are open to students in their final two academic years.';
 const task={docs:[{id:'x',text},{id:'y',text:'Original document'}],payload:{documents:[{id:'x',text},{id:'y',text:'Original document'}]}};
 const valid=A.applyExcerpts(task,{excerpts:[{id:'x',text},{id:'y',text:'invented '.repeat(20)}]});
 assert.equal(valid.excerpts_used,1);assert.equal(valid.payload.documents[0].evidence_hint,text);assert.equal(valid.payload.documents[1].evidence_hint,undefined);
 assert.deepEqual(valid.docs,task.docs);assert.ok(!A.taskModels('family',A.HYDROGEN,'benchmark').includes(A.LITE));
 assert.ok(fs.readFileSync('.github/workflows/adaptive-dictionary-research.yml','utf8').includes('secrets.GEMINI_API_KEY'));
});

test('Google fallback changes endpoint, not the voting slot; failed model is not retried in same run',async()=>{
 const s=A.newState(),h={disabledModels:new Set(),cooldowns:new Map(),failedGoogle:new Set(),attempts:[]},seen=[];
 const send=async model=>{seen.push(model);if(model===A.HYDROGEN){const e=new Error('unavailable');e.status=503;throw e;}return {proposals:[]};};
 const args=[A.HYDROGEN,'system',{},s,{}, {stage:'career'},h,send];
 assert.deepEqual(await A.inferSlot(...args),{proposals:[]});
 assert.deepEqual(await A.inferSlot(...args),{proposals:[]});
 assert.deepEqual(seen,[A.HYDROGEN,A.GOOGLE_MODELS[1],A.GOOGLE_MODELS[1]]);
 assert.ok(h.attempts.every(x=>x.slot===A.HYDROGEN));
 assert.deepEqual(A.MODELS,[A.HYDROGEN,A.NEMOTRON]);
 assert.ok(A.GOOGLE_MODELS.every(m=>A.MODEL_LIMITS[m]===18&&A.MODEL_INTERVALS[m]>=12000));
 const one=check(proposal,doc,A.HYDROGEN),two=check(proposal,doc,A.HYDROGEN);
 assert.equal(E.mergeRules([one],[two])[0].status,'candidate');
 assert.equal(E.mergeRules([one],[check(proposal,doc,A.NEMOTRON)])[0].status,'cross-checked');
});
test('Google cascade stops on shared credential errors when Groq is not configured',async()=>{
 const s=A.newState(),h={disabledModels:new Set(),cooldowns:new Map(),failedGoogle:new Set(),attempts:[]},seen=[];
 h.groqEnabled=false;
 const send=async model=>{seen.push(model);const e=new Error('provider');e.status=model===A.HYDROGEN?503:403;throw e;};
 await assert.rejects(A.inferSlot(A.HYDROGEN,'s',{},s,{}, {},h,send),e=>e.status===403);
 assert.deepEqual(seen,A.GOOGLE_MODELS.slice(0,2));assert.ok(h.disabledModels.has(A.LITE));assert.equal(A.slotAvailable(s,A.HYDROGEN,h),false);assert.equal(A.slotAvailable(s,A.NEMOTRON,h),true);
});
test('all Google endpoints failing returns failure, never a fabricated decision',async()=>{
 const s=A.newState(),h={disabledModels:new Set(),cooldowns:new Map(),failedGoogle:new Set(),attempts:[]};
 await assert.rejects(A.inferSlot(A.HYDROGEN,'s',{},s,{}, {},h,async()=>{const e=new Error('unavailable');e.status=503;throw e;}),e=>e.status===503);
 assert.equal(h.attempts.length,4);assert.equal(A.slotAvailable(s,A.HYDROGEN,h),false);
});

test('all three Google endpoints failing invokes Groq and keeps the same voting identity',async()=>{
 const s=A.newState(),h={disabledModels:new Set(),cooldowns:new Map(),failedGoogle:new Set(),attempts:[],groqEnabled:true},seen=[];
 const send=async model=>{seen.push(model);if(model!==A.GROQ){const e=new Error('unavailable');e.status=503;throw e;}return {proposals:[]};};
 const args=[A.HYDROGEN,'s',{},s,{groq:'mock'}, {stage:'career'},h,send];
 assert.deepEqual(await A.inferSlot(...args),{proposals:[]});
 assert.deepEqual(await A.inferSlot(...args),{proposals:[]});
 assert.deepEqual(seen,[...A.GOOGLE_MODELS,A.GROQ,A.GROQ]);
 assert.ok(h.attempts.every(x=>x.slot===A.HYDROGEN));
 assert.equal(h.attempts.at(-1).model,A.GROQ);
 assert.equal(A.MODEL_LIMITS[A.GROQ],30);assert.ok(A.MODEL_INTERVALS[A.GROQ]>=60000);
 assert.equal(E.mergeRules([check(proposal,doc,A.HYDROGEN)],[check(proposal,doc,A.HYDROGEN)])[0].status,'candidate');
 assert.equal(E.mergeRules([check(proposal,doc,A.HYDROGEN)],[check(proposal,doc,A.NEMOTRON)])[0].status,'cross-checked');
});
test('shared Google auth failure bypasses all remaining Google models but never disables Groq',async()=>{
 const s=A.newState(),h={disabledModels:new Set(),cooldowns:new Map(),failedGoogle:new Set(),attempts:[],groqEnabled:true},seen=[];
 const send=async model=>{seen.push(model);if(model!==A.GROQ){const e=new Error('forbidden');e.status=403;throw e;}return {proposals:[]};};
 assert.deepEqual(await A.inferSlot(A.HYDROGEN,'s',{},s,{groq:'mock'}, {},h,send),{proposals:[]});
 assert.deepEqual(seen,[A.HYDROGEN,A.GROQ]);assert.ok(h.googleDisabled);assert.ok(h.disabledModels.has(A.LITE));assert.ok(A.slotAvailable(s,A.HYDROGEN,h));
});
test('Groq exhaustion does not block NVIDIA or exceed the shared research cap',()=>{
 const s=A.newState(),now=new Date(),h={googleDisabled:true,groqEnabled:true,disabledModels:new Set()};
 for(let i=0;i<A.MODEL_LIMITS[A.GROQ];i++)A.recordCall(s,A.GROQ,now);
 assert.equal(A.slotAvailable(s,A.HYDROGEN,h,now),true);
 assert.equal(A.slotAvailable(s,A.NEMOTRON,h,now),true);
 s.usage.model=A.EMERGENCY_MODEL_BUDGET;assert.equal(A.canCall(s,A.GROQ,now),false);
 assert.ok(fs.readFileSync('.github/workflows/adaptive-dictionary-research.yml','utf8').includes('secrets.GROQ_API_KEY'));
});

test('expanded budgets are independent and manual benchmarks preserve nightly capacity',()=>{
 const s=A.newState(),now=new Date('2026-11-25T14:00:00Z');A.ledger(s,A.localDate(now));s.runMode='benchmark';
 assert.equal(A.MODEL_BUDGET,124);
 assert.equal(A.effectiveLimit(s,A.NEMOTRON),30);
 assert.equal(A.effectiveLimit(s,A.HYDROGEN),8);
 assert.equal(A.effectiveLimit(s,A.GROQ),20);
 assert.equal(A.effectiveLimit(s,A.LITE),180);
 for(let i=0;i<8;i++)A.recordCall(s,A.HYDROGEN,now);
 assert.equal(A.canCall(s,A.HYDROGEN,now),false);
 assert.equal(A.canCall(s,A.GOOGLE_MODELS[1],now),true);
 const report=A.usageView(s,now);
 assert.equal(report[A.HYDROGEN].remaining,10);
 assert.equal(report[A.HYDROGEN].benchmark_remaining,0);
 s.runMode='daily';
 for(let i=0;i<10;i++)A.recordCall(s,A.HYDROGEN,now);
 assert.equal(A.canCall(s,A.HYDROGEN,now),false);
 assert.equal(A.canCall(s,A.NEMOTRON,now),true);
});
test('legacy unattributed requests are preserved and conservatively debited to OpenRouter across Cairo midnight',()=>{
 const s=A.newState(),now=new Date('2026-11-25T14:00:00Z');A.ledger(s,A.localDate(now));
 for(let i=0;i<6;i++){A.recordCall(s,A.NEMOTRON,now);A.recordCall(s,A.HYDROGEN,now);}
 s.usage.model+=14;A.migrateLegacyUsage(s,now);A.migrateLegacyUsage(s,now);
 assert.equal(s.usage.model,26);assert.equal(s.usage.legacy_model_requests.count,14);
 assert.equal(A.usageView(s,now)[A.NEMOTRON].remaining,20);
 assert.equal(A.usageView(s,now)[A.NEMOTRON].benchmark_remaining,10);
 assert.equal(A.usageView(s,now)[A.HYDROGEN].remaining,12);
 const later=new Date('2026-11-25T22:00:00Z');A.ledger(s,A.localDate(later));
 assert.equal(A.usageView(s,later)[A.NEMOTRON].remaining,20);
 assert.equal(A.usageView(s,new Date('2026-11-26T01:00:00Z'))[A.NEMOTRON].remaining,40);
});
test('Groq rolling token budget charges failed attempts and preserves an overnight token reserve',()=>{
 const s=A.newState(),now=new Date('2026-11-25T14:00:00Z');s.runMode='benchmark';
 assert.ok(A.groqTokenEstimate('system',{documents:[]})>4096);
 assert.equal(A.GROQ_TOKEN_BUDGET,75000);assert.equal(A.GROQ_TOKEN_RESERVE,60000);
 A.reserveGroqTokens(s,14000,now);
 assert.throws(()=>A.reserveGroqTokens(s,1001,now),/model-budget/);
 s.runMode='daily';A.reserveGroqTokens(s,61000,now);
 assert.equal(A.groqTokensUsed(s,now),75000);
 assert.throws(()=>A.reserveGroqTokens(s,1,now),/model-budget/);
 assert.equal(A.groqTokensUsed(s,new Date(now.getTime()+86400001)),0);
});

test('system limit skips each saturated endpoint without sending a request and routes to Groq',async()=>{
 const s=A.newState(),now=new Date(),h={disabledModels:new Set(),cooldowns:new Map(),failedGoogle:new Set(),attempts:[],groqEnabled:true},seen=[];
 A.ledger(s,A.localDate(now));
 for(const model of A.GOOGLE_MODELS)for(let i=0;i<A.MODEL_LIMITS[model];i++)A.recordCall(s,model,now);
 const before=s.usage.model;
 const send=async model=>{seen.push(model);return {proposals:[]};};
 assert.deepEqual(await A.inferSlot(A.HYDROGEN,'s',{},s,{groq:'mock'},{stage:'career'},h,send),{proposals:[]});
 assert.deepEqual(seen,[A.GROQ]);assert.equal(s.usage.model,before);
 assert.deepEqual(h.attempts.slice(0,3).map(x=>[x.model,x.outcome,x.code,x.charged]),A.GOOGLE_MODELS.map(m=>[m,'skipped','system-limit',false]));
 const u=A.usageView(s,now);assert.equal(u[A.HYDROGEN].system_used,18);assert.equal(u[A.HYDROGEN].system_limit_reached,true);
 for(let i=0;i<A.MODEL_LIMITS[A.GROQ];i++)A.recordCall(s,A.GROQ,now);
 assert.equal(A.slotAvailable(s,A.HYDROGEN,h),true);
 for(const model of A.RESEARCH_POOL)for(let i=A.MODEL_LIMITS[model];i<A.EMERGENCY_LIMITS[model];i++)A.recordCall(s,model,now,true);
 assert.equal(A.slotAvailable(s,A.HYDROGEN,h),false);
 await assert.rejects(A.inferSlot(A.HYDROGEN,'s',{},s,{groq:'mock'},{stage:'family'},h,send),e=>e.code==='model-budget');
 assert.deepEqual(seen,[A.GROQ]);assert.equal(A.slotAvailable(s,A.NEMOTRON,h),true);
});
test('nightly reserve and local quota exceptions fail over without quarantine or extra charge',async()=>{
 const s=A.newState(),now=new Date(),h={disabledModels:new Set(),cooldowns:new Map(),failedGoogle:new Set(),attempts:[],groqEnabled:true},seen=[];
 A.ledger(s,A.localDate(now));s.runMode='benchmark';
 for(let i=0;i<A.effectiveLimit(s,A.HYDROGEN);i++)A.recordCall(s,A.HYDROGEN,now);
 const next=A.GOOGLE_MODELS[1],third=A.GOOGLE_MODELS[2];
 const send=async model=>{seen.push(model);if(model===next)throw A.budgetException('system-limit');return {proposals:[]};};
 await A.inferSlot(A.HYDROGEN,'s',{},s,{groq:'mock'},{stage:'benchmark-family'},h,send);
 assert.deepEqual(seen,[next,third]);assert.equal(h.attempts[0].code,'nightly-reserve');
 assert.equal(h.attempts[1].outcome,'skipped');assert.equal(h.attempts[1].charged,false);assert.equal(h.failedGoogle.has(next),false);
 assert.equal(A.usageView(s,now)[A.HYDROGEN].system_limit_reached,false);
});

test('emergency routes by provider headroom only after normal exhaustion, keeps one vote, respects hard caps',async()=>{
 const s=A.newState(),now=new Date(),h={disabledModels:new Set(),cooldowns:new Map(),failedGoogle:new Set(),attempts:[],groqEnabled:true},seen=[];
 A.ledger(s,A.localDate(now));s.runMode='daily';
 for(const model of A.RESEARCH_POOL)for(let i=0;i<A.MODEL_LIMITS[model];i++)A.recordCall(s,model,now);
 assert.deepEqual(A.emergencyCandidates(s,h,now),[A.GROQ,...A.GOOGLE_MODELS]);
 const send=async (model,system,payload,state,keys,opts)=>{assert.equal(opts.emergency,true);seen.push(model);A.recordCall(state,model,new Date(),true);return {proposals:[]};};
 await A.inferSlot(A.HYDROGEN,'s',{},s,{groq:'mock'},{stage:'career'},h,send);
 assert.deepEqual(seen,[A.GROQ]);assert.equal(h.attempts.at(-1).tier,'emergency');assert.equal(h.attempts.at(-1).slot,A.HYDROGEN);
 for(let i=A.MODEL_LIMITS[A.GROQ]+1;i<A.EMERGENCY_LIMITS[A.GROQ];i++)A.recordCall(s,A.GROQ,now,true);
 for(const model of A.GOOGLE_MODELS)await A.inferSlot(A.HYDROGEN,'s',{},s,{groq:'mock'},{stage:'family'},h,send);
 assert.deepEqual(seen,[A.GROQ,...A.GOOGLE_MODELS]);assert.equal(A.slotAvailable(s,A.HYDROGEN,h),false);
 assert.equal(A.EMERGENCY_MODEL_BUDGET,157);
 assert.equal(A.usageView(s,now)[A.GROQ].emergency_used,30);
 assert.equal(A.usageView(s,now)[A.HYDROGEN].estimated_provider_headroom,1);
 assert.throws(()=>A.recordCall(s,A.NEMOTRON,now,true),/model-budget/);
});
test('emergency cannot spend a protected benchmark reserve or override Groq token cap',()=>{
 const s=A.newState(),now=new Date(),h={groqEnabled:true};A.ledger(s,A.localDate(now));s.runMode='benchmark';
 for(const model of A.RESEARCH_POOL)for(let i=0;i<A.effectiveLimit(s,model);i++)A.recordCall(s,model,now);
 assert.deepEqual(A.emergencyCandidates(s,h,now),[]);
 s.runMode='daily';
 for(const model of A.RESEARCH_POOL)for(let i=A.effectiveLimit({...s,runMode:'benchmark'},model);i<A.MODEL_LIMITS[model];i++)A.recordCall(s,model,now);
 A.reserveGroqTokens(s,A.GROQ_TOKEN_BUDGET,now);
 assert.deepEqual(A.emergencyCandidates(s,h,now),A.GOOGLE_MODELS);
});
test('reset timestamps are timezone aware and Groq provider reset is based on returned duration',()=>{
 const now=new Date('2026-11-25T15:00:00Z'),s=A.newState();A.ledger(s,A.localDate(now));
 assert.equal(A.nextDayReset('Africa/Cairo',now),'2026-11-25T22:00:00.000Z');
 assert.equal(A.nextDayReset('UTC',now),'2026-11-26T00:00:00.000Z');
 assert.equal(A.nextDayReset('America/Los_Angeles',now),'2026-11-26T08:00:00.000Z');
 assert.equal(A.durationMs('2m59.56s'),179560);
 assert.equal(A.durationMs('1h2m3s'),3723000);
 A.captureGroqReset(s,{get:()=> '2m59.56s'},now);
 const u=A.usageView(s,now);
 assert.equal(u[A.HYDROGEN].provider_reset_at,'2026-11-26T08:00:00.000Z');
 assert.equal(u[A.GROQ].provider_reset_at,'2026-11-25T15:02:59.560Z');
 assert.equal(u[A.NEMOTRON].provider_reset_at,'2026-11-26T00:00:00.000Z');
 assert.equal(u[A.GROQ].provider_tpm_reset_at,'2026-11-25T15:02:59.560Z');
 assert.equal(u[A.GROQ].provider_reset_observed_at,now.toISOString());
});

test('detailed rejection reason uses same validation gate and does not change acceptance',()=>{
 const docs=new Map([[doc.id,doc]]),jobs=new Map([[id,job]]);
 const detail=p=>E.validateDetailed(p,docs,jobs,A.HYDROGEN,'2026-11-25');
 assert.deepEqual(detail(proposal),{rule:check(proposal),reason:null});
 for(const [p,reason] of [
  [{...proposal,quote:'invented machine learning responsibilities'},'quote-not-in-source'],
  [{...proposal,evidence_id:'missing'},'unknown-evidence-id'],
  [{...proposal,quote:'short'},'quote-length'],
  [{...proposal,family:'cybersecurity'},'missing-job-family-anchor'],
  [{...proposal,job_id:'other'},'unknown-job-id'],
  [{...proposal,corroboration:proposal.quote},'corroboration-not-independent']
 ]){assert.deepEqual(detail(p),{rule:null,reason});assert.equal(check(p),null);}
 const d={id:'live',company:'Example',url:'https://example.com/careers',live:true,text:'Our Future X programme is an internship for university students.'};
 const p={kind:'career',evidence_id:d.id,alias:'Future X',level:'senior',quote:d.text};
 assert.equal(E.validateDetailed(p,new Map([[d.id,d]]),jobs,A.HYDROGEN,'2026-11-25').reason,'missing-career-level-signal');
});
test('rejection log records actual endpoint, bounded public evidence and excludes arbitrary fields',()=>{
 const p={...proposal,quote:'invented machine learning responsibilities',url:'https://untrusted.example/',secret:'DO NOT STORE'};
 const x=A.rejectedProposalRecord(p,new Map([[doc.id,doc]]),new Map([[id,job]]),{company:job.company,kind:'family',model:A.GROQ,slot:A.HYDROGEN,reason:'quote-not-in-source',day:'2026-11-25'});
 assert.equal(x.actual_model,A.GROQ);assert.equal(x.voting_slot,A.HYDROGEN);
 assert.equal(x.reason,'quote-not-in-source');assert.equal(x.evidence.url,doc.url);assert.equal(x.evidence.quote_found,false);
 assert.equal(x.proposal.job_title,job.title);assert.equal(x.proposal.quote,p.quote);
 assert.ok(!JSON.stringify(x).includes('DO NOT STORE'));assert.ok(!JSON.stringify(x).includes('untrusted.example'));
});

test('rejected proposal links are resolved from trusted catalog jobs, never model URLs',()=>{
 const docs=new Map([[doc.id,doc]]),jobs=new Map([[id,job]]);
 const meta={company:job.company,kind:'family',model:A.GROQ,slot:A.HYDROGEN,reason:'quote-not-in-source',day:'2026-11-25'};
 const result=A.rejectedProposalRecord({...proposal,job_url:'https://untrusted.example/'},docs,jobs,meta);
 assert.equal(result.proposal.job_url,job.url);
 assert.equal(result.evidence.job_url,job.url);
 assert.equal(result.evidence.job_title,job.title);
 assert.ok(!JSON.stringify(result).includes('untrusted.example'));
 const missing=A.rejectedProposalRecord({...proposal,job_id:'unknown'},docs,jobs,meta);
 assert.equal(missing.proposal.job_url,null);
 assert.equal(missing.evidence.job_url,job.url);
 const careerDoc={id:'career',url:'https://example.com/careers',company:job.company,live:true,text:'Public programme information'};
 const career=A.rejectedProposalRecord({kind:'career',evidence_id:'career',alias:'Future X'},new Map([['career',careerDoc]]),jobs,{...meta,kind:'career'});
 assert.equal(career.proposal.job_url,null);assert.equal(career.evidence.job_url,null);assert.equal(career.evidence.url,careerDoc.url);
 const unsafe=A.rejectedProposalRecord(proposal,docs,new Map([[id,{...job,url:'javascript:alert(1)',apply_url:'https://example.com/apply/1'}]]),meta);
 assert.equal(unsafe.proposal.job_url,'https://example.com/apply/1');
});

test('GLM only backs up Nemotron, same stable vote and unchanged aggregate limits',async()=>{
 const s=A.newState();A.ledger(s,A.localDate());const h={glmEnabled:true,attempts:[],disabledModels:new Set(),cooldowns:new Map()};
 const seen=[];const send=async m=>{seen.push(m);if(m===A.NEMOTRON){const e=new Error('busy');e.status=503;throw e;}return {proposals:[]};};
 await A.inferSlot(A.NEMOTRON,'s',{},s,{}, {stage:'career'},h,send);
 assert.deepEqual(seen,[A.NEMOTRON,A.GLM]);assert.equal(h.attempts.at(-1).slot,A.NEMOTRON);assert.equal(h.attempts.at(-1).model,A.GLM);
 await A.inferSlot(A.NEMOTRON,'s',{},s,{}, {stage:'family'},h,send);
 assert.deepEqual(seen,[A.NEMOTRON,A.GLM,A.GLM]);
 assert.ok(!A.MODELS.includes(A.GLM)&&!A.RESEARCH_POOL.includes(A.GLM));assert.equal(A.MODEL_BUDGET,124);assert.equal(A.EMERGENCY_MODEL_BUDGET,157);
 assert.equal(A.MODEL_LIMITS[A.GLM]*A.GLM_NEURONS_PER_CALL,A.GLM_NEURON_BUDGET);
 assert.ok(A.glmNeuronEstimate('s',{text:'a'.repeat(4000)},4096)<A.GLM_NEURONS_PER_CALL);
 assert.equal(A.glmConfigured({cfToken:'mock',cfAccount:'a'.repeat(32)}),true);
 assert.equal(A.glmConfigured({cfToken:'mock',cfAccount:'invalid'}),false);
});
test('GLM can take over after Nemotron normal limit, and preserves its own nightly reserve',async()=>{
 const s=A.newState(),now=new Date();A.ledger(s,A.localDate(now));
 for(let i=0;i<A.MODEL_LIMITS[A.NEMOTRON];i++)A.recordCall(s,A.NEMOTRON,now);
 const h={glmEnabled:true,attempts:[]},seen=[];
 await A.inferSlot(A.NEMOTRON,'s',{},s,{}, {},h,async m=>{seen.push(m);return {proposals:[]};});
 assert.deepEqual(seen,[A.GLM]);assert.equal(h.attempts[0].code,'system-limit');
 for(let i=0;i<10;i++)A.recordCall(s,A.GLM,now);
 Object.defineProperty(s,'runMode',{value:'benchmark'});
 assert.equal(A.slotAvailable(s,A.NEMOTRON,h,now),false);
 assert.equal(A.usageView(s,now)[A.GLM].estimated_neurons_reserved,4000);
 assert.equal(A.providerDay(A.GLM,new Date('2026-11-25T23:59:00Z')),'2026-11-25');
});

test('daily research uses one Cairo-time morning schedule and preserves manual mode',()=>{
 const fs=require('node:fs'),workflow=fs.readFileSync('.github/workflows/adaptive-dictionary-research.yml','utf8'),source=fs.readFileSync('research/research-agent.cjs','utf8');
 assert.match(workflow,/cron: '15 10 \* \* \*'/);assert.match(workflow,/timezone: 'Africa\/Cairo'/);assert.doesNotMatch(workflow,/0 21,22/);assert.match(source,/scheduled&&!\[10,11\]/);assert.match(source,/state\.last_attempt===day/);
 assert.equal(A.localHour(new Date('2026-11-26T08:15:00Z')),10);assert.equal(A.localHour(new Date('2026-07-26T07:15:00Z')),10);
});


test('provider calendar resets system quota at UTC and Pacific boundaries even with Cairo-day calls',()=>{
 const s=A.newState(),before=new Date('2026-11-26T07:59:59Z'),after=new Date('2026-11-26T08:00:00Z');
 A.ledger(s,A.localDate(before));
 for(let i=0;i<A.MODEL_LIMITS[A.HYDROGEN];i++)A.recordCall(s,A.HYDROGEN,before);
 A.recordCall(s,A.LITE,before);
 assert.equal(A.canCall(s,A.HYDROGEN,before),false);
 assert.equal(A.usageView(s,before)[A.HYDROGEN].remaining,0);
 assert.equal(A.usageView(s,after)[A.HYDROGEN].system_used,0);
 assert.equal(A.usageView(s,after)[A.HYDROGEN].used_today,18);
 assert.equal(A.usageView(s,after)[A.LITE].system_used,0);
 assert.equal(A.canCall(s,A.HYDROGEN,after),true);
 A.recordCall(s,A.HYDROGEN,after);
 assert.equal(A.usageView(s,after)[A.HYDROGEN].system_used,1);
 assert.equal(s.usage.model,19); // shared Cairo cap still counts every call
 const t=A.newState(),utcBefore=new Date('2026-11-26T23:59:59Z'),utcAfter=new Date('2026-11-27T00:00:00Z');
 A.ledger(t,A.localDate(utcBefore));
 for(const m of [A.NEMOTRON,A.GLM]){
  for(let i=0;i<A.MODEL_LIMITS[m];i++)A.recordCall(t,m,utcBefore);
  assert.equal(A.canCall(t,m,utcBefore),false);
  assert.equal(A.usageView(t,utcAfter)[m].system_used,0);
  assert.equal(A.canCall(t,m,utcAfter),true);
 }
 assert.equal(A.usageView(t,utcAfter)[A.GLM].estimated_neurons_reserved,0);
});
test('Cairo midnight alone cannot refill a provider calendar budget; rolling Groq tokens and shared cap stay intact',()=>{
 const s=A.newState(),a=new Date('2026-11-25T21:59:59Z'),b=new Date('2026-11-25T22:00:00Z');
 A.ledger(s,A.localDate(a));for(let i=0;i<A.MODEL_LIMITS[A.NEMOTRON];i++)A.recordCall(s,A.NEMOTRON,a);
 A.reserveGroqTokens(s,1200,a);A.ledger(s,A.localDate(b));
 assert.equal(A.canCall(s,A.NEMOTRON,b),false);
 assert.equal(A.groqTokensUsed(s,new Date('2026-11-26T00:00:00Z')),1200);
 assert.equal(A.canCall(s,A.NEMOTRON,new Date('2026-11-26T00:00:00Z')),true);
 s.usage.model=A.EMERGENCY_MODEL_BUDGET;
 assert.equal(A.canCall(s,A.NEMOTRON,new Date('2026-11-26T00:00:00Z')),false);
});
test('Groq short RPD countdown is telemetry, not an automatic full local refill',()=>{
 const s=A.newState(),now=new Date('2026-11-26T08:45:00Z');A.ledger(s,A.localDate(now));
 A.recordCall(s,A.GROQ,now);
 A.captureGroqReset(s,{get:()=> '4m'},now);
 const after=new Date('2026-11-26T08:49:01Z'),u=A.usageView(s,after)[A.GROQ];
 assert.equal(u.system_used,1);assert.equal(u.reset_policy,'local-utc-provider-rpd-unverified');
 assert.equal(u.provider_reset_at,'2026-11-26T08:49:00.000Z');
 assert.equal(u.system_reset_at,'2026-11-27T00:00:00.000Z');
});


test('replay 13 logged November 26 proposals with exact model-visible excerpts',()=>{
 const rows=require('./fixtures/shadow-rejections-20261126.json');
 const accepted=[],rejected=[];
 for(const row of rows){
  const m=row.source.match(/ Department:\s*(.*?)\s*Duties: (.*)$/);
  assert.ok(m,row.title);
  const j={company:row.company,title:row.title,url:row.url,department:m[1],description:m[2]};
  const key=E.fingerprint(j),d={id:'replay',company:j.company,job_id:key,url:j.url,text:row.source,duties:m[2]};
  const p={kind:'family',job_id:key,evidence_id:d.id,family:row.family,quote:row.quote,corroboration:row.corroboration};
  const result=E.validateDetailed(p,new Map([[d.id,d]]),new Map([[key,j]]),row.model,'2026-11-26');
  if(result.rule){
   accepted.push(row.number);
   assert.equal(result.rule.status,'candidate');assert.deepEqual(result.rule.models,[row.model]);
   assert.ok(row.source.includes(result.rule.evidence.quote));
   if(!result.rule.evidence.corroboration.startsWith('Official department: '))assert.ok(m[2].includes(result.rule.evidence.corroboration));
  }else rejected.push({number:row.number,reason:result.reason});
 }
 console.log('Historical rejection replay:',JSON.stringify({accepted,rejected}));
 assert.deepEqual(accepted,[1,3,4,5,6,7,8,9,10,12,13]);
 assert.deepEqual(rejected.map(x=>x.number),[2,11]);
});
test('exact departments and recovered duties never bypass identity, provenance, primary work or independent evidence',()=>{
 const run=(department,duties,family,quote,corroboration='',overrides={})=>{
  const j={company:'Test',title:'Specialist',department,description:duties,url:'https://example.com/role'};
  const id=E.fingerprint(j),d={id:'d',job_id:id,company:j.company,url:j.url,duties,text:'Title: Specialist Department: '+department+' Duties: '+duties,...overrides};
  return E.validateDetailed({kind:'family',job_id:id,evidence_id:d.id,family,quote,corroboration},new Map([[d.id,d]]),new Map([[id,j]]),A.HYDROGEN,'2026-11-26');
 };
 assert.ok(run('Operations','Manage shipments and coordinate dispatch.','operations','Department: Operations').rule);
 assert.equal(run('Engineering','Maintain industrial equipment and inspect mechanical assemblies.','software','Department: Engineering').rule,null);
 assert.equal(run('Engineering','Maintain industrial equipment. Requirements: Write production code. Conduct code reviews for engineers.','software','Department: Engineering').rule,null);
 assert.equal(run('Engineering','Write production code for applications. Requirements: Conduct code reviews for engineers.','software','Department: Engineering').rule,null);
 assert.equal(run('Engineering','Write production code for applications. Conduct code reviews for engineers.','software','Department: Engineering','Fabricated software engineering evidence.').rule,null);
 assert.equal(run('','Review financial statements for clients. Requirements: Build financial models.','finance','Review financial statements for clients.','Build financial models.').rule,null);
 assert.equal(run('','Manage project schedules and dependencies. Manage project documentation for clients.','project','Manage project schedules and dependencies.','Manage project schedules and dependencies.').rule,null);
 assert.equal(run('','Manage employee payroll. Support employees with optional software access.','it_support','Support employees with optional software access.').rule,null);
 assert.equal(run('Operations','Coordinate daily shipments.','operations','Department: Operations','',{company:'Other'}).rule,null);
});


test('semantic judge independently repairs grounded evidence but never adds a second vote',()=>{
 const J=require('../research/semantic-review.cjs'),row=require('./fixtures/shadow-rejections-20261126.json')[10],m=row.source.match(/ Department:\s*(.*?)\s*Duties: (.*)$/);
 const j={company:row.company,title:row.title,url:row.url,department:m[1],description:m[2]},key=E.fingerprint(j),d={id:'judge',job_id:key,company:j.company,url:j.url,text:row.source,duties:m[2]};
 const p={kind:'family',job_id:key,evidence_id:d.id,family:row.family,quote:row.quote,corroboration:row.corroboration},docs=new Map([[d.id,d]]),jobs=new Map([[key,j]]);
 const initial=E.validateDetailed(p,docs,jobs,A.HYDROGEN,'2026-11-26');
 const c=J.buildCase(p,docs,jobs,{model:'gemini-3.6-flash',slot:A.HYDROGEN,day:'2026-11-26'},initial);
 assert.ok(c);assert.equal(initial.rule,null);
 const result={id:c.publicCase.id,checks:['pass','pass','unknown','pass'],explanation:'Sales organization management is a core sales duty, but only one explicit duty is present.',alternative:'',quote:p.quote,corroboration:''};
 const judged=J.adjudicate(c,result,{model:A.NEMOTRON,slot:A.NEMOTRON},'2026-11-26');
 assert.equal(judged.rule,null);assert.equal(judged.review.decision,'human-review');
 assert.equal(J.adjudicate(c,result,{model:'gemini-3.8-flash',slot:A.HYDROGEN},'2026-11-26').review.verdict,'unavailable');
 assert.equal(J.adjudicate(c,{...result,quote:'Made up quote about sales management.'},{model:A.NEMOTRON,slot:A.NEMOTRON},'2026-11-26').review.verdict,'uncertain');
 assert.equal(J.buildCase({...p,quote:'Made up quote about sales management.'},docs,jobs,{model:A.HYDROGEN,slot:A.HYDROGEN,day:'2026-11-26'},{rule:null,reason:'quote-not-in-source'}),null);
 const candidate=J.buildCase(proposal,new Map([[doc.id,doc]]),new Map([[id,job]]),{model:A.HYDROGEN,slot:A.HYDROGEN,day:'2026-11-26'},{rule:check(proposal),reason:null});
 const audit=J.adjudicate(candidate,{id:candidate.publicCase.id,checks:['pass','fail','pass','unknown'],explanation:'Possible competing role.',quote:proposal.quote,corroboration:proposal.corroboration},{model:A.NEMOTRON,slot:A.NEMOTRON},'2026-11-26');
 assert.equal(audit.rule,null);assert.equal(audit.review.decision,'audit-flagged');
 const repaired=J.adjudicate({...candidate,publicCase:{...candidate.publicCase,initial_status:'rejected'}},{id:candidate.publicCase.id,checks:['pass','pass','pass','pass'],explanation:'Both duties directly support machine learning.',quote:proposal.quote,corroboration:proposal.corroboration},{model:A.NEMOTRON,slot:A.NEMOTRON},'2026-11-26');
 assert.equal(repaired.review.decision,'recovered-candidate');assert.deepEqual(repaired.rule.models,[A.HYDROGEN]);assert.equal(repaired.rule.status,'candidate');
});
test('semantic reviews use bounded normal calls after research and preserve quotas on exhaustion',async()=>{
 const J=require('../research/semantic-review.cjs'),s=A.newState(),now=new Date();A.ledger(s,A.localDate(now));
 const cases=Array.from({length:20},(_,i)=>{const c=J.buildCase(proposal,new Map([[doc.id,doc]]),new Map([[id,job]]),{model:A.HYDROGEN,slot:A.HYDROGEN,day:A.localDate(now)},{rule:null,reason:'missing-job-family-anchor'});c.publicCase.id=E.hash('case'+i);return c;});
 const h={nemotronEnabled:true,glmEnabled:false,attempts:[],failedFirst:new Set(),disabledModels:new Set(),cooldowns:new Map()};
 let calls=0;
 const result=await A.reviewSemantics(cases,s,{},h,A.localDate(now),Date.now(),async(model,system,payload,state,keys,opts)=>{
  assert.equal(model,A.NEMOTRON);assert.equal(opts.emergency,false);assert.ok(payload.cases.length<=3);calls++;
  A.recordCall(state,model,new Date());return {reviews:payload.cases.map(c=>({id:c.id,checks:['pass','pass','pass','pass'],explanation:'Verified primary duties.',quote:proposal.quote,corroboration:proposal.corroboration}))};
 });
 assert.equal(calls,2);assert.equal(result.requests,2);assert.equal(result.recovered.length,6);assert.equal(result.reviews.length,20);assert.equal(result.reviews.filter(x=>x.verdict==='unavailable').length,14);
 assert.equal(s.usage.model,2);
 for(let i=2;i<A.MODEL_LIMITS[A.NEMOTRON]-A.NIGHTLY_RESERVE[A.NEMOTRON];i++)A.recordCall(s,A.NEMOTRON,new Date());
 const blocked=await A.reviewSemantics(cases,s,{},h,A.localDate(now),Date.now(),async()=>{throw Error('must not call');});
 assert.equal(blocked.requests,0);assert.equal(blocked.reviews.length,20);
});


test('process rubric requires all checks and grounded evidence, never trusts a naked verdict',()=>{
 const J=require('../research/semantic-review.cjs'),day='2026-11-26',meta={model:A.HYDROGEN,slot:A.HYDROGEN,day},judge={model:A.NEMOTRON,slot:A.NEMOTRON};
 const c=J.buildCase(proposal,new Map([[doc.id,doc]]),new Map([[id,job]]),meta,{rule:null,reason:'missing-job-family-anchor'});
 const good={id:c.publicCase.id,checks:['pass','pass','pass','pass'],explanation:'Core ML duties.',quote:proposal.quote,corroboration:proposal.corroboration};
 assert.ok(J.adjudicate(c,good,judge,day).rule);
 assert.equal(J.adjudicate(c,{...good,checks:['pass','pass','unknown','pass'],verdict:'supported'},judge,day).rule,null);
 assert.equal(J.adjudicate(c,{...good,checks:['pass','pass','pass','pass'],alternative:'software'},judge,day).rule,null);
 assert.equal(J.adjudicate(c,{...good,checks:undefined,verdict:'supported'},judge,day).review.verdict,'unavailable');
 assert.equal(J.adjudicate(c,{...good,checks:['pass','fail','unknown','pass']},judge,day).review.verdict,'uncertain');
 const original=J.adjudicate(c,good,judge,day).review,hit=J.cachedResponse(c,original,day);
 assert.ok(hit);assert.ok(J.adjudicate(c,hit.response,hit.judge,day).rule);
 assert.equal(J.cachedResponse(c,original,'2026-12-04'),null);
 const d2={...doc,text:doc.text+' Updated job context.'};
 const changed=J.buildCase(proposal,new Map([[doc.id,d2]]),new Map([[id,job]]),meta,{rule:null,reason:'missing-job-family-anchor'});
 assert.notEqual(c.publicCase.id,changed.publicCase.id);assert.equal(J.cachedResponse(changed,original,day),null);
});
test('no judge calls on incomplete core, benchmark, shared endpoints or protected reserves; cache still usable',async()=>{
 const J=require('../research/semantic-review.cjs'),s=A.newState(),now=new Date(),day=A.localDate(now);A.ledger(s,day);
 const c=J.buildCase(proposal,new Map([[doc.id,doc]]),new Map([[id,job]]),{model:A.HYDROGEN,slot:A.HYDROGEN,day},{rule:null,reason:'missing-job-family-anchor'});
 const h={nemotronEnabled:true,glmEnabled:true,groqEnabled:true,attempts:[],failedFirst:new Set(),disabledModels:new Set(),cooldowns:new Map()};
 const no=async()=>{throw Error('must not call');};
 assert.equal(A.judgeHeadroom(s,A.GROQ),false);assert.equal(A.judgeHeadroom(s,A.GLM),false);assert.equal(A.judgeHeadroom(s,A.LITE),false);
 const blocked=await A.reviewSemantics([c],s,{},h,day,Date.now(),no,Date.now,false);
 assert.equal(blocked.requests,0);assert.equal(blocked.reviews[0].reason,'core-research-priority');
 s.runMode='benchmark';assert.equal((await A.reviewSemantics([c],s,{},h,day,Date.now(),no)).requests,0);
 s.runMode='daily';
 const good={id:c.publicCase.id,checks:['pass','pass','pass','pass'],explanation:'Verified duties.',quote:proposal.quote,corroboration:proposal.corroboration};
 s.semantic_reviews=[J.adjudicate(c,good,{model:A.NEMOTRON,slot:A.NEMOTRON},day).review];
 const cached=await A.reviewSemantics([c],s,{},h,day,Date.now(),no,Date.now,false);
 assert.equal(cached.requests,0);assert.equal(cached.cached,1);assert.equal(cached.recovered.length,1);
 for(let i=0;i<A.MODEL_LIMITS[A.NEMOTRON]-A.NIGHTLY_RESERVE[A.NEMOTRON];i++)A.recordCall(s,A.NEMOTRON,now);
 assert.equal(A.judgeHeadroom(s,A.NEMOTRON,now),false);
});


test('manual validation replay uses historical fixtures only and isolates the daily report',()=>{
 const rows=require('./fixtures/shadow-rejections-20261126.json'),replay=A.validationReplayCases(rows,'2026-11-26');
 assert.equal(replay.results.length,13);
 assert.deepEqual(replay.results.filter(r=>r.deterministic==='rejected').map(r=>r.number),[2,11]);
 assert.ok(replay.cases.some(c=>c.publicCase.initial_status==='rejected'));
 assert.ok(replay.cases.some(c=>c.publicCase.initial_status==='candidate'));
 const J=require('../research/semantic-review.cjs');
 const selected=J.selectCases(replay.cases);
 assert.equal(selected.length,3);assert.ok(selected.every(c=>c.publicCase.origin_slot===A.HYDROGEN));
 const fs=require('node:fs'),source=fs.readFileSync('research/research-agent.cjs','utf8'),workflow=fs.readFileSync('.github/workflows/adaptive-dictionary-research.yml','utf8');
 const body=source.slice(source.indexOf('async function runValidationReplay'),source.indexOf('async function run(){'));
 assert.match(body,/state\.last_attempt===day&&state\.last_validation_test!==day/);
 assert.match(body,/write\('validation-test\.json',report\)/);
 assert.doesNotMatch(body,/write\('report\.json'|mergeRules|fetchOfficial|searchOfficial|state\.family_rules\s*=|state\.career_rules\s*=/);
 assert.match(workflow,/- validation-test/);assert.match(workflow,/adaptive-validation-test-report/);
});
