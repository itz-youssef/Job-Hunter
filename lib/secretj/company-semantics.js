'use strict';
/**
 * Employer-aware evidence, NOT an unverified synonym dictionary.
 *
 * Verified examples:
 * - Vodafone VOIS Work Experience Programme - Technology (Oct 2026):
 *   an internship with AI/software/data projects in original vacancy text.
 * - Vodafone VOIS Work Experience Programme - HR Operations:
 *   an internship, but in HR, not an AI/software engineering role.
 * - Siemens "Early Professional": read as ATS career label only when
 *   supplied by source; a generic description mention is not proof.
 *
 * All titles/descriptions remain untrusted employer data.
 */
const prefs=require('../../dist/assets/secretj-job-preferences');
const verifiedCompany=(job,re)=>re.test(String(job.company||''))||
  re.test(String(job.url||job.apply_url||''));
const text=x=>String(x||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const explicitNonTechnical=/\b(?:human resources|hr operations|recruit(?:ment|ing)|payroll|sales|marketing|finance|accounting|legal|customer service|call center|talent acquisition|people operations)\b/i;
const technicalTitle=/\b(?:python api|backend|back[ -]?end|software|developer|programmer|computer vision|perception|machine learning|mlops|data engineer|devops|site reliability|cybersecurity|qa engineer|automation engineer|cloud engineer)\b/i;
const technicalDescriptions={
  ai_ml:/\b(?:machine learning models?|deep learning|model training|pytorch|tensorflow|llm|artificial intelligence|generative ai)\b/i,
  cv:/\b(?:computer vision|image segmentation|object detection|visual recognition|video analytics|image processing|perception)\b/i,
  software:/\b(?:software development|software engineering|application development|develop (?:software|applications)|build (?:software|applications))\b/i,
  backend:/\b(?:rest(?:ful)? apis?|backend services|server[ -]?side development|api development)\b/i,
  data_engineering:/\b(?:data pipelines?|data engineering|etl pipelines?)\b/i,
  data_analytics:/\b(?:data analysis|data analytics|business intelligence|power bi)\b/i,
  devops:/\b(?:devops|devsecops|ci\/cd|site reliability)\b/i,
  cloud:/\b(?:cloud engineering|cloud infrastructure|aws infrastructure|azure infrastructure)\b/i
};
function employerTerms(job){
  const title=text(job.title);
  const desc=text(job.description);
  const result={program_level:null,program_evidence:'',role_context:'',provenance:'none'};
  if(verifiedCompany(job,/\b(?:vodafone|vois)\b|vodafone\.com/i)){
    if(/\bwork experience programme\b/i.test(title)&&
       /\b(?:internship|intern|student|early career|six.month|6.month)\b/i.test(desc)){
      result.program_level='internship';
      result.program_evidence='Vodafone VOIS original vacancy describes Work Experience Programme as an internship';
      result.provenance='company-program-and-posting';
    }
    if(/\bdiscover graduate program\b/i.test(title)&&
       /\b(?:graduate|fresh grad)\b/i.test(desc)){
      result.program_level='entry';
      result.program_evidence='Vodafone original vacancy specifies graduate eligibility';
      result.provenance='company-program-and-posting';
    }
    if(/\bwork experience programme\b/i.test(title))
      result.role_context=(title.split(/\b(?:programme|program)\b/i).slice(1).join(' ')||'').trim();
  }
  if(verifiedCompany(job,/siemens/i)&&
    /\bearly professional\b/i.test(text(job.seniority||job.career_level||job.experience_level)))
    result.program_level='entry',result.program_evidence='Siemens official ATS career label: Early Professional',
    result.provenance='ats-explicit-level';
  return result;
}
function fieldGate(job,selected){
  if(!Array.isArray(selected)||!selected.length)return {decision:'pass',reason:'no-field-filter'};
  const title=text(job.title),department=text(job.department||job.source_facets?.department||
    job.source_facets?.team||job.category||'');
  const desc=text(job.description||job.requirements);
  const normalizedFields=prefs.classify({title});
  // Only narrowly evidenced occupational aliases, not broad word overlap.
  if(/\bpython\s+api\s+developer\b/i.test(title))
    normalizedFields.push('backend','software');
  if(/\bperception\s+engineer\b/i.test(title))
    normalizedFields.push('cv');
  const titleKnown=[...new Set(normalizedFields.filter(x=>x!=='other'))];
  const direct=titleKnown.some(x=>selected.includes(x));
  const sourceDepartment=prefs.classify({title:department}).filter(x=>x!=='other');
  const employer=employerTerms(job);
  // A business role containing "AI" or "data" is not automatically
  // an AI engineering job. A generic business role must not be rescued
  // by boilerplate mentioning technology across the employer.
  // Vodafone Corporate Security Work Experience roles can mean fraud/compliance
  // operations rather than cyber/infosec engineering. Avoid the live GPT-OSS
  // false positive observed in semantic benchmark (case 7/12).
  if(selected.length===1&&selected[0]==='cybersecurity'&&
    /\\b(?:corporate security|fraud management|fraud risk|fraud prevention)\\b/i.test(title+' '+desc)&&
    !/\\b(?:cybersecurity|network security|information security|soc analyst|penetration testing|vulnerability|incident response|siem)\\b/i.test(desc))
    return {decision:'reject',reason:'corporate-fraud-not-cybersecurity',employer};
  const businessTitle=explicitNonTechnical.test(title)&&
    !/\b(?:software engineer|machine learning engineer|data engineer|backend developer|computer vision engineer)\b/i.test(title);
  if(businessTitle&&!sourceDepartment.some(x=>selected.includes(x)))
    return {decision:'reject',reason:'explicit-business-field',employer};
  if(direct||sourceDepartment.some(x=>selected.includes(x)))
    return {decision:'pass',reason:direct?'title-family':'employer-department',employer};
  // Strong employer task descriptions are only a candidate for AI
  // verification. They are not accepted as proof by themselves.
  const evidence=selected.filter(key=>technicalDescriptions[key]?.test(desc));
  if(evidence.length)
    return {decision:'review',reason:'description-tasks-need-semantic-verification',
      candidateFields:evidence,employer};
  if(!titleKnown.length&&
    (/\b(?:technology|digital|engineering|platform|research|technical|work experience programme)\b/i.test(title+' '+department)))
    return {decision:'review',reason:'ambiguous-technology-role',employer};
  if(titleKnown.length)return {decision:'reject',reason:'explicit-other-role-family',employer};
  return {decision:'review',reason:'field-evidence-insufficient',employer};
}
function preflight(job,p){
  const assessed=prefs.assess(job,p);
  const field=fieldGate(job,p.role_families);
  const other=assessed.reasons.filter(r=>r!=='Outside selected career fields');
  if(other.length)return {ok:false,reason:other.join('; '),field};
  if(field.decision==='reject')return {ok:false,reason:field.reason,field};
  return {ok:true,needsSemanticReview:field.decision==='review',field};
}
module.exports={employerTerms,fieldGate,preflight};
