'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const preferences=require('../dist/assets/secretj-job-preferences');
const api=require('../api/secretj-data');
const core=require('../lib/secretj/core');
process.env.NODE_ENV='test';

test('expanded account categories filter according to role, not owner relevance score',()=>{
 const p={role_families:['software','ai_ml'],egypt_only:true,internships:false,max_experience_years:null};
 assert.equal(preferences.isMatch({title:'Senior Software Engineer',score:0,matched:false,location:'Cairo, Egypt'},p),true);
 assert.equal(preferences.isMatch({title:'Software Engineer Intern',score:8,matched:true,location:'Cairo, Egypt'},p),true);
 assert.equal(preferences.isMatch({title:'HR Specialist',score:0,matched:false,location:'Cairo, Egypt'},p),false);
 assert.equal(preferences.isMatch({title:'Junior Software Engineer',score:8,matched:true,location:'Berlin, Germany'},p),false);
});

test('preferences do not become configured on account creation without a saved row',async()=>{
 const token='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
 const uid='e07bb2d6-a213-45d0-ab23-e5051967a616';
 core.setQueryForTests(async(sql,args)=>{
  if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
    return [{id:uid,email:'member@example.com',role:'member',is_active:true}];
  if(sql.includes('FROM public.sj_preferences'))return [];
  throw Error('Unexpected SQL statement');
 });
 const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},
  end(body){this.body=JSON.parse(body)}};
 try{
  await api({method:'GET',query:{scope:'preferences'},headers:{cookie:token,host:'www.jobsnow.tech'}},response);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.configured,false);
  assert.equal(response.body.preferences.email_alerts,false);
 }finally{core.setQueryForTests(null)}
});

test('brand hover exception overrides generic inverse selector and has keyboard focus outline',()=>{
 const css=fs.readFileSync('dist/assets/secretj-global-theme.css','utf8');
 const broad=css.lastIndexOf('body :is(button,a[href],summary,[role="button"])');
 const specific=css.lastIndexOf('body a.brand.brand[href]:not([hidden])');
 assert.ok(broad>0&&specific>broad);
 assert.match(css,/body a\.brand\.brand\[href\]:not\(\[hidden\]\):not\(\[aria-disabled="true"\]\):is\(:hover,:active,:focus-visible\)/);
 assert.match(css,/outline-offset:4px/);
});

test('company cards distinguish discovered vacancies from personalized matches',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');
 assert.match(html,/public_jobs:scan\?\.public_jobs\?\?scan\?\.parsed_jobs/);
 assert.match(html,/Detected vacancies: \$\{c\.public_jobs\}/);
});

test('all unchecked with blank experience means all detected jobs for logged-in members',()=>{
 const prefs={role_families:[],max_experience_years:null,egypt_only:false,internships:false};
 assert.equal(preferences.hasFilters(prefs),false);
 for(const title of ['Senior Software Architect','Recruitment Specialist','Cybersecurity Analyst','Frontend Developer']){
  assert.equal(preferences.isMatch({title,score:0,matched:false,location:'Germany'},prefs),true);
 }
});
test('categories cover technical roles and talent acquisition',()=>{
 const names=new Set(preferences.categories.map(x=>x.key));
 for(const k of ['backend','frontend','cybersecurity','cloud','data_engineering','talent_acquisition','hr','qa','devops','ux_ui','mobile','embedded','network','sales','other'])
  assert.ok(names.has(k),k);
 const p={role_families:['talent_acquisition'],egypt_only:false,internships:false,max_experience_years:null};
 assert.equal(preferences.isMatch({title:'Talent Acquisition Specialist',score:0,location:'Cairo'},p),true);
 assert.equal(preferences.isMatch({title:'Backend Engineer',score:9,location:'Cairo'},p),false);
});
test('optional experience differs from zero and rejects explicitly over-budget experience',()=>{
 const job={title:'Backend Developer',location:'Cairo',description:'Requires 5 years of experience'};
 assert.equal(preferences.isMatch(job,{role_families:['backend'],max_experience_years:null}),true);
 assert.equal(preferences.isMatch(job,{role_families:['backend'],max_experience_years:0}),false);
 assert.equal(preferences.isMatch({...job,description:'Build APIs'},{role_families:['backend'],max_experience_years:0}),true);
});

test('Senior and Sr titles are excluded at 0–2 years in feed and member alert matcher',()=>{
 for(const limit of [0,1,2]){
  const p={role_families:['software','backend'],max_experience_years:limit,egypt_only:false,internships:false};
  for(const title of ['Senior Software Engineer','Sr. Backend Developer','Sr Software Engineer','SENIOR API Engineer']){
   assert.equal(preferences.isMatch({title,description:'No years specified',location:'Cairo'},p),false,title+' at '+limit);
  }
  assert.equal(preferences.isMatch({title:'Junior Software Engineer',location:'Cairo'},p),true);
 }
});
test('senior title rule does not override empty or higher experience preferences',()=>{
 const job={title:'Senior Software Engineer',description:'No experience requirements given',location:'Cairo'};
 for(const years of [null,3,5]){
  const p={role_families:['software'],max_experience_years:years,egypt_only:false,internships:false};
  assert.equal(preferences.isMatch(job,p),true,String(years));
 }
 assert.equal(preferences.isMatch(job,{role_families:[],max_experience_years:null,egypt_only:false,internships:false}),true);
 assert.equal(preferences.isMatch({title:'Senior Talent Acquisition Specialist',location:'Cairo'},{
  role_families:['talent_acquisition'],max_experience_years:2,egypt_only:false,internships:false
 }),false);
});

test('mylo Full-Stack role requiring 7+ professional years never matches a two-year profile',()=>{
 const role={
  title:'Full-Stack Engineer',company:'mylo by B.TECH',location:'Cairo, Egypt',
  description:'mylo is a fintech platform. Born out of B.TECH, a retailer with over 27 years of experience in offering buy now pay later. Responsibilities: Build APIs and scalable services. Requirements: 7+ years of professional experience as a software engineer and have expertise particularly in Typescript.'
 };
 const p={role_families:['fullstack'],max_experience_years:2,egypt_only:true,internships:false};
 assert.equal(preferences.yearsRequired(role),7);
 assert.equal(preferences.isMatch(role,p),false);
 assert.equal(preferences.isMatch(role,{...p,max_experience_years:7}),true);
});
test('company founding history does not disqualify a 0–2 years applicant',()=>{
 const role={title:'Full-Stack Engineer',location:'Cairo, Egypt',
  description:'Born out of B.TECH, a retailer with over 27 years of experience in offering installment solutions. Requirements: Experience in modern APIs and databases.'};
 assert.equal(preferences.yearsRequired(role),null);
 assert.equal(preferences.isMatch(role,{role_families:['fullstack'],max_experience_years:2}),true);
});
test('explicit minimum and mixed job requirements are compared to saved maximum',()=>{
 const base={title:'Backend Engineer',location:'Cairo, Egypt'};
 const p={role_families:['backend'],max_experience_years:2};
 for(const description of [
   'Requirements: Minimum 5 years of experience developing APIs.',
   'Requirements: 4 years of relevant experience',
   'Qualifications: Experience: 3+ years.',
   'Requirements: 3–5 years of professional experience'
 ]){
  const role={...base,description};
  assert.equal(preferences.isMatch(role,p),false,description);
 }
 assert.equal(preferences.isMatch({...base,description:'Requirements: 2 years of professional experience'},p),true);
});
test('same shared experience rules are used by the email notifier',()=>{
 const code=fs.readFileSync('lib/secretj/member-alerts.js','utf8');
 assert.match(code,/require\('\.\.\/\.\.\/dist\/assets\/secretj-job-preferences'\)/);
 assert.match(code,/function matches\(job,p\)\{return isMatch\(job,p\);\}/);
});

test('Valeo AI Team Manager with 8+ years total is excluded at 2 years',()=>{
 const valeo={
  title:'AI Team Manager , AI4ALL',
  company:'Valeo',
  location:'Cairo, Egypt',
  description:'Job Description: Engineering Manager (Hands-On) – AI & Cloud Platform. About the Role: The AI4ALL team is looking for an experienced, hands-on Engineering Manager. Qualifications & Requirements Experience 8+ years of total experience in software development, cloud engineering, DevOps, platform engineering, or solution architecture. 3+ years of direct people management or technical team leadership experience, managing software or cloud engineering teams.'
 };
 assert.equal(preferences.yearsRequired(valeo),8);
 const selected={role_families:['ai_ml'],egypt_only:true,internships:false,max_experience_years:2};
 assert.equal(preferences.isMatch(valeo,selected),false);
 assert.equal(preferences.isMatch(valeo,{...selected,max_experience_years:null}),true);
});
test('explicit hands-on leadership title exclusion works without a description',()=>{
 const p={role_families:[],max_experience_years:2};
 for(const title of ['AI Team Manager, AI4ALL','Engineering Manager (Hands-On)','Software Team Lead','Technical Manager']){
   assert.equal(preferences.isMatch({title},p),false,title);
 }
 assert.equal(preferences.isMatch({title:'Associate Product Manager'},
   {role_families:['product'],max_experience_years:2}),true);
});
test('experience parser respects company history and 8 years total experience',()=>{
 assert.equal(preferences.yearsRequired({description:'Our company has 27 years of experience in offering payment solutions.'}),null);
 assert.equal(preferences.yearsRequired({description:'Qualifications & Requirements Experience 8+ years of total experience in software development.'}),8);
 assert.equal(preferences.yearsRequired({description:'Requirements: 3+ years of direct people management or technical team leadership experience.'}),3);
});

test('home and account request the updated matcher URL to avoid stale cached eligibility code',()=>{
 const account=fs.readFileSync('dist/account.html','utf8');
 const home=fs.readFileSync('dist/index.html','utf8');
 for(const page of [account,home])
  assert.match(page,/secretj-job-preferences\.js\?v=evidence-engine-7/);
});

test('Lead and Consultant titles are hidden at 0 to 2 years, including Deloitte tech leads',()=>{
 const titles=[
  'Deloitte Innovation Hub | AI / ML Engineering Tech Lead, Cairo, Egypt',
  'Deloitte Innovation Hub | Java Backend Development Tech Lead, Cairo, Egypt',
  'Deloitte Innovation Hub | Data Engineering Tech Lead, Cairo, Egypt',
  'Deloitte Innovation Hub | Python Backend Development Tech Lead, Cairo, Egypt',
  'Cloud Engineering Lead','Cybersecurity Consultant','Technology Consultant'
 ];
 for(const max_experience_years of [0,1,2]){
  const p={role_families:[],max_experience_years,egypt_only:false,internships:false};
  for(const title of titles)
   assert.equal(preferences.isMatch({title,location:'Cairo, Egypt'},p),false,title);
 }
});
test('Lead and Consultant are still browsable with no limit or higher experience',()=>{
 const titles=['Backend Tech Lead','Cybersecurity Consultant'];
 for(const max_experience_years of [null,3,5]){
  const p={role_families:[],max_experience_years,egypt_only:false,internships:false};
  for(const title of titles)
   assert.equal(preferences.isMatch({title},p),true,title+' at '+max_experience_years);
 }
});
test('word-boundary filter does not reject unrelated words or junior positions',()=>{
 const p={role_families:[],max_experience_years:2,egypt_only:false,internships:false};
 for(const title of ['Leadless Process Operator','Junior Software Engineer','Sales Leadership Intern','Graduate Recruitment Coordinator'])
  assert.equal(preferences.isMatch({title},p),true,title);
});

test('Staff engineering titles excluded for max experience <= 2 in shared browser/email matcher',()=>{
 const titles=['Staff Software Engineer','Staff AI Engineer','Staff Engineer, Platform','Principal Staff Backend Developer'];
 for(const max_experience_years of [0,1,2]){
  const p={role_families:[],max_experience_years,egypt_only:false,internships:false};
  for(const title of titles){
   const job={title,location:'Cairo, Egypt'};
   assert.equal(preferences.isMatch(job,p),false,title);
   assert.equal(preferences.explain(job,p).match,false,title);
   assert.match(preferences.explain(job,p).reasons.join(' '),/Staff/);
  }
 }
});
test('unlimited or higher experience preserves Staff opportunities',()=>{
 const job={title:'Staff Software Engineer',location:'Cairo, Egypt'};
 for(const max_experience_years of [null,3,6]){
  const p={role_families:[],max_experience_years,egypt_only:false,internships:false};
  assert.equal(preferences.isMatch(job,p),true,String(max_experience_years));
 }
});
test('review-all mode makes excluded vacancies inspectable without altering email matching',()=>{
 const home=fs.readFileSync('dist/index.html','utf8');
 assert.match(home,/state\.reviewExcluded \|\| String\(state\.query\|\|''\)\.trim\(\) \|\| !state\.member \|\| !state\.memberPrefsConfigured/);
 assert.match(home,/data-review-excluded/);
 assert.match(home,/Outside preferences:/);
 assert.match(home,/Needs review: experience level is not fully verified/);
 assert.match(home,/state\.reviewExcluded=!state\.reviewExcluded/);
 assert.match(fs.readFileSync('lib/secretj/member-alerts.js','utf8'),/function matches\(job,p\)\{return isMatch\(job,p\);\}/);
});

test('Principal roles excluded for a 0–2 year cap across matching and explanation',()=>{
 for(const max_experience_years of [0,1,2]){
  const p={role_families:[],max_experience_years};
  for(const title of ['Principal Software Engineer','Principal AI Scientist','Principal Architect']){
   const j={title,location:'Cairo, Egypt'};
   assert.equal(preferences.isMatch(j,p),false,title);
   assert.equal(preferences.explain(j,p).match,false,title);
   assert.match(preferences.explain(j,p).reasons.join(' '),/Principal/);
  }
 }
 const job={title:'Principal Engineer'};
 assert.equal(preferences.isMatch(job,{role_families:[],max_experience_years:null}),true);
 assert.equal(preferences.isMatch(job,{role_families:[],max_experience_years:10}),true);
});
test('nine-plus years building and shipping products is a candidate requirement',()=>{
 const job={title:'Platform Engineer',description:'YOU HAVE: 9+ years of building and shipping software products, with experience as a technical lead or architect for enterprise SaaS products.'};
 assert.equal(preferences.yearsRequired(job),9);
 assert.equal(preferences.isMatch(job,{role_families:[],max_experience_years:2}),false);
 assert.equal(preferences.isMatch(job,{role_families:[],max_experience_years:9}),true);
 assert.equal(preferences.yearsRequired({description:'The company has 27 years of experience in offering financial products.'}),null);
});

test('one evidence decision powers matching and review explanation',()=>{
 const p={role_families:['ai_ml'],egypt_only:true,internships:false,max_experience_years:2};
 const cases=[
  {title:'Senior AI Engineer',location:'Cairo, Egypt'},
  {title:'AI Engineer',location:'Cairo, Egypt',seniority:'Senior'},
  {title:'AI Engineer',location:'Cairo, Egypt',description:'Requirements: 8+ years of total experience in machine learning'},
  {title:'Junior AI Engineer',location:'Cairo, Egypt',seniority:'Senior'},
  {title:'Junior AI Engineer',location:'Cairo, Egypt',description:'Experience building NLP systems'}
 ];
 for(const job of cases){
  const result=preferences.assess(job,p);
  assert.equal(preferences.isMatch(job,p),result.match);
  assert.deepEqual(preferences.explain(job,p),result);
 }
});
test('explicit structured ATS seniority excludes advanced jobs even without years in description',()=>{
 const p={role_families:[],max_experience_years:2,egypt_only:false,internships:false};
 for(const value of ['Senior','Mid-Senior level','Principal','Management']){
  const job={title:'Software Engineer',seniority:value};
  const result=preferences.assess(job,p);
  assert.equal(result.match,false,value);
  assert.match(result.reasons.join(' '),/Employer labels/);
 }
});
test('contradictory junior title and senior ATS label remains reviewable, not invisible',()=>{
 const job={title:'Junior AI Engineer',seniority:'Senior',location:'Cairo, Egypt'};
 const p={role_families:['ai_ml'],max_experience_years:2};
 const result=preferences.assess(job,p);
 assert.equal(result.match,true);
 assert.equal(result.status,'experience-unverified');
 assert.match(result.evidence.join(' '),/Conflicting employer seniority/);
});
test('strong leadership duties alone trigger investigation rather than silently hiding a role',()=>{
 const job={title:'Software Engineer',location:'Egypt',
  description:'Responsibilities: Manage a team of engineers and conduct performance reviews. Requirements: Knowledge of Python.'};
 const result=preferences.assess(job,{role_families:['software'],max_experience_years:2});
 assert.equal(result.match,true);
 assert.equal(result.status,'experience-unverified');
 assert.match(result.evidence.join(' '),/leadership responsibilities/);
});
test('hard rejection is based on actual minimum and excludes Valeo, mylo, Deloitte, principal',()=>{
 const p={role_families:[],max_experience_years:2};
 for(const job of [
  {title:'AI Team Manager, AI4ALL',description:'Requirements: 8+ years of total experience'},
  {title:'Full-Stack Engineer',description:'Requirements: 7+ years of professional experience'},
  {title:'Java Backend Development Tech Lead'},
  {title:'Staff Engineer'}, {title:'Principal Scientist'}
 ]){
  assert.equal(preferences.assess(job,p).match,false,job.title);
 }
});

test('anonymous home shows zero matching jobs and generic latest opportunities',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');
 assert.match(html,/matching=state\.member&&state\.memberPrefsConfigured\?list\.length:0/);
 assert.match(html,/matched=state\.member&&state\.memberPrefsConfigured\?validJobs\(\)\.length:0/);
 assert.match(html,/state\.member\?'Your latest opportunities':'Latest opportunities'/);
 assert.match(html,/state\.member&&state\.memberPrefsConfigured&&scoreOf\(j\)>=8\?/);
});
