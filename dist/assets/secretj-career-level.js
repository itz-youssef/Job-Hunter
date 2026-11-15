'use strict';
/* Shared, explainable career-level inference. No fabricated certainty on missing ATS fields. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SecretJCareerLevel=api;
})(typeof window!=='undefined'?window:null,function(){
  const levels=[
    {key:'internship',label:'Internship / Trainee'},
    {key:'entry',label:'Entry / Junior (0–2 years)'},
    {key:'mid',label:'Mid-level'},
    {key:'senior',label:'Senior'},
    {key:'lead',label:'Lead / Staff / Principal'},
    {key:'manager',label:'Manager'},
    {key:'director',label:'Director / Head'},
    {key:'executive',label:'Executive / VP / C-level'}
  ];
  const keys=new Set(levels.map(x=>x.key));
  const norm=x=>String(x||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const patterns=[
    ['executive',/\b(?:chief (?:executive|technology|financial|operating|product|information|people) officer|ceo|cto|cfo|coo|cio|cpo|ciso|executive vice president|svp|vice president|v[. ]?p[. ]?|general manager|managing director)\b/i],
    ['director',/\b(?:director|head of|head,|department head)\b/i],
    ['manager',/\b(?:engineering manager|product manager|project manager|program manager|people manager|team manager|development manager|marketing manager|operations manager|hr manager|finance manager|sales manager|customer success manager|line manager|manager of)\b/i],
    ['lead',/\b(?:tech(?:nical)? lead|team lead|lead (?:software|backend|frontend|full.?stack|data|machine learning|ai|ml|security|devops|cloud|qa|engineer|developer|designer|analyst|scientist)|staff (?:engineer|developer|scientist|designer)|principal (?:engineer|developer|scientist|designer|architect))\b/i],
    ['senior',/\b(?:senior|sr[.]?)\b/i],
    ['mid',/\b(?:mid[ -]?level|mid[ -]?senior|intermediate)\b/i],
    ['internship',/\b(?:interns?|internship|trainee|traineeship|apprentice(?:ship)?|student placement|co[ -]?op|summer training|winter training)\b/i],
    ['entry',/\b(?:junior|jr[.]?|entry[ -]?level|early professional|early[ -]?career|graduate(?: program(?:me)?| scheme)?|new grad|fresh graduate|fresher|associate engineer|associate developer)\b/i]
  ];
  function marker(raw){
    const text=norm(raw);
    for(const [level,re] of patterns)if(re.test(text))return level;
    if(/\b(?:management|managerial)\b/i.test(text))return 'manager';
    return null;
  }
  function evaluate(job,experienceCore){
    const title=norm(job.title||job.position||job.job_title);
    const ats=norm([job.seniority,job.career_level,job.experience_level,job.level].filter(Boolean).join(' '));
    const titleLevel=marker(title),atsLevel=marker(ats);
    const ext=experienceCore?.extractExperience?.(job);
    const years=ext?.minimum??null;
    const evidence=[];
    if(titleLevel)evidence.push('Title: '+titleLevel);
    if(atsLevel)evidence.push('Employer/ATS level: '+atsLevel);
    if(years!==null)evidence.push('Applicant minimum: '+years+' years');
    let level=atsLevel||titleLevel,confidence=(atsLevel?'explicit-ats':titleLevel?'title':'unknown');
    let conflict=false;
    if(atsLevel&&titleLevel&&atsLevel!==titleLevel){
      // Explicit contradictory employer metadata must not silently override title.
      conflict=true;level=null;confidence='conflict';
      evidence.push('Title and ATS level conflict');
    }
    if(level==='entry'&&years!==null&&years>2){
      conflict=true;level=null;confidence='conflict';evidence.push('Junior title contradicts required experience');
    }
    if(level==='internship'&&years!==null&&years>2){
      conflict=true;level=null;confidence='conflict';evidence.push('Intern title contradicts required experience');
    }
    if(!level&&!conflict&&years!==null&&years<=2){
      level='entry';confidence='years-inferred';
    }
    // A 5+ year requirement is unambiguously not entry, but does not prove
    // Senior vs Lead vs Manager without source evidence.
    return {level,confidence,conflict,requiredYears:years,evidence,
      advancedRequirement:years!==null&&years>2};
  }
  function match(job,selected,experienceCore){
    const chosen=(Array.isArray(selected)?selected:[]).filter(x=>keys.has(x));
    if(!chosen.length)return {match:true,review:false,...evaluate(job,experienceCore)};
    const result=evaluate(job,experienceCore);
    if(result.conflict)return {match:true,review:true,...result};
    if(result.level){
      const ok=chosen.includes(result.level);
      return {match:ok,review:result.confidence==='years-inferred',...result};
    }
    if(result.advancedRequirement && chosen.every(x=>x==='entry'||x==='internship'))
      return {match:false,review:false,...result};
    // No reliable level: keep discoverable, flag for human confirmation.
    return {match:true,review:true,...result};
  }
  return {levels,evaluate,match};
});
