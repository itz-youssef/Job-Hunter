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
 for(let i=0;i<15;i++)A.recordCall(s,A.HYDROGEN,now);
 assert.equal(A.canCall(s,A.HYDROGEN,now),false);
 assert.equal(A.canCall(s,A.NEMOTRON,now),true);
 assert.equal(A.canCall(s,A.LITE,now),true);
 A.recordCall(s,A.LITE,now);assert.equal(s.usage.model,15);assert.equal(s.usage.preprocess,1);
 const later=new Date('2026-11-25T22:00:00Z');A.ledger(s,A.localDate(later));
 assert.equal(A.canCall(s,A.HYDROGEN,later),false);
 assert.equal(A.canCall(s,A.HYDROGEN,new Date('2026-11-26T08:01:00Z')),true);
 assert.ok(A.MODEL_INTERVALS[A.HYDROGEN]>=12000);
 assert.equal(A.MODEL_LIMITS[A.LITE],100);
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
 assert.ok(A.GOOGLE_MODELS.every(m=>A.MODEL_LIMITS[m]===15&&A.MODEL_INTERVALS[m]>=12000));
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
 assert.equal(A.MODEL_LIMITS[A.GROQ],15);assert.ok(A.MODEL_INTERVALS[A.GROQ]>=60000);
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
 for(let i=0;i<15;i++)A.recordCall(s,A.GROQ,now);
 assert.equal(A.slotAvailable(s,A.HYDROGEN,h,now),false);
 assert.equal(A.slotAvailable(s,A.NEMOTRON,h,now),true);
 s.usage.model=A.MODEL_BUDGET;assert.equal(A.canCall(s,A.GROQ,now),false);
 assert.ok(fs.readFileSync('.github/workflows/adaptive-dictionary-research.yml','utf8').includes('secrets.GROQ_API_KEY'));
});
