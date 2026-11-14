'use strict';
/**
 * Reproducible multi-method benchmark. The reference file is independently
 * annotated from snapshot evidence before method selection and never changed
 * automatically by the classifiers. Ambiguous cases don't count as truth.
 */
const fs=require('node:fs'),path=require('node:path');
const lab=require('../dist/assets/secretj-eligibility-lab');
const pref=require('../dist/assets/secretj-job-preferences');
const root=path.join(__dirname,'..');
function evaluate(jobs,reference,frozenJobs){
 const source=frozenJobs||jobs;
 const lookup=new Map(source.map((j,i)=>[String(j.id||j.url),{job:j,index:i}]));
 const labeled=[...reference.include,...reference.exclude];
 const unknown=reference.uncertain;
 const missing=labeled.filter(r=>!lookup.has(String(r.id)));
 const present=labeled.filter(r=>lookup.has(String(r.id)));
 const outputs=[];
 const allRows=jobs.map((job,i)=>({
  index:i+1,id:job.id||job.url,company:job.company,title:job.title,
  descriptionPresent:!!String(job.description||'').trim(),
  ...Object.fromEntries(Object.entries(lab.methods).map(([name,fn])=>[name,fn(job).decision]))
 }));
 for(const [name,fn] of Object.entries(lab.methods)){
  const confusion={TP:0,FP:0,TN:0,FN:0,reviewPositive:0,reviewNegative:0};
  const errors=[];
  for(const r of present){
   const job=lookup.get(String(r.id)).job;
   const outcome=fn(job),want=r.expected;
   if(want==='include'){
    if(outcome.decision==='include')confusion.TP++;
    else if(outcome.decision==='exclude')confusion.FN++;
    else confusion.reviewPositive++;
   }else{
    if(outcome.decision==='exclude')confusion.TN++;
    else if(outcome.decision==='include')confusion.FP++;
    else confusion.reviewNegative++;
   }
   if(outcome.decision!==want)errors.push({id:r.id,title:r.title,company:r.company,want,
     got:outcome.decision,why:r.reason,reasons:outcome.reasons});
  }
  const positive=confusion.TP+confusion.FN+confusion.reviewPositive;
  const negative=confusion.TN+confusion.FP+confusion.reviewNegative;
  const predictedPositive=confusion.TP+confusion.FP;
  const confident=confusion.TP+confusion.TN+confusion.FP+confusion.FN;
  const review=confusion.reviewPositive+confusion.reviewNegative;
  const unknownDecisions={include:0,exclude:0,review:0};
  for(const r of unknown){
   const hit=lookup.get(String(r.id));
   if(hit)unknownDecisions[fn(hit.job).decision]++;
  }
  const catalogCounts={include:0,exclude:0,review:0};
  for(const j of jobs)catalogCounts[fn(j).decision]++;
  const recallHard=positive?(confusion.TP/positive):null;
  const recallSafe=positive?((confusion.TP+confusion.reviewPositive)/positive):null;
  const precision=predictedPositive?confusion.TP/predictedPositive:null;
  const specificity=negative?confusion.TN/negative:null;
  const risk=12*confusion.FN+5*confusion.FP+0.75*review;
  const utilityScore=Math.round((1-risk/Math.max(1,present.length*12))*10000)/100;
  outputs.push({name,sample:present.length,positive,negative,confusion,
    precision,recallHard,recallSafe,specificity,review,confident,unknownDecisions,
    catalogCounts,risk,utilityScore,
    errors:errors.slice(0,80)});
 }
 outputs.sort((a,b)=>a.risk-b.risk||b.recallSafe-a.recallSafe||b.confident-a.confident);
 const n=jobs.length,descMissing=jobs.filter(j=>!String(j.description||'').trim()).length;
 const disagreement=allRows.filter(row=>new Set(Object.keys(lab.methods).map(k=>row[k])).size>1).length;
 const suspicious=jobs.filter(j=>{
  const d=lab.evidence(j);return d.highTitle&&d.juniorTitle||d.conflict;
 }).length;
 return {
  meta:{totalJobs:n,referenceBinary:labeled.length,referenceFound:present.length,
    referenceUnknown:unknown.length,referenceMissing:missing.length,referenceFrozen:Boolean(frozenJobs),
    descriptionMissing:descMissing,disagreementJobs:disagreement,
    contradictoryEvidenceJobs:suspicious,
    selectionRule:'Lowest cost = 12*false-exclusion + 5*false-confirmed-inclusion + 0.75*review; tie favors safe recall'},
  winner:outputs[0].name,methods:outputs,allRows,missing:missing.map(r=>r.title)
 };
}
function csv(rows){
 const keys=Object.keys(rows[0]||{});
 const q=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
 return keys.join(',')+'\n'+rows.map(r=>keys.map(k=>q(r[k])).join(',')).join('\n')+'\n';
}
if(require.main===module){
 const data=JSON.parse(fs.readFileSync(path.join(root,'dist/data.json'),'utf8'));
 const reference=JSON.parse(fs.readFileSync(path.join(root,'benchmarks/eligibility-manual-reference.json'),'utf8'));
 const frozen=JSON.parse(fs.readFileSync(path.join(root,'benchmarks/eligibility-reviewed-snapshot.json'),'utf8'));
 const result=evaluate(data.jobs||[],reference,frozen.jobs||[]);
 const dest=path.join(root,'reports','eligibility-benchmark');
 fs.mkdirSync(dest,{recursive:true});
 fs.writeFileSync(path.join(dest,'method-comparison.json'),
  JSON.stringify({meta:result.meta,winner:result.winner,methods:result.methods,missing:result.missing},null,2)+'\n');
 fs.writeFileSync(path.join(dest,'all-jobs-method-comparison.csv'),csv(result.allRows));
 console.log('WINNER_MISCLASSIFICATIONS '+JSON.stringify(result.methods[0].errors));
 console.log(JSON.stringify({meta:result.meta,winner:result.winner,
  methods:result.methods.map(({name,precision,recallHard,recallSafe,specificity,review,catalogCounts,risk,utilityScore,confusion,unknownDecisions})=>
   ({name,precision,recallHard,recallSafe,specificity,review,catalogCounts,risk,utilityScore,confusion,unknownDecisions}))},null,2));
 if(result.meta.referenceMissing||result.meta.referenceFound<65)process.exitCode=1;
}
module.exports={evaluate,csv};
