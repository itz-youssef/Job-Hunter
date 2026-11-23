'use strict';
// Client + Node shared search index. Search is deliberately independent of
// personal email eligibility, which is governed by SecretJJobPreferences.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SecretJJobSearch=api;
})(typeof window!=='undefined'?window:null,function(){
  const normalize=value=>String(value??'')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  const internship=/\b(?:intern|interns|internship|internships|trainee|traineeship|apprentice|apprenticeship|co op|cooperative education|student placement|summer training|winter training|graduate program(?:me)?|graduate scheme)\b/i;
  const aliases={
    internship:['internship','intern','interns','trainee','traineeship','apprentice','apprenticeship','co op','student placement','summer training','winter training','graduate program','graduate programme','graduate scheme'],
    backend:['backend','back end','server side','api developer'],
    frontend:['frontend','front end','client side'],
    fullstack:['fullstack','full stack'],
    cybersecurity:['cybersecurity','cyber security','information security','infosec','soc'],
    ml:['machine learning','ml','ai'],
    ai:['artificial intelligence','ai','machine learning'],
    qa:['quality assurance','qa','software tester']
  };
  const expand=term=>{
    const key=Object.keys(aliases).find(k=>aliases[k].includes(term));
    return key?aliases[key]:[term];
  };
  function tokens(query){
    const value=normalize(query).slice(0,160);
    if(!value)return [];
    const parts=value.split(' ').slice(0,12);
    const merged=[];
    // Multiword phrases are examined as complete query terms.
    for(let i=0;i<parts.length;i++){
      if(i+1<parts.length&&(['back end','front end','full stack','machine learning','cyber security','quality assurance','co op'].includes(parts[i]+' '+parts[i+1]))){
        merged.push(parts[i]+' '+parts[i+1]);i++;
      }else merged.push(parts[i]);
    }
    return merged;
  }
  function isInternship(job){
    const values=[job.title,job.position,job.job_title,job.employment,job.job_type,job.seniority,job.experience_level,job.career_level,job.program_type];
    return internship.test(normalize(values.join(' '))) ||
      /\bgraduate (?:internship|training|trainee) program\b/i.test(normalize(values.join(' ')));
  }
  // Prepared per-job searchable fields are amortized across keystrokes.
  // WeakMap is bounded by job object lifetimes: no cross-user persistence.
  const prepared=new WeakMap();
  const queryParts=new Map();
  function cachedTerms(query){
    const key=String(query??'').slice(0,160);
    if(queryParts.has(key))return queryParts.get(key);
    const result=tokens(key).map(part=>({part,possibilities:expand(part)}));
    if(queryParts.size>96)queryParts.clear();
    queryParts.set(key,result);
    return result;
  }
  function prepare(job,classify){
    if(!job||typeof job!=='object')return null;
    const previous=prepared.get(job);
    if(previous&&previous.classify===classify)return previous;
    const record={
      classify,
      title:normalize(job.title||job.position||job.job_title),
      company:normalize(job.company||job.employer||job.company_name),
      type:normalize([job.employment,job.job_type,job.seniority,job.experience_level,job.career_level].join(' ')),
      location:normalize(job.location||job.job_location),
      description:normalize([job.description,job.requirements,job.skills,job.summary].join(' ')).slice(0,14000),
      category:normalize(typeof classify==='function'?(classify(job)||[]).join(' '):''),
      internship:isInternship(job)
    };
    prepared.set(job,record);
    return record;
  }
  function score(job,query,classify){
    const parts=cachedTerms(query);
    if(!parts.length)return 0;
    const item=prepare(job,classify);
    if(!item)return 0;
    const contains=(hay,term)=>(' '+hay+' ').includes(' '+term+' ');
    let total=0;
    for(const {part,possibilities} of parts){
      let best=0;
      if(possibilities.some(t=>contains(item.title,t)))best=12;
      else if((part==='internship'||part==='intern')&&item.internship)best=11;
      else if(possibilities.some(t=>contains(item.company,t)))best=9;
      else if(possibilities.some(t=>contains(item.type,t)))best=7;
      else if(possibilities.some(t=>contains(item.category,t)))best=6;
      else if(possibilities.some(t=>contains(item.location,t)))best=3;
      else if(possibilities.some(t=>contains(item.description,t)))best=1;
      if(!best)return 0;
      total+=best;
    }
    if(item.title.includes(parts.map(x=>x.part).join(' ')))total+=8;
    return total;
  }
  return {normalize,tokens,isInternship,score,matches:(job,query,classify)=>score(job,query,classify)>0};
});
