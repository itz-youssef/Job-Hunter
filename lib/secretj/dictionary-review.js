'use strict';
const core=require('./core');
const baseCareer=require('../../dist/assets/secretj-career-dictionary');
const prefs=require('../../dist/assets/secretj-job-preferences');
const SOURCE='https://raw.githubusercontent.com/itz-youssef/Job-Hunter/refs/heads/research/shadow-state/research-results/state.json';
const ACTION='review_dictionary_conflict';
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const employer=s=>norm(s).replace(/ egypt$/,'');
const scope=r=>r.kind==='career'?'career:'+employer(r.company)+'|'+norm(r.alias):'family:'+String(r.job_fingerprint||'');
const keyOK=k=>typeof k==='string'&&/^[a-f0-9]{64}$/.test(k);
const revision=r=>core.hash(JSON.stringify([r.key,r.kind,r.company,r.alias,r.level,r.job_fingerprint,r.family,r.evidence]));
const clone=x=>JSON.parse(JSON.stringify(x));
function baseMatches(rule,baseline){
 const found=[];
 if(rule.kind==='career')for(const [level,entry] of Object.entries(baseline)){
  for(const [company,aliases] of Object.entries(entry?.company_brand_names||{})){
   if(employer(company)!==employer(rule.company))continue;
   for(const alias of Array.isArray(aliases)?aliases:[])if(norm(alias)===norm(rule.alias))found.push({kind:'career',company,alias,level,source:'original_dictionary'});
  }
 }
 return found;
}
function buildView(state,events=[],baseline=baseCareer,familyBase=prefs.exportDictionary()){
 if(!Array.isArray(state?.career_rules)||!Array.isArray(state?.family_rules))throw core.fail(503,'Research dictionaries unavailable');
 const rules=[...state.career_rules,...state.family_rules];
 if(rules.some(r=>!keyOK(r?.key)||!['career','family'].includes(r.kind))||new Set(rules.map(r=>r.key)).size!==rules.length)throw core.fail(503,'Invalid research dictionary snapshot');
 const byKey=new Map(rules.map(r=>[r.key,r])),grouped=new Map(),decisions=new Map(),approvedScopes=new Map();
 for(const r of rules){const s=scope(r);if(!grouped.has(s))grouped.set(s,[]);grouped.get(s).push(r);}
 for(const row of events){
  const d=row.detail||row,r=byKey.get(d.rule_key);
  if(!r||revision(r)!==d.revision||scope(r)!==d.scope||!['approve','reject'].includes(d.decision))continue;
  const decision={decision:d.decision,rule_key:r.key,scope:d.scope,revision:d.revision,reviewed_at:row.created_at||null};
  decisions.set(r.key,decision);
  if(r.kind==='career'&&d.decision==='approve')approvedScopes.set(scope(r),decision);
 }
 const conflicts=[];
 for(const r of rules){
  const originals=baseMatches(r,baseline),other=(grouped.get(scope(r))||[]).filter(x=>x.key!==r.key&&(r.kind==='career'?x.level!==r.level:x.family!==r.family));
  const baseConflict=originals.some(x=>x.level!==r.level);
  // Several occupational families may legitimately overlap.
  if(r.status!=='conflict'&&!baseConflict&&!decisions.has(r.key))continue;
  const selected=approvedScopes.get(scope(r));
  conflicts.push({key:r.key,revision:revision(r),proposal:r,existing:[...originals,...other],reason:baseConflict?'Original dictionary assigns a different level':'Research proposals disagree',decision:decisions.get(r.key)||null,selected_rule_key:selected?.rule_key||null});
 }
 const conflictKeys=new Set(conflicts.map(c=>c.key));
 const effective=rules.filter(r=>{
  const d=decisions.get(r.key),selected=r.kind==='career'?approvedScopes.get(scope(r)):null;
  if(d?.decision==='reject')return false;
  if(selected)return selected.rule_key===r.key;
  if(d?.decision==='approve')return true;
  return r.status==='cross-checked'&&!conflictKeys.has(r.key);
 }).map(r=>({...r,review_status:decisions.get(r.key)?.decision==='approve'?'admin-approved':'cross-checked'}));
 const career=clone(baseline);
 for(const r of effective.filter(x=>x.kind==='career')){
  if(decisions.get(r.key)?.decision==='approve'){
   for(const [level,entry] of Object.entries(career)){
    if(level===r.level)continue;
    for(const [name,aliases] of Object.entries(entry?.company_brand_names||{})){
     if(employer(name)===employer(r.company)&&Array.isArray(aliases))entry.company_brand_names[name]=aliases.filter(a=>norm(a)!==norm(r.alias));
    }
   }
  }
  const entry=career[r.level];if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
  entry.company_brand_names=entry.company_brand_names||{};
  const name=Object.keys(entry.company_brand_names).find(n=>employer(n)===employer(r.company))||r.company;
  const aliases=Array.isArray(entry.company_brand_names[name])?entry.company_brand_names[name]:[];
  if(!aliases.some(a=>norm(a)===norm(r.alias)))entry.company_brand_names[name]=[...aliases,r.alias];
 }
 const exported={schema_version:1,mode:'admin-reviewed-shadow',production_unchanged:true,exported_at:new Date().toISOString(),research_day:state.usage?.day||null,
  career_level_dictionary:{original:clone(baseline),effective:career,research_rules:clone(state.career_rules),effective_rules:effective.filter(r=>r.kind==='career')},
  job_family_dictionary:{original:clone(familyBase),effective:{...clone(familyBase),job_specific_rules:effective.filter(r=>r.kind==='family')},research_rules:clone(state.family_rules)},
  review_decisions:[...decisions.values()]};
 return {conflicts,counts:{pending:conflicts.filter(c=>!c.decision).length,reviewed:conflicts.filter(c=>c.decision).length,career:state.career_rules.length,family:state.family_rules.length},export:exported};
}
async function snapshot(){
 try{
  const r=await fetch(SOURCE,{signal:AbortSignal.timeout(8000),cache:'no-store'});
  if(!r.ok)throw Error('snapshot unavailable');
  return await r.json();
 }catch{throw core.fail(503,'Research dictionaries unavailable; try again later');}
}
async function reviews(){
 return core.query("SELECT detail,created_at FROM public.sj_admin_audit WHERE action=$1 ORDER BY created_at ASC,id ASC",[ACTION]);
}
async function load(){const [state,events]=await Promise.all([snapshot(),reviews()]);return buildView(state,events);}
function decisionId(key,rev){
 const h=core.hash('dictionary-review-v1:'+key+':'+rev);
 return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
}
async function decide(admin,body){
 if(!keyOK(body.key)||!keyOK(body.revision)||!['approve','reject'].includes(body.decision))throw core.fail(400,'Invalid review decision');
 const view=await load(),c=view.conflicts.find(x=>x.key===body.key&&x.revision===body.revision);
 if(!c)throw core.fail(404,'Conflict no longer available; refresh the dashboard');
 if(c.decision)throw core.fail(409,'Conflict already reviewed');
 const detail={rule_key:c.key,revision:c.revision,scope:scope(c.proposal),decision:body.decision};
 const rows=await core.query("INSERT INTO public.sj_admin_audit(id,actor_id,action,detail) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id",[decisionId(c.key,c.revision),admin.id,ACTION,JSON.stringify(detail)]);
 if(!rows.length)throw core.fail(409,'Conflict already reviewed');
 return {ok:true,decision:body.decision};
}
module.exports={buildView,revision,decisionId,load,decide};
