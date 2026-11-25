'use strict';
// Experimental only: production matcher is a read-only dependency.
const {createHash}=require('node:crypto');
const prefs=require('../dist/assets/secretj-job-preferences');
const career=require('../dist/assets/secretj-career-level');
const eligibility=require('../dist/assets/secretj-eligibility-core');
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const plain=s=>String(s??'').replace(/\s+/g,' ').trim();
const hash=s=>createHash('sha256').update(String(s)).digest('hex');
const contains=(s,t)=>!!norm(t)&&(' '+norm(s)+' ').includes(' '+norm(t)+' ');
const levels=new Set(career.levels.map(x=>x.key));
const families=new Set(prefs.categories.map(x=>x.key).filter(x=>x!=='other'));
const dept=j=>plain(j.department||j.source_facets?.department||j.source_facets?.team);
const fingerprint=j=>hash(JSON.stringify([norm(j.company),norm(j.title),j.url||j.apply_url,norm(j.location),norm(j.seniority||j.career_level),norm(j.employment),dept(j),plain(j.description),plain(j.requirements)]));
const baseline=j=>({level:career.evaluate(j,eligibility).level,families:prefs.classify(j)});
const levelSignals={
 internship:/\b(?:internship|interns?|student placement|co.op|apprenticeship|summer training)\b|تدريب (?:صيفي|طلابي)/i,
 entry:/\b(?:fresh graduates?|recent graduates?|graduate (?:program|programme|scheme|trainee)|entry.level|early career|management trainee)\b|حديثي التخرج/i,
 junior:/\b(?:junior|entry grade|engineer i|1\s*[-–]\s*3 years)\b/i,
 mid:/\b(?:mid.level|intermediate|3\s*[-–]\s*5 years)\b/i,
 senior:/\b(?:senior|staff engineer|principal engineer|senior associate)\b/i,
 lead:/\b(?:team lead|technical lead|tech lead|lead engineer)\b/i,
 manager:/\b(?:manager|management position)\b/i,
 director_head_executive:/\b(?:director|vice president|head of|chief executive|chief technology officer)\b/i
};
const anchors={
 software:/\b(?:software engineering|software development|develop(?:ing)? (?:software|applications)|build(?:ing)? applications|application development|coding and programming)\b/i,
 backend:/\b(?:backend|back.end|server.side|rest(?:ful)? apis?|microservices)\b/i,
 frontend:/\b(?:frontend|front.end|client.side|user interfaces|react\.js|angular development)\b/i,
 fullstack:/\b(?:full.stack|both frontend and backend)\b/i,
 mobile:/\b(?:mobile (?:development|applications)|android development|ios development|flutter|react native)\b/i,
 web:/\b(?:web development|web applications|website development)\b/i,
 ai_ml:/\b(?:machine learning|artificial intelligence|deep learning|generative ai|natural language processing|large language models|train(?:ing)? (?:ml|ai) models)\b/i,
 cv:/\b(?:computer vision|object detection|image processing|video analytics)\b/i,
 mlops:/\b(?:mlops|ml platform|model deployment|model serving|model monitoring)\b/i,
 data_science:/\b(?:data science|statistical modeling|predictive modeling|data scientist)\b/i,
 data_analytics:/\b(?:data analytics|business intelligence|data visualization|power bi|analytics dashboards)\b/i,
 data_engineering:/\b(?:data engineering|data pipelines?|etl|data warehouse)\b/i,
 cybersecurity:/\b(?:cyber.?security|information security|security operations|penetration testing|incident response|threat hunting)\b/i,
 cloud:/\b(?:cloud engineering|cloud infrastructure|cloud architecture|cloud services)\b/i,
 devops:/\b(?:devops|site reliability|ci\/cd|deployment pipelines|infrastructure automation)\b/i,
 qa:/\b(?:software testing|quality assurance|test automation|test cases|regression testing)\b/i,
 it_support:/\b(?:it support|technical support|help desk|service desk|desktop support)\b/i,
 network:/\b(?:network engineering|network administration|network infrastructure|routing and switching)\b/i,
 systems:/\b(?:systems administration|system administration|linux administration|windows server)\b/i,
 database:/\b(?:database administration|database engineering|database performance|database administrator)\b/i,
 product:/\b(?:product management|product roadmap|product strategy|product backlog)\b/i,
 project:/\b(?:project management|program management|project planning|scrum master)\b/i,
 ux_ui:/\b(?:user experience|user interface design|ux research|usability testing|product design)\b/i,
 graphic:/\b(?:graphic design|visual design|motion design|digital design)\b/i,
 business_analysis:/\b(?:business analysis|business requirements|requirements gathering|process mapping)\b/i,
 erp:/\b(?:enterprise resource planning|erp|sap implementation|oracle functional|salesforce administration)\b/i,
 embedded:/\b(?:embedded systems|embedded software|firmware|microcontrollers|real.time operating systems)\b/i,
 robotics:/\b(?:robotics|industrial automation|control systems|plc programming|mechatronics)\b/i,
 game:/\b(?:game development|game programming|unreal engine|unity development)\b/i,
 blockchain:/\b(?:blockchain|smart contracts|web3|solidity)\b/i,
 research:/\b(?:research and development|scientific research|research engineering|r&d)\b/i,
 solutions:/\b(?:solutions engineering|solutions architecture|pre.sales engineering|technical sales)\b/i,
 technical_writing:/\b(?:technical writing|technical documentation|developer documentation)\b/i,
 talent_acquisition:/\b(?:talent acquisition|recruitment|candidate sourcing|hiring process)\b/i,
 hr:/\b(?:human resources|hr operations|employee relations|payroll|onboarding employees)\b/i,
 marketing:/\b(?:marketing|marketing campaigns|product activation|customer adoption campaigns|seo|brand strategy)\b/i,
 finance:/\b(?:finance|accounting|financial reporting|audit|taxation)\b/i,
 operations:/\b(?:operations management|supply chain|procurement|logistics)\b/i,
 customer_success:/\b(?:customer success|customer service|customer experience|client support)\b/i,
 sales:/\b(?:sales|business development|sales pipeline|prospecting)\b/i
};
const duty=/\b(?:responsibilit(?:y|ies)|duties|you will|develop|design|build|implement|maintain|manage|monitor|investigate|test|deploy|coordinate|prepare|analy[sz]e|create|support|lead|deliver|conduct|work on|work across)\b/i;
const negative=/\b(?:not|no|without|unrelated|optional|nice to have|a plus|preferred|benefit)\b/i;
function quoteOK(text,q){q=plain(q);return q.length>=20&&q.length<=420&&plain(text).includes(q)&&!negative.test(q);}
// One validation path, unchanged acceptance gates. Return first failed gate.
function validateDetailed(p,docs,jobs,model,day){
 const reject=reason=>({rule:null,reason}),accept=rule=>({rule,reason:null});
 if(!p||!['career','family'].includes(p.kind))return reject('invalid-proposal-kind');
 const d=docs.get(p.evidence_id),quote=plain(p.quote);
 if(!d)return reject('unknown-evidence-id');
 if(!d.url)return reject('missing-source-url');
 if(quote.length<20||quote.length>420)return reject('quote-length');
 if(!plain(d.text).includes(quote))return reject('quote-not-in-source');
 if(negative.test(quote))return reject('negative-or-optional-evidence');
 if(p.kind==='career'){
  const alias=plain(p.alias);
  if(!d.live)return reject('career-source-not-live');
  if(!levels.has(p.level))return reject('unknown-career-level');
  if(alias.length<4||alias.length>100)return reject('alias-length');
  if(!contains(quote,alias))return reject('alias-not-in-quote');
  if(!levelSignals[p.level]?.test(quote))return reject('missing-career-level-signal');
  if(/^(?:program(?:me)?|graduate|intern(?:ship)?|engineer|associate|specialist|trainee|technology|talent|academy|analyst|manager|senior|junior)$/i.test(alias))return reject('generic-career-alias');
  if(Object.entries(levelSignals).some(([k,re])=>k!==p.level&&re.test(quote)))return reject('conflicting-career-level-signals');
  return accept({key:hash(JSON.stringify(['career',norm(d.company),norm(alias),p.level])),kind:'career',company:d.company,alias,level:p.level,evidence:{url:d.url,quote,checked_at:day},models:[model],status:'candidate'});
 }
 const j=jobs.get(p.job_id),q2=plain(p.corroboration);
 if(!j)return reject('unknown-job-id');
 if(d.job_id!==p.job_id)return reject('evidence-job-mismatch');
 if(norm(d.company)!==norm(j.company))return reject('evidence-company-mismatch');
 if(!families.has(p.family))return reject('unknown-job-family');
 if(!anchors[p.family]?.test(quote))return reject('missing-job-family-anchor');
 if(!baseline(j).families.includes('other'))return reject('job-already-classified');
 const department=dept(j);
 const departmentProof=department.length>=4&&contains(quote,department)&&anchors[p.family].test(department)&&!negative.test(department);
 const dutiesProof=duty.test(quote)&&quoteOK(d.duties||'',quote)&&quoteOK(d.duties||'',q2)&&q2!==quote&&!quote.includes(q2)&&!q2.includes(quote)&&anchors[p.family].test(q2)&&duty.test(q2);
 if(!departmentProof&&!dutiesProof){
  if(!duty.test(quote))return reject('missing-duty-signal');
  if(!quoteOK(d.duties||'',quote))return reject('quote-not-supported-by-duties');
  if(!quoteOK(d.duties||'',q2))return reject('corroboration-not-supported-by-duties');
  if(q2===quote||quote.includes(q2)||q2.includes(quote))return reject('corroboration-not-independent');
  if(!anchors[p.family].test(q2))return reject('corroboration-missing-family-anchor');
  return reject('corroboration-missing-duty-signal');
 }
 const fp=fingerprint(j);
 return accept({key:hash(JSON.stringify(['family',fp,p.family])),kind:'family',company:j.company,title:j.title,job_fingerprint:fp,family:p.family,evidence:{url:d.url,quote,corroboration:departmentProof?'Official department: '+department:q2,checked_at:day},models:[model],status:'candidate'});
}
function validate(p,docs,jobs,model,day){return validateDetailed(p,docs,jobs,model,day).rule;}
// Existing rule payloads and order are immutable. Only add independent
// confirmations and promote a candidate; never downgrade or overwrite it.
const careerScope=r=>r.kind==='career'?norm(r.company)+'|'+norm(r.alias):null;
function assertAdditive(old,next){
 const seen=new Map();
 for(const r of next){if(!r?.key||seen.has(r.key))throw Error('duplicate-or-invalid-rule-key');seen.set(r.key,r);}
 for(const r of old){
  const n=seen.get(r.key);
  if(!n)throw Error('append-only-rule-removal');
  for(const k of Object.keys(r)){
   if(k==='models'||k==='status')continue;
   if(JSON.stringify(r[k])!==JSON.stringify(n[k]))throw Error('append-only-rule-overwrite');
  }
  if(!(r.models||[]).every(m=>(n.models||[]).includes(m)))throw Error('append-only-model-removal');
  if(r.status!==n.status&&!(r.status==='candidate'&&n.status==='cross-checked'&&new Set(n.models||[]).size>=2))throw Error('append-only-rule-status-downgrade');
 }
}
function mergeRules(old,proposals){
 old=old||[];
 assertAdditive(old,old);
 const map=new Map(old.map(r=>[r.key,r]));
 const scopes=new Map();
 for(const r of [...old,...proposals]){
  const scope=careerScope(r);if(scope===null)continue;
  if(!scopes.has(scope))scopes.set(scope,new Set());
  scopes.get(scope).add(r.level);
 }
 for(const p of proposals){
  const existing=map.get(p.key),scope=careerScope(p),conflict=scope!==null&&scopes.get(scope).size>1;
  if(existing){
   const models=[...new Set([...(existing.models||[]),...(p.models||[])])];
   const status=existing.status==='candidate'&&!conflict&&models.length>=2?'cross-checked':existing.status;
   map.set(p.key,{...existing,models,status});
  }else{
   const models=[...new Set(p.models||[])];
   map.set(p.key,{...p,models,status:conflict?'conflict':models.length>=2?'cross-checked':'candidate'});
  }
 }
 const rows=[...map.values()];assertAdditive(old,rows);return rows;
}
function shadow(j,rules){
 const b=baseline(j),valid=rules.filter(r=>r.status==='cross-checked');let level=b.level,fs=b.families;
 if(!level||level==='mid'){
  const found=new Set(valid.filter(r=>r.kind==='career'&&norm(r.company)===norm(j.company)&&contains(j.title,r.alias)).map(r=>r.level));
  const years=eligibility.extractExperience?.(j)?.minimum;
  if(found.size===1){const next=[...found][0];if(!(years!=null&&years>2&&['internship','entry'].includes(next)))level=next;}
 }
 if(fs.includes('other')){const fp=fingerprint(j),extra=[...new Set(valid.filter(r=>r.kind==='family'&&r.job_fingerprint===fp).map(r=>r.family))];if(extra.length)fs=extra;}
 return {level,families:fs};
}
function metrics(rows){const tp=rows.filter(r=>r.expected&&r.actual).length,fp=rows.filter(r=>!r.expected&&r.actual).length,fn=rows.filter(r=>r.expected&&!r.actual).length,tn=rows.length-tp-fp-fn;return {n:rows.length,tp,fp,fn,tn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,accuracy:rows.length?(tp+tn)/rows.length:null};}
function evaluate(jobs,rules,reference){
 const changes=[];let changed_level=0,changed_family=0,baseline_unknown=0,shadow_unknown=0;
 for(const j of jobs){const a=baseline(j),b=shadow(j,rules),l=a.level!==b.level,f=a.families.join('|')!==b.families.join('|');if(l)changed_level++;if(f)changed_family++;if(!a.level||a.families.includes('other'))baseline_unknown++;if(!b.level||b.families.includes('other'))shadow_unknown++;if((l||f)&&changes.length<40)changes.push({company:j.company,title:j.title,before:a,after:b,url:j.url||j.apply_url});}
 const cases=reference?.cases||[];
 const compare=fn=>metrics(cases.map(c=>({expected:c.expected===true,actual:fn(c).families.some(k=>(c.preference||[]).includes(k))})));
 return {catalog_jobs:jobs.length,changed_level,changed_family,baseline_unknown,shadow_unknown,changes,benchmark:{basis:'Existing limited semantic-role reference; not production accuracy.',old:compare(baseline),shadow:compare(j=>shadow(j,rules))}};
}
module.exports={norm,plain,hash,contains,dept,fingerprint,baseline,validate,validateDetailed,mergeRules,assertAdditive,shadow,metrics,evaluate,levels,families};
