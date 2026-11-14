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
  function score(job,query,classify){
    const parts=tokens(query);
    if(!parts.length)return 0;
    const title=normalize(job.title||job.position||job.job_title);
    const company=normalize(job.company||job.employer||job.company_name);
    const type=normalize([job.employment,job.job_type,job.seniority,job.experience_level,job.career_level].join(' '));
    const location=normalize(job.location||job.job_location);
    const description=normalize([job.description,job.requirements,job.skills,job.summary].join(' ')).slice(0,14000);
    const category=normalize(typeof classify==='function'?(classify(job)||[]).join(' '):'');
    const internshipTerm=isInternship(job);
    let total=0;
    const contains=(hay,term)=>(' '+hay+' ').includes(' '+term+' ');
    for(const part of parts){
      const possibilities=expand(part);
      let best=0;
      if(possibilities.some(t=>contains(title,t)))best=12;
      else if((part==='internship'||part==='intern')&&internshipTerm)best=11;
      else if(possibilities.some(t=>contains(company,t)))best=9;
      else if(possibilities.some(t=>contains(type,t)))best=7;
      else if(possibilities.some(t=>contains(category,t)))best=6;
      else if(possibilities.some(t=>contains(location,t)))best=3;
      else if(possibilities.some(t=>contains(description,t)))best=1;
      if(!best)return 0; // Every search term must be grounded in some field.
      total+=best;
    }
    if(title.includes(parts.join(' ')))total+=8;
    return total;
  }
  return {normalize,tokens,isInternship,score,matches:(job,query,classify)=>score(job,query,classify)>0};
});
