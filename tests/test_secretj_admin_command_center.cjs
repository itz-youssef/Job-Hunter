'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const admin=require('../api/secretj-admin');
const me='e07bb2d6-a213-45d0-ab23-e5051967a616';
const other='ff7bb2d6-a213-45d0-ab23-e5051967a616';
const cookie='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
async function call(method,action,body={},role='admin',id=me){
 const queries=[];
 core.setQueryForTests(async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
   return [{id,email:'owner@example.com',role,is_active:true}];
  if(sql.includes('FROM public.sj_users u')&&sql.includes('WHERE u.id=$1 LIMIT 1'))
   return [{id:other,email:'member@example.com',role:'member',is_active:true,saved_jobs:2}];
  if(sql.includes('WITH active AS')&&sql.includes('sj_botfolio_groq_budget'))return args[0]==='qwen/qwen3.8-27b'?[{requests:2,tokens:2000,reported_tokens:1500,reported_requests:2,successful:2}]:[{requests:3,tokens:4000,reported_tokens:1000,reported_requests:1,successful:1,failed:1,pending:1,last_outcome:'rate_limited'}];
  if(sql.includes('FROM public.sj_botfolio_limits'))return [{neurons:12,chat_attempts:4,indexing_attempts:1}];
  if(sql.includes('SELECT count(*)::int AS total'))return [{total:2,active:2,admins:1,joined_week:1}];
  if(sql.includes('sj_email_alert_log WHERE status='))return [{opted_in:2,verified:1,sent:4,failed:0,pending:0}];
  if(sql.includes('INSERT INTO public.sj_admin_audit'))return [{target_user_id:other}];
  return [];
 });
 const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},
   end(s){this.body=JSON.parse(s);}};
 const req={method,query:{action,id:other},body,
   headers:{host:'www.jobsnow.tech',origin:'https://www.jobsnow.tech',cookie}};
 try{await admin(req,response);return {response,queries};}
 finally{core.setQueryForTests(null);}
}
test('regular members denied insights, user diagnostics and session revocation',async()=>{
 for(const [method,action] of [['GET','insights'],['GET','user-detail'],['PATCH','revoke-sessions']]){
  const {response,queries}=await call(method,action,{id:other},'member');
  assert.equal(response.statusCode,403);
  assert.equal(queries.length,1);
 }
});
test('admin insights expose aggregated metrics without sensitive account content',async()=>{
 const {response,queries}=await call('GET','insights');
 assert.equal(response.statusCode,200);
 assert.equal(response.body.accounts.total,2);
 assert.equal(response.body.alerts.sent,4);
 assert.ok(queries.some(x=>x.sql.includes('GROUP BY stage')));
 const body=JSON.stringify(response.body);
 assert.doesNotMatch(body,/password_hash|token_hash|content BYTEA|base64/);
});
test('user diagnostic filters by requested UUID and does not read CV bytes',async()=>{
 const {response,queries}=await call('GET','user-detail');
 assert.equal(response.statusCode,200);
 assert.equal(response.body.user.saved_jobs,2);
 const q=queries.find(x=>x.sql.includes('WHERE u.id=$1 LIMIT 1'));
 assert.deepEqual(q.args,[other]);
 assert.doesNotMatch(q.sql,/SELECT.*(?:password_hash|cv\.content|avatar\.content)/s);
});
test('session revocation is audited and forbids self revocation',async()=>{
 const self=await call('PATCH','revoke-sessions',{id:me});
 assert.equal(self.response.statusCode,403);
 assert.equal(self.queries.filter(x=>x.sql.includes('DELETE FROM public.sj_sessions')).length,0);
 const otherUser=await call('PATCH','revoke-sessions',{id:other});
 assert.equal(otherUser.response.statusCode,200);
 assert.ok(otherUser.queries.some(x=>x.sql.includes('DELETE FROM public.sj_sessions')&&x.sql.includes('sj_admin_audit')));
});
test('account signup cannot self-promote, admin page only loads on trusted session',()=>{
 const auth=fs.readFileSync('api/secretj-auth.js','utf8');
 const page=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 const ui=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');
 assert.match(auth,/INSERT INTO public\.sj_users\(id,email,password_hash,terms_accepted_at,terms_version,privacy_version\)/);
 assert.doesNotMatch(auth,/INSERT INTO public\.sj_users\([^)]*\brole\b/);
 assert.match(page,/user\.role==='admin'\?'admin':'overview'/);
 assert.match(ui,/state\.user\?\.role!=='admin'/);
 assert.doesNotMatch(ui,/DATABASE_URL|password_hash|token_hash|npg_/);
 assert.match(fs.readFileSync('dist/account.html','utf8'),/secretj-admin-console\.js/);
});
test('admin role and suspend mutation preserve a last-active-admin safeguard',()=>{
 const src=fs.readFileSync('api/secretj-admin.js','utf8');
 assert.match(src,/SELECT count\(\*\) FROM public\.sj_users WHERE role='admin' AND is_active/);
 assert.match(src,/sj_admin_audit/);
});

test('dictionary review and export are inaccessible to regular members',async()=>{
 for(const [method,action] of [['GET','dictionary-review'],['GET','dictionary-export'],['PATCH','dictionary-review']]){
  const {response,queries}=await call(method,action,{},'member');assert.equal(response.statusCode,403);assert.equal(queries.length,1);
 }
});
test('reviewed export preserves baseline and raw rules, only approved conflict changes effective alias',()=>{
 const R=require('../lib/secretj/dictionary-review'),base={entry:{company_brand_names:{Example:['Future X']}},internship:{company_brand_names:{}}};
 const original={key:'a'.repeat(64),kind:'career',company:'Example',alias:'Future X',level:'entry',status:'cross-checked',evidence:{quote:'Original evidence'}};
 const proposal={...original,key:'b'.repeat(64),level:'internship',status:'conflict',evidence:{quote:'New evidence'}};
 const state={career_rules:[original,proposal],family_rules:[]},family={categories:[]};
 const first=R.buildView(state,[],base,family);assert.equal(first.counts.pending,1);
 assert.deepEqual(first.export.career_level_dictionary.effective.entry.company_brand_names.Example,['Future X']);
 const event={detail:{rule_key:proposal.key,revision:R.revision(proposal),scope:'career:example|future x',decision:'approve'},created_at:'2026-11-25T00:00:00Z'};
 const approved=R.buildView(state,[event],base,family);
 assert.deepEqual(approved.export.career_level_dictionary.original,base);
 assert.deepEqual(approved.export.career_level_dictionary.research_rules,state.career_rules);
 assert.deepEqual(approved.export.career_level_dictionary.effective.entry.company_brand_names.Example,[]);
 assert.deepEqual(approved.export.career_level_dictionary.effective.internship.company_brand_names.Example,['Future X']);
 assert.equal(approved.counts.pending,0);
 const rejected=R.buildView(state,[{...event,detail:{...event.detail,decision:'reject'}}],base,family);
 assert.deepEqual(rejected.export.career_level_dictionary.effective.entry.company_brand_names.Example,['Future X']);
 assert.equal(rejected.export.career_level_dictionary.effective_rules.length,1);
 assert.equal(R.buildView(state,[{...event,detail:{...event.detail,revision:'stale'}}],base,family).counts.pending,1);
 assert.equal(R.decisionId(proposal.key,R.revision(proposal)),R.decisionId(proposal.key,R.revision(proposal)));
});
test('export serializes real family title patterns without changing matcher',()=>{
 const prefs=require('../dist/assets/secretj-job-preferences'),data=prefs.exportDictionary();
 assert.ok(data.categories.find(c=>c.key==='ai_ml').title_pattern.pattern);
 assert.ok(data.title_aliases.some(x=>x.family==='ai_ml'));
 assert.ok(prefs.classify({title:'Machine Learning Engineer'}).includes('ai_ml'));
});

test('Botfolio usage is admin-only, aggregate and read-only',async()=>{
 const member=await call('GET','botfolio-usage',{},'member');assert.equal(member.response.statusCode,403);assert.equal(member.queries.length,1);
 const {response,queries}=await call('GET','botfolio-usage');assert.equal(response.statusCode,200);const u=response.body.usage;
 assert.equal(u.generation.model,'openai/gpt-oss-120b');assert.equal(u.generation.requests_24h,3);assert.equal(u.generation.remaining_tokens,116000);assert.equal(u.generation.system_token_limit,120000);assert.equal(u.generation.global_request_limit,900);assert.equal(u.generation.remaining_requests,897);assert.equal(u.generation.reported_tokens_24h,1000);assert.equal(u.embeddings.remaining_neurons,1788);assert.equal(u.daily.per_ip,20);assert.equal(u.daily.per_owner,20);assert.equal(u.daily.admin_exempt,true);
 assert.equal(queries.length,5);assert.ok(queries.slice(1).every(q=>!(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/i.test(q.sql))));assert.equal(u.fallback_generation.model,'qwen/qwen3.8-27b');assert.equal(u.fallback_generation.remaining_tokens,188000);assert.equal(u.fallback_generation.remaining_requests,898);assert.equal(u.second_fallback_generation.model,'openai/gpt-oss-20b');assert.equal(u.second_fallback_generation.system_token_limit,190000);
 assert.doesNotMatch(JSON.stringify(response.body),/knowledge|vector|reservations|GROQ_API_KEY|password_hash/);
 const js=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');assert.match(js,/Botfolio AI Usage/);assert.match(js,/botfolio-usage/);assert.match(js,/data-bf-usage-refresh/);assert.match(js,/Not configured on this host/);assert.match(js,/Next request released/);assert.match(js,/Next token release/);assert.match(js,/All current tokens released/);assert.match(js,/timeZone:'Africa\/Cairo'/);assert.match(js,/Both local counters reset/);assert.match(js,/g\.requests_24h,g\.global_request_limit,g\.remaining_requests,'requests'/);assert.match(js,/g\.tokens_24h,g\.system_token_limit,g\.remaining_tokens,'tokens'/);
});

test('provider reset times use the shared research snapshot and yellow timestamp only',()=>{
 const js=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8'),page=fs.readFileSync('dist/account.html','utf8');
 assert.match(js,/class="sj-provider-reset-time"/);assert.match(js,/Last reported reset has passed/);assert.match(js,/data-bf-provider-reset/);assert.match(js,/Provider daily token reset \(TPD\): Not reported/);
 assert.equal((js.match(/api\(url\+'research-shadow'\)/g)||[]).length,1);
 assert.match(page,/\.sj-provider-reset-time\{color:#856000!important/);assert.match(page,/\.sj-provider-reset-time\{color:#facc15!important/);
});

test('provider calendar reset and freshest Groq response are rendered without a provider probe',()=>{
 const js=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');
 const helpers=new Function(js.slice(js.indexOf('const nextProviderMidnight='),js.indexOf('const modelBudgetCards='))+'return {nextProviderMidnight,providerSchedule,latestGroqReset};')();
 assert.equal(helpers.nextProviderMidnight('UTC',Date.parse('2026-11-26T00:10:00Z')),'2026-11-27T00:00:00.000Z');
 assert.equal(helpers.nextProviderMidnight('America/Los_Angeles',Date.parse('2026-11-26T00:10:00Z')),'2026-11-26T08:00:00.000Z');
 assert.equal(helpers.providerSchedule('nvidia/nemotron-3-ultra-550b-a55b:free'),'UTC');
 const report={updated_at:'2026-11-25T15:00:00Z',usage:{per_model:{'openai/gpt-oss-120b':{provider_reset_at:'2026-11-25T16:00:00Z'}}}};
 const recent={reset_at:'2026-11-26T12:00:00Z',observed_at:'2026-11-26T00:10:00Z'};
 assert.deepEqual(helpers.latestGroqReset(report,{generation:{provider_reset:{rpd:recent}}},'rpd'),recent);assert.equal(helpers.latestGroqReset(report,null,'tpm'),null);
});

test('Groq product allocations leave 5000 tokens unallocated and preserve request ceilings',()=>{
 const B=require('../lib/secretj/botfolio'),A=require('../research/research-agent.cjs');
 assert.equal(B.GROQ_ROLLING_TOKEN_CAP,120000);assert.equal(A.GROQ_TOKEN_BUDGET,75000);assert.equal(200000-B.GROQ_ROLLING_TOKEN_CAP-A.GROQ_TOKEN_BUDGET,5000);assert.equal(B.GROQ_ROLLING_REQUEST_CAP,900);assert.equal(A.EMERGENCY_LIMITS[A.GROQ],60);
 const js=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');assert.match(js,/120,000 accounted tokens/);assert.match(js,/75,000 Job Hunter/);
});


test('research calendar projection expires local daily counters without erasing rolling token usage',()=>{
 const js=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');
 const helpers=new Function(js.slice(js.indexOf('const nextProviderMidnight='),js.indexOf('const modelBudgetCards='))+'return {projectResearchUsage};')();
 const u={day:'2026-11-25',model_requests_today:41,groq_tokens_rolling_24h:6082,per_model:{
  'gemini-4-hydrogen':{limit:18,used_today:7,provider_day_used:7,system_used:7,cairo_reset_at:'2026-11-25T22:00:00Z',provider_counter_reset_at:'2026-11-26T08:00:00Z',provider_day:'2026-11-25'},
  'nvidia/nemotron-3-ultra-550b-a55b:free':{limit:40,used_today:12,provider_day_used:12,system_used:26,legacy_debit:14,cairo_reset_at:'2026-11-25T22:00:00Z',provider_counter_reset_at:'2026-11-26T00:00:00Z',provider_day:'2026-11-25'}
 }};
 const r={cairo_day:'2026-11-25'};
 const before=helpers.projectResearchUsage(u,r,Date.parse('2026-11-26T07:59:00Z'));
 assert.equal(before.per_model['gemini-4-hydrogen'].system_used,7);
 assert.equal(before.per_model['nvidia/nemotron-3-ultra-550b-a55b:free'].system_used,0);
 const after=helpers.projectResearchUsage(u,r,Date.parse('2026-11-26T08:15:00Z'));
 assert.equal(after.per_model['gemini-4-hydrogen'].system_used,0);
 assert.equal(after.model_requests_today,0);assert.equal(after.groq_tokens_rolling_24h,6082);
 assert.equal(u.per_model['gemini-4-hydrogen'].system_used,7);
 assert.equal(after.per_model['gemini-4-hydrogen'].provider_counter_reset_at,'2026-11-27T08:00:00.000Z');
});


test('provider-window projection ignores Cairo-day usage after provider reset, preserves caps and rolling tokens',()=>{
 const js=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');
 const {projectResearchUsage}=new Function(js.slice(js.indexOf('const nextProviderMidnight='),js.indexOf('const modelBudgetCards='))+'return {projectResearchUsage};')();
 const model='gemini-4-hydrogen',u={day:'2026-11-26',model_requests_today:18,groq_tokens_rolling_24h:1200,per_model:{[model]:{limit:18,used_today:18,provider_day_used:18,system_used:18,provider_day:'2026-11-25',cairo_reset_at:'2026-11-26T22:00:00Z',provider_counter_reset_at:'2026-11-26T08:00:00Z'}}};
 const before=projectResearchUsage(u,{},Date.parse('2026-11-26T07:59:59Z'));
 const after=projectResearchUsage(u,{},Date.parse('2026-11-26T08:00:00Z'));
 assert.equal(before.per_model[model].system_used,18);
 assert.equal(after.per_model[model].system_used,0);
 assert.equal(after.per_model[model].remaining,18);
 assert.equal(after.per_model[model].used_today,18);
 assert.equal(after.model_requests_today,18);
 assert.equal(after.groq_tokens_rolling_24h,1200);
 assert.equal(u.per_model[model].system_used,18);
 const next={...u,per_model:{[model]:{...u.per_model[model],provider_day:'2026-11-26',provider_day_used:1,used_today:19,system_used:19,provider_counter_reset_at:'2026-11-27T08:00:00Z'}}};
 assert.equal(projectResearchUsage(next,{},Date.parse('2026-11-26T08:01:00Z')).per_model[model].system_used,1);
});


test('semantic feedback is admin-only and does not approve dictionary rules',async()=>{
 for(const method of ['GET','PATCH']){const {response,queries}=await call(method,'semantic-review',{},'member');assert.equal(response.statusCode,403);assert.equal(queries.length,1);}
 const F=require('../lib/secretj/semantic-feedback');
 const row={id:'c'.repeat(64),day:'2026-11-26',kind:'family',proposed:'finance',source:'Actual source',original_quote:'Original',verdict:'uncertain',judge_model:'judge',explanation:'Insufficient evidence',verified_quotes:[]};
 const state={semantic_reviews:[row],career_rules:[],family_rules:[]},rev=F.revision(row);
 const events=[{detail:{case_id:row.id,revision:rev,verdict:'supported'},created_at:'2026-11-26T09:00:00Z'}];
 assert.equal(F.buildView(state,events)[0].feedback.verdict,'supported');
 assert.equal(F.buildView({semantic_reviews:[{...row,source:'Changed evidence'}]},events)[0].feedback,null);
 assert.deepEqual(state.career_rules,[]);assert.deepEqual(state.family_rules,[]);
 const src=fs.readFileSync('lib/secretj/semantic-feedback.js','utf8');assert.doesNotMatch(src,/UPDATE public\.sj_|DELETE FROM|review_dictionary_conflict/);
});
