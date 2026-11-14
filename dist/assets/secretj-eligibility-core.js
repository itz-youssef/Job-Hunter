'use strict';
/**
 * Candidate F - constraint-aware eligibility with an explicit abstain state.
 * Designed to run locally and deterministically in Node and browsers.
 * NO LLM guesses or externally inferred years.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SecretJEligibilityCore=api;
})(typeof window!=='undefined'?window:null,function(){
 const norm=x=>String(x??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 const highTitle=/\b(?:senior|sr\.?|staff|principal|lead|consultant|head of|director|team manager|engineering manager|software manager|development manager|technical manager|tech manager)\b/i;
 const earlyTitle=/\b(?:junior|jr\.?|entry[ -]?level|intern(?:ship)?|trainee|apprentice|graduate|fresh\s*graduate|new\s*grad|fresher)\b/i;
 const earlyCareer=/\b(?:early professional|entry[ -]?level|students?\/graduates?|graduate|junior|trainee|intern|apprentice)\b/i;
 const advancedCareer=/\b(?:senior|principal|staff|mid[ -]?senior|director|executive|leadership)\b/i;
 const numeric=/(\d{1,2})/;
 const wordNumber={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
 function extractExperience(job){
  const raw=[job.requirements,job.description].filter(Boolean).join(' ');
  const d=norm(raw).slice(0,24000);
  const out=[];
  const patterns=[
   /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:total\s+|direct\s+|professional\s+|hands-on\s+|relevant\s+|work\s+|industry\s+|technical\s+|software\s+|engineering\s+|development\s+|management\s+|leadership\s+){0,6}experience\b/gi,
   /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:[a-z][a-z-]*\s+){0,6}(?:experience|building|shipping|developing|working|leading|managing|in\s+(?:software|engineering|IT|automation|cloud|data|QA|sales|marketing|accounting|technology))\b/gi,
   /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:building|closing|designing|shipping|delivering|developing|implementing|managing|leading|working)\b/gi,
   /\b(?:at least|minimum(?: of)?|requires?|required|must have|needs?|experience\s*:)\s*(?:of\s*)?\(?(\d{1,2})\)?\s*\+?\s*(?:years?|yrs?)\b/gi,
   /\b(\d{1,2})\s*(?:to|[-–])\s*(\d{1,2})\s*(?:years?|yrs?)\b/gi,
   /\b\+(\d{1,2})\s*(?:years?|yrs?)\b/gi,
   /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:customer|stakeholder|account|construction|project|engineering|software|technical|industry)\s+(?:support|management|supervision|development|delivery|planning|operations|experience)\b/gi
  ];
  for(const re of patterns)for(const m of d.matchAll(re)){
    const start=m.index,end=start+m[0].length;
    const pre=d.slice(Math.max(0,start-90),start),post=d.slice(end,Math.min(d.length,end+90));
    const full=(pre+m[0]+post);
    if(/\b(?:retailer|company|business|platform|firm|organization)\s+(?:has|with|boasts|brings)\s+(?:over\s+)?\d{1,2}/i.test(full))continue;
    if(/\byears?\s+of\s+experience\s+in\s+(?:offering|providing|serving|helping|the market)\b/i.test(full))continue;
    if(/\b(?:open\s+for\s+a\s+minimum|posting\s+open|application\s+period)\b/i.test(full))continue;
    if(/\b(?:preferred|nice to have|desirable|advantage|is a plus|optional)\b/i.test(post.slice(0,34)))continue;
    if(/\b(?:preferred|nice to have|desirable|advantage|is a plus|optional)\s*[:\-]?\s*$/i.test(pre.slice(-45)))continue;
    const years=Number(m[1]);
    if(!Number.isInteger(years)||years>40)continue;
    const hard=/\b(?:requirements?|qualifications?|must|have|need|essential|you have|looking for|minimum|experience|at least|required|you might be a fit)\b/i.test(full) ||
      /\b(?:building|closing|managing|developing|supervision|software|engineering)\b/i.test(m[0]);
    if(!hard)continue;
    out.push({years,span:full.slice(0,220),start,end});
  }
  // Phrase "minimum two years" isn't numeric.
  for(const m of d.matchAll(/\b(?:at least|minimum(?: of)?|requires?|required|experience\s*:)\s*(zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\b/gi)){
    out.push({years:wordNumber[m[1].toLowerCase()],span:d.slice(Math.max(0,m.index-60),m.index+100),start:m.index,end:m.index+m[0].length});
  }
  // In "0–2 years experience", minimum is 0; requirements <=2.
  const uniq=new Map(out.map(x=>[x.start+':'+x.years,x]));
  const findings=[...uniq.values()].sort((a,b)=>a.start-b.start);
  let minimum=null;
  if(findings.length){
    const vals=findings.map(x=>x.years);
    let alternatives=false;
    for(let i=1;i<findings.length;i++){
      const gap=d.slice(findings[i-1].end,findings[i].start);
      if(gap.length<=130&&/\bor\b/i.test(gap)&&/\b(?:bachelor|master|degree|years?|experience|management|support)\b/i.test(
        d.slice(Math.max(0,findings[i-1].start-80),findings[i].end+80))){
        alternatives=true;break;
      }
    }
    // Multiple independent requirements must ALL be met; choose the highest.
    // For explicit OR alternative pathways choose the easier admissible path.
    minimum=alternatives?Math.min(...vals):Math.max(...vals);
  }
  return {minimum,findings};
 }
 function evaluate(job,maxYears=2){
  const t=norm(job.title||job.position||job.job_title);
  const level=norm([job.seniority,job.career_level,job.experience_level,job.level].filter(Boolean).join(' '));
  const d=norm([job.description,job.requirements].filter(Boolean).join(' '));
  const inferredLevel=level||d.match(/employer career level\s*:\s*([^.;\n]{3,60})/i)?.[1]||'';
  const yrs=extractExperience(job);
  const reasons=[],evidence=[];
  const junior=earlyTitle.test(t)||earlyCareer.test(inferredLevel)||/\b(?:graduate in training|young professionals? program|work experience programme)\b/i.test(t);
  const senior=highTitle.test(t);
  if(senior)reasons.push('Advanced title');
  if(yrs.minimum!==null){
    evidence.push('Candidate minimum '+yrs.minimum+' years');
    if(yrs.minimum>maxYears)reasons.push('Required experience '+yrs.minimum+' > '+maxYears);
  }
  const levelSenior=advancedCareer.test(inferredLevel)&&!earlyCareer.test(inferredLevel);
  if(levelSenior){
    evidence.push('ATS career level '+inferredLevel);
    if(!junior&&!senior&&yrs.minimum===null)evidence.push('Advanced career label without confirmatory minimum');
  }
  if(junior)evidence.push('Graduate/early-career title or level');
  let decision='review';
  if(reasons.length)decision='exclude';
  else if(junior&&levelSenior)decision='review';
  else if(levelSenior&&yrs.minimum===null)decision='review';
  else if(junior||yrs.minimum!==null&&yrs.minimum<=maxYears)decision='include';
  else decision='review';
  return {decision,reasons,evidence,requiredYears:yrs.minimum,
    hasDescription:d.length>60,level:inferredLevel,
    sourceSpans:yrs.findings.map(x=>x.span.slice(0,150)).slice(0,6)};
 }
 return {evaluate,extractExperience};
});
