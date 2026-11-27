'use strict';
/* Exact title-token career matching. No AI, no description guessing. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports
    ?require('./secretj-career-dictionary'):root?.SecretJCareerDictionary);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SecretJCareerLevel=api;
})(typeof window!=='undefined'?window:null,function(dictionary){
  // Checkbox options mirror the authored dictionary categories exactly.
  // negative_keywords_global is an exclusion rule, not a selectable level.
  const levels=[
    {key:'internship',label:'Internship / Trainee'},
    {key:'entry',label:'Entry / Graduate'},
    {key:'junior',label:'Junior'},
    {key:'mid',label:'Mid-level'},
    {key:'senior',label:'Senior / Staff / Principal'},
    {key:'lead',label:'Lead'},
    {key:'manager',label:'Manager'},
    {key:'director_head_executive',label:'Director / Head / Executive / VP / C-level'}
  ];
  const keys=new Set(levels.map(x=>x.key));
  const normalize=value=>String(value||'').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
  function phrase(haystack,needle){
    const h=normalize(haystack),n=normalize(needle);
    return Boolean(n)&&(' '+h+' ').includes(' '+n+' ');
  }
  // Context explanations in the authored reference aren't title triggers.
  const term=x=>String(x).replace(/\s*\([^)]*\)\s*$/,'').trim();
  const groups=[
    ['director_head_executive','director_head_executive'],
    ['manager','manager'],['lead','lead'],['senior','senior'],
    ['internship','internship'],['junior','junior'],
    ['entry','entry'],['mid','mid']
  ];
  function employerMatch(brand,company){
    const a=normalize(brand).replace(/\b(?:egypt|egyptian)\b/g,'').trim();
    const b=normalize(company).replace(/\b(?:egypt|egyptian)\b/g,'').trim();
    if(!a||!b)return false;
    if(a==='big4'||a.startsWith('big4 ')||a.includes(' ey deloitte pwc'))return /\b(?:ey|deloitte|pwc|kpmg)\b/.test(b);
    return a===b||(' '+b+' ').includes(' '+a+' ')||(' '+a+' ').includes(' '+b+' ');
  }
  function triggers(title,company,sourceKey){
    const source=dictionary?.[sourceKey]||{};
    const keywords=Array.isArray(source.keywords)?source.keywords:[];
    const found=keywords.filter(raw=>{
      // Parenthesized author notes constrain the trigger; they are not part
      // of the literal advertised title.
      if(/big4 context/i.test(raw)&&!employerMatch('Big4',company))return false;
      if(/grad context/i.test(raw)&&!/\b(?:grad|graduate)\b/i.test(title))return false;
      if(/student context/i.test(raw)&&!/\b(?:student|intern|internship)\b/i.test(title))return false;
      return phrase(title,term(raw));
    }).map(term);
    // The authored regex is an additional title trigger, never a description
    // search. This covers exact aliases such as Principal Software Engineer.
    if(source.regex){
      try{
        const match=String(title).match(new RegExp(source.regex,'iu'));
        if(match?.[0]&&!found.includes(match[0]))found.push(match[0]);
      }catch{ /* An invalid optional regex never disables exact keyword checks. */ }
    }
    for(const [brand,phrases] of Object.entries(source.company_brand_names||{})){
      if(!employerMatch(brand,company))continue;
      for(const name of phrases){
        const literal=term(name);
        if(phrase(title,literal))found.push(literal);
      }
    }
    return [...new Set(found)];
  }
  function evaluate(job,experienceCore){
    const title=String(job?.title||job?.position||job?.job_title||'');
    const company=String(job?.company||job?.company_name||job?.employer||'');
    const official=String(job?.seniority||job?.career_level||job?.experience_level||job?.level||'');
    const employment=String(job?.employment||job?.job_type||job?.program_type||'');
    const context=[title,official,employment].filter(Boolean).join(' ');
    const hits=new Map();
    for(const [key,source] of groups){
      const found=triggers(context,company,source);
      if(found.length)hits.set(key,[...(hits.get(key)||[]),...found]);
    }
    // Precedence prevents generic mid words such as 'engineer' from
    // overriding an explicit senior, junior, entry or internship title.
    const high=['director_head_executive','manager','lead','senior'].find(k=>hits.has(k));
    const low=['internship','junior','entry'].find(k=>hits.has(k));
    let level=high||low||(hits.has('mid')?'mid':null);
    // Management trainee is graduate/entry, not student internship by default.
    if(!high&&phrase(title,'management trainee'))level='entry';
    // Generic role-specific trainee titles are training placements; graduate
    // and management trainee tracks remain entry programs.
    if(!high&&phrase(title,'trainee')&&
       !phrase(title,'management trainee')&&!phrase(title,'graduate trainee'))
      level='internship';
    // "Lead Generation" is a sales term, not a technical lead role.
    if(!high||high==='lead'){
      if(phrase(title,'lead generation')&&!/\b(?:team|technical|tech|engineering)\s+lead\b/i.test(title))
        level=hits.has('entry')?'entry':hits.has('internship')?'internship':null;
    }
    // Program title "Go Green" describes a contest pipeline, not proof of an internship.
    if(level==='internship'&&phrase(title,'go green')&&
       !/\b(?:intern|internship|trainee)\b/i.test(title))level=null;
    const ext=experienceCore?.extractExperience?.(job);
    const years=ext?.minimum??null;
    const contradiction=years!==null&&years>2&&['entry','internship'].includes(level);
    if(contradiction)level=null;
    const evidence=[...new Set(hits.get(level)||[])].map(x=>'Title dictionary: '+x);
    if(contradiction)evidence.push('Mandatory experience contradicts early-career title');
    if(years!==null)evidence.push('Applicant minimum: '+years+' years');
    return {level,confidence:level?'dictionary-title':'unknown',
      conflict:contradiction,requiredYears:years,evidence,
      advancedRequirement:years!==null&&years>2};
  }
  function match(job,selected,experienceCore){
    // Keep legacy director/executive saved values readable until the account
    // owner saves the merged dictionary option. These keys are not rendered.
    const aliases={director:'director_head_executive',executive:'director_head_executive'};
    const chosen=(Array.isArray(selected)?selected:[])
      .map(x=>aliases[x]||x).filter(x=>keys.has(x));
    const result=evaluate(job,experienceCore);
    if(!chosen.length)return {match:true,review:false,...result};
    // Multiple checkbox selections are OR across category levels.
    const yes=Boolean(result.level&&chosen.includes(result.level));
    return {match:yes,review:false,...result};
  }
  function matchPrepared(result,selected){
    // Keep legacy director/executive saved values readable until the account
    // owner saves the merged dictionary option. These keys are not rendered.
    const aliases={director:'director_head_executive',executive:'director_head_executive'};
    const chosen=(Array.isArray(selected)?selected:[])
      .map(x=>aliases[x]||x).filter(x=>keys.has(x));
    if(!chosen.length)return {match:true,review:false,...result};
    // Multiple checkbox selections are OR across category levels.
    const yes=Boolean(result.level&&chosen.includes(result.level));
    return {match:yes,review:false,...result};
  }
  return {levels,normalize,phrase,triggers,evaluate,match,matchPrepared};
});
