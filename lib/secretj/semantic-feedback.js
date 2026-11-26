'use strict';
const core=require('./core');
const SOURCE='https://raw.githubusercontent.com/itz-youssef/Job-Hunter/refs/heads/research/shadow-state/research-results/state.json';
const ACTION='semantic_validation_feedback';
const keyOK=k=>typeof k==='string'&&/^[a-f0-9]{64}$/.test(k);
const decisions=new Set(['supported','unsupported','uncertain']);
const revision=r=>core.hash(JSON.stringify([r.id,r.reviewed_day||r.day,r.kind,r.proposed,r.source,r.original_quote,r.original_corroboration,r.verdict,r.judge_model,r.explanation,r.verified_quotes,...(r.review_version==='semantic-process-v2'?[r.review_version,r.checks]:[])]));
function buildView(state,events=[]){
 const rows=(Array.isArray(state?.semantic_reviews)?state.semantic_reviews:[]).filter(r=>keyOK(r?.id)).slice(-180);
 const latest=new Map();
 for(const event of events){const d=event.detail||event;if(keyOK(d.case_id)&&keyOK(d.revision)&&decisions.has(d.verdict))latest.set(d.case_id+':'+d.revision,{verdict:d.verdict,reviewed_at:event.created_at||null});}
 return rows.map(r=>({...r,revision:revision(r),feedback:latest.get(r.id+':'+revision(r))||null})).reverse();
}
async function snapshot(){
 try{const r=await fetch(SOURCE,{signal:AbortSignal.timeout(8000),cache:'no-store'});if(!r.ok)throw Error('snapshot');return await r.json();}
 catch{throw core.fail(503,'Semantic review history unavailable');}
}
function calibration(events){
 const unique=new Map();
 for(const event of events){const d=event.detail||event;if(keyOK(d.case_id)&&keyOK(d.revision)&&decisions.has(d.verdict)&&typeof d.judge_model==='string'&&decisions.has(d.judge_verdict))unique.set(d.case_id+':'+d.revision,d);}
 const models=new Map();
 for(const d of unique.values()){
  const k=d.judge_model;const m=models.get(k)||{model:k,labeled:0,agreement:0,decisive:0,decisive_agreement:0,false_support:0,false_rejection:0};
  m.labeled++;if(d.verdict===d.judge_verdict)m.agreement++;
  if(d.verdict!=='uncertain'&&d.judge_verdict!=='uncertain'){m.decisive++;if(d.verdict===d.judge_verdict)m.decisive_agreement++;if(d.verdict==='unsupported'&&d.judge_verdict==='supported')m.false_support++;if(d.verdict==='supported'&&d.judge_verdict==='unsupported')m.false_rejection++;}
  models.set(k,m);
 }
 return [...models.values()].map(m=>({...m,agreement_rate:m.labeled?m.agreement/m.labeled:null,decisive_agreement_rate:m.decisive?m.decisive_agreement/m.decisive:null}));
}
async function loadReport(){
 const [state,events]=await Promise.all([snapshot(),core.query("SELECT detail,created_at FROM public.sj_admin_audit WHERE action=$1 ORDER BY created_at ASC,id ASC",[ACTION])]);
 return {reviews:buildView(state,events),calibration:calibration(events)};
}
async function load(){return (await loadReport()).reviews;}
function feedbackId(key,rev){const h=core.hash('semantic-feedback-v1:'+key+':'+rev);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
async function decide(admin,body){
 if(!keyOK(body.id)||!keyOK(body.revision)||!decisions.has(body.verdict))throw core.fail(400,'Invalid semantic review feedback');
 const row=(await load()).find(x=>x.id===body.id&&x.revision===body.revision);
 if(!row)throw core.fail(404,'Review has changed; refresh the dashboard');
 if(row.feedback)throw core.fail(409,'Feedback already recorded');
 // Keep a durable evaluation example in the existing audit ledger. No
 // dictionary rule, user data, or production classifier is changed.
 const detail={case_id:row.id,revision:row.revision,verdict:body.verdict,kind:row.kind,proposed:row.proposed,company:row.company,title:row.title,source_url:row.source_url,source:row.source,original_quote:row.original_quote,original_corroboration:row.original_corroboration,judge_verdict:row.verdict,judge_model:row.judge_model,judge_explanation:row.explanation,verified_quotes:row.verified_quotes,checks:row.checks||null,review_version:row.review_version||null,day:row.day};
 const result=await core.query("INSERT INTO public.sj_admin_audit(id,actor_id,action,detail) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id",[feedbackId(row.id,row.revision),admin.id,ACTION,JSON.stringify(detail)]);
 if(!result.length)throw core.fail(409,'Feedback already recorded');
 return {ok:true,verdict:body.verdict};
}
module.exports={buildView,revision,feedbackId,calibration,loadReport,load,decide};
