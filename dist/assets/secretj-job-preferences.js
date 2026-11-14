/* Shared, deterministic job preference matching for the browser and Worker.
 * Anonymous and unconfigured members browse the public catalog; only
 * explicitly configured members receive a personalized view.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SecretJJobPreferences=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const families={
  software:/software|developer|backend|back.end|frontend|front.end|full.stack|programmer|web engineer|mobile engineer|\bswe\b|\bsde\b/i,
  ai_ml:/machine learning|artificial intelligence|ai engineer|\bai\b|data scientist|deep learning|\bnlp\b|\bllm\b|\bgenai\b/i,
  cv:/computer vision|image processing|video analytics|vision engineer|perception/i,
  mlops:/mlops|machine learning operations|devops.*ml|model deployment|ml platform|ml infrastructure/i
 };
 const egypt=/egypt|cairo|giza|alexandria|mansoura|tanta|suez|ismailia|october|sheikh zayed|maadi|helwan|nasr city|aswan|luxor|damietta|sohag|port said|hurghada|sharm el sheikh|assiut|new capital|qalyubia/i;
 const internship=/\b(?:intern(?:ship)?s?|trainee|traineeship|apprentice(?:ship)?|graduate\s+program(?:me)?|work experience)\b/i;
 const senior=/\b(?:senior|sr\.?|lead|principal|staff|manager|management|director|head\s+of|architect|expert|mid[\s-]level|mid[\s-]senior|team\s+lead|tech\s+lead)\b/i;
 function isMatch(job,prefs){
  if(!prefs||!Array.isArray(prefs.role_families)||!prefs.role_families.length)return false;
  const title=String(job.title||job.position||job.job_title||'');
  const desc=String(job.description||'').slice(0,350);
  const loc=String(job.location||job.job_location||'');
  const employment=String(job.employment||job.job_type||'');
  const score=Number(job.match_score??job.relevance_score??job.score??0);
  // The raw public catalog contains roles outside the original early-career
  // eligibility rules; do not turn them into unsolicited notification matches.
  if(job.matched===false||!Number.isFinite(score)||score<8||senior.test(title))return false;
  if(prefs.egypt_only&&!egypt.test(loc))return false;
  if(!prefs.internships&&internship.test(title+' '+employment))return false;
  return prefs.role_families.some(k=>families[k]&&families[k].test(title+' '+desc));
 }
 return {isMatch};
});
