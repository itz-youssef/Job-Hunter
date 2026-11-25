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
  if(sql.includes('WITH active AS')&&sql.includes('sj_botfolio_groq_budget'))return [{requests:3,tokens:4000,reported_tokens:1000,reported_requests:1,successful:1,failed:1,pending:1,last_outcome:'rate_limited'}];
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
 assert.equal(u.generation.model,'openai/gpt-oss-120b');assert.equal(u.generation.requests_24h,3);assert.equal(u.generation.remaining_tokens,31000);assert.equal(u.generation.reported_tokens_24h,1000);assert.equal(u.embeddings.remaining_neurons,1788);assert.equal(u.daily.per_ip,15);
 assert.equal(queries.length,3);assert.ok(queries.slice(1).every(q=>!(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/i.test(q.sql))));
 assert.doesNotMatch(JSON.stringify(response.body),/knowledge|vector|reservations|GROQ_API_KEY|password_hash/);
 const js=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');assert.match(js,/Botfolio AI Usage/);assert.match(js,/botfolio-usage/);assert.match(js,/data-bf-usage-refresh/);assert.match(js,/Not configured on this host/);
});
