'use strict';
/*
 * Versioned eligibility experiment. ALL methods operate on the same raw job.
 * Reject = strong evidence of incompatibility; review = underdetermined.
 * No machine-made score is considered ground truth.
 */
(function(root,factory){
 const result=factory();
 if(typeof module==='object'&&module.exports)module.exports=result;
 if(root)root.SecretJEligibilityLab=result;
})(typeof window!=='undefined'?window:null,function(){
 const old=typeof require==='function'?require('./secretj-job-preferences'):null;
 const norm=x=>String(x??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 const title=j=>norm(j.title||j.position||j.job_title);
 const detail=j=>norm([j.requirements,j.description].filter(Boolean).join(' ')).slice(0,24000);
 const seniorTitle=/\b(?:senior|sr\.?|staff|principal|tech(?:nical)? lead|team lead|engineering manager|software manager|development manager|team manager|head of|director)\b/i;
 const strictTitle=/\b(?:senior|sr\.?|staff|principal|lead|consultant|director|head of|team manager|engineering manager|technical manager)\b/i;
 const earlyTitle=/\b(?:intern(?:ship)?|trainee|graduate|junior|jr\.?|fresher|entry[ -]?level|apprentice)\b/i;
 const seniorLevel=/\b(?:senior|principal|staff|executive|mid[ -]?senior|leadership)\b/i;
 const earlyLevel=/\b(?:student|graduate|early professional|entry[ -]?level|junior|intern|trainee)\b/i;
 const highDuty=/\b(?:manage|managing|lead|leading)\s+(?:a\s+|the\s+)?(?:engineering\s+)?(?:team|engineers|developers|people|direct reports)\b/i;
 const level=j=>norm([j.seniority,j.career_level,j.experience_level,j.level].filter(Boolean).join(' '));
 const evidenceLabel=(j)=>level(j)||detail(j).match(/employer career level\s*:\s*([^.;\n]{3,55})/i)?.[1]||'';
 const numberedRequirements=d=>{
   const findings=[];
   // These are experience constraints, not university graduation years,
   // duration of employer operation or an application's open period.
   const patterns=[
    /\b(?:at least|minimum(?: of)?|requires?|required|must have|need(?:s)?)\s*(?:of\s*)?\(?(\d{1,2})\)?\s*\+?\s*(?:years?|yrs?)\b/gi,
    /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:(?:total|direct|professional|relevant|hands-on|work|software|industry|technical|engineering|management)\s+){0,4}(?:experience|building|developing|shipping|leading|managing|working|in\s+(?:software|engineering|technology|IT))\b/gi,
    /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:years?|yrs?)(?:\s+(?:of\s+)?(?:experience|relevant|work|professional))?/gi,
    /\b(\d{1,2})\s+to\s+(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|relevant|work|professional)?/gi,
    /\bexperience\s*:\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi,
    /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience\s+)?(?:in|with)\s+(?:software|engineering|technology|IT|QA|project management|data|cloud|marketing|sales|accounting)\b/gi
   ];
   for(const re of patterns)for(const m of d.matchAll(re)){
     const context=d.slice(Math.max(0,m.index-125),Math.min(d.length,m.index+m[0].length+100));
     if(/\b(?:company|business|retailer|organization|firm|platform)\s+(?:has|with|boasts|brings)\s+(?:over\s+)?\d{1,2}/i.test(context))continue;
     if(/\b(?:years? of experience in (?:offering|serving|providing|the market)|years? in business)\b/i.test(context))continue;
     if(/\b(?:nice to have|preferred|desirable|optional|is a plus|bonus)\b/i.test(d.slice(Math.max(0,m.index-65),m.index)))continue;
     // Exclude explicit calendar / application open periods.
     if(/\b(?:application|posting|remain open|position will be open)\b/i.test(context)&&/\b(?:days|weeks)\b/i.test(context))continue;
     // Accept clear requirements/you-have contexts or direct experience wording;
     // weaker patterns remain review-only unless repeated.
     const pref=/\b(?:preferred|desirable|optional|nice to have|bonus)\b/i.test(context);
     const hard=/\b(?:requirements?|qualifications?|you have|must have|essential|experience|minimum|at least|needs?)\b/i.test(context);
     findings.push({years:Number(m[1]),snippet:context.slice(0,240),hard:hard&&!pref,preferred:pref});
   }
   return findings;
 };
 function evidence(job){
   const t=title(job),d=detail(job),career=evidenceLabel(job);
   const nums=numberedRequirements(d);
   const hard=nums.filter(v=>v.hard);
   const allMin=hard.length?Math.min(...hard.map(v=>v.years)):null;
   const strongest=hard.length?Math.max(...hard.map(v=>v.years)):null;
   return {title:t,career,hardMinimum:allMin,hardMaximum:strongest,
     experienceEvidence:nums,hasDescription:d.length>60,
     highTitle:seniorTitle.test(t),
     strictTitle:strictTitle.test(t),
     juniorTitle:earlyTitle.test(t),
     highCareer:seniorLevel.test(career)&&!earlyLevel.test(career),
     juniorCareer:earlyLevel.test(career),
     leadershipDuty:highDuty.test(d),
     conflict:earlyTitle.test(t)&&seniorLevel.test(career),
     explicitGraduate:/\b(?:graduate in training|graduate program|internship|trainee)\b/i.test(t)};
 }
 const result=(decision,reasons,ev)=>({decision,reasons,evidence:{
   hardMinimum:ev.hardMinimum,hardMaximum:ev.hardMaximum,
   career:ev.career,hasDescription:ev.hasDescription,
   confidence:decision==='review'?'insufficient': 'rule-grounded'
 }});
 function a_baseline(j){const p={role_families:[],max_experience_years:2,egypt_only:false,internships:false};
   const allowed=old?old.isMatch(j,p):true;return {decision:allowed?'include':'exclude',reasons:['current production rule']};}
 function b_title(j){const e=evidence(j);
   if(e.strictTitle)return result('exclude',['advanced title'],e);
   if(e.juniorTitle||e.juniorCareer)return result('include',['junior/graduate signal'],e);
   return result('review',['title alone cannot prove eligibility'],e);
 }
 function c_requirements(j){const e=evidence(j);
   if(e.hardMinimum!==null&&e.hardMinimum>2)return result('exclude',['mandatory experience exceeds two'],e);
   if(e.hardMaximum!==null&&e.hardMaximum>2&&e.hardMinimum===null)return result('review',['mixed mandatory requirements'],e);
   if(e.hardMinimum!==null&&e.hardMinimum<=2)return result('include',['explicit <=2 years'],e);
   return result('review',['missing verifiable minimum years'],e);
 }
 function d_multi(j){const e=evidence(j);
   if(e.highTitle)return result('exclude',['advanced engineering title'],e);
   if(e.hardMinimum!==null&&e.hardMinimum>2)return result('exclude',['mandatory minimum above two'],e);
   if(e.juniorTitle||e.juniorCareer)return result('include',['explicit early-career signal'],e);
   if(e.highCareer)return result('exclude',['advanced ATS career level'],e);
   return result('review',['insufficient evidence'],e);
 }
 function e_conservative(j){const e=evidence(j);
   // High-sensitivity policy: uncertain postings stay reviewable, not falsely
   // certified as eligible or irreversibly discarded.
   if(e.highTitle)return result('exclude',['explicit senior title'],e);
   if(e.hardMinimum!==null&&e.hardMinimum>2)return result('exclude',['hard minimum above two'],e);
   if(e.conflict)return result('review',['title vs ATS contradiction'],e);
   if(e.highCareer&&e.hardMinimum===null)return result('review',['ATS signal without corroborating requirements'],e);
   if(e.juniorTitle||e.juniorCareer||e.hardMinimum!==null&&e.hardMinimum<=2)
     return result('include',['positive junior/requirement evidence'],e);
   return result('review',['employer requirements incomplete or ambiguous'],e);
 }
 return {methods:{
   A_baseline:a_baseline,B_title_only:b_title,C_requirements_only:c_requirements,
   D_multi_evidence:d_multi,E_uncertainty_first:e_conservative
 },evidence,numberedRequirements};
});
