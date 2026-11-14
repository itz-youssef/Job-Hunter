/* One catalog of occupational categories for account settings, feed and mail.
 * Patterns classify TITLE only; an incidental keyword in descriptions must not
 * turn an HR vacancy into software engineering.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SecretJJobPreferences=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const categories=[
 ['software','Software Engineering',/software (?:engineer|developer|development)|application (?:developer|engineer)|\bprogrammer\b|\bswe\b|\bsde\b/i],
 ['backend','Backend Development',/back[ -]?end|server[ -]?side|(?:python|java|node\.?js|golang|go|php|ruby|\.net) developer/i],
 ['frontend','Frontend Development',/front[ -]?end|front[ -]?end|\breact developer\b|\bangular developer\b|\bvue developer\b/i],
 ['fullstack','Full-stack Development',/full[ -]?stack/i],
 ['mobile','Mobile Development',/mobile (?:developer|engineer)|android|ios developer|flutter|react native/i],
 ['web','Web Development',/web (?:developer|engineer|development)|wordpress|shopify developer/i],
 ['ai_ml','AI & Machine Learning',/\bai\b|artificial intelligence|machine learning|\bml\b|deep learning|generative ai|genai|\bllm\b|\bnlp\b/i],
 ['cv','Computer Vision',/computer vision|image processing|video analytics|perception engineer/i],
 ['mlops','MLOps & AI Platform',/\bmlops\b|ml platform|machine learning operations|model deployment|ai infrastructure/i],
 ['data_science','Data Science',/data scien(?:ce|tist)|statistical model|quantitative (?:analyst|scientist)/i],
 ['data_analytics','Data Analytics & BI',/data analyst|business intelligence|\bbi analyst\b|power bi|tableau|analytics specialist/i],
 ['data_engineering','Data Engineering',/data engineer|etl engineer|data pipeline|analytics engineer/i],
 ['cybersecurity','Cybersecurity',/cyber.?security|information security|security analyst|soc analyst|penetration test|pentest|incident response|threat intelligence/i],
 ['cloud','Cloud Engineering',/cloud engineer|cloud architect|cloud infrastructure|aws engineer|azure engineer/i],
 ['devops','DevOps & SRE',/devops|site reliability|\bsre\b|platform engineer|infrastructure engineer/i],
 ['qa','QA & Software Testing',/quality assurance|\bqa\b|software test|test automation|testing engineer|\bsdet\b/i],
 ['it_support','IT & Technical Support',/it support|technical support|help.?desk|service desk|desktop support|it specialist|support engineer/i],
 ['network','Network Engineering',/network engineer|network administrator|network specialist|telecom(?:munications)? engineer/i],
 ['systems','Systems Administration',/system(?:s)? administrator|sysadmin|linux administrator|windows administrator|it operations/i],
 ['database','Database Administration',/database administrator|\bdba\b|database engineer|sql developer/i],
 ['product','Product Management',/product manager|product owner|product analyst|associate product/i],
 ['project','Project & Program Management',/project manager|program manager|technical project|scrum master|agile coach/i],
 ['ux_ui','UI/UX & Product Design',/\bui\b|\bux\b|product designer|interaction designer|user experience|user interface/i],
 ['graphic','Graphic & Digital Design',/graphic design|visual design|motion design|creative design|digital designer/i],
 ['business_analysis','Business & Systems Analysis',/business analyst|systems analyst|business systems|requirements analyst/i],
 ['erp','ERP & Enterprise Systems',/\berp\b|\bsap\b|salesforce|oracle functional|dynamics 365|servicenow/i],
 ['embedded','Embedded Systems',/embedded|firmware|\biot\b|internet of things|microcontroller/i],
 ['robotics','Robotics & Automation',/robotic|automation engineer|control systems|plc engineer|mechatronics/i],
 ['game','Game Development',/game developer|game engineer|unity developer|unreal engine/i],
 ['blockchain','Blockchain & Web3',/blockchain|web3|smart contract|solidity/i],
 ['research','Technology Research & R&D',/research engineer|research scientist|research assistant|research and development|\br&d\b/i],
 ['solutions','Solutions & Sales Engineering',/solutions? architect|solutions? engineer|sales engineer|presales|pre-sales|technical consultant/i],
 ['technical_writing','Technical Writing',/technical writer|documentation engineer|developer advocate|technical content/i],
 ['talent_acquisition','Talent Acquisition & Tech Recruitment',/talent acquisition|recruiter|recruitment|recruiting specialist|sourcer|talent partner/i],
 ['hr','Human Resources & People Ops',/human resources|\bhr\b|people operations|hr generalist|hr business partner|personnel/i],
 ['marketing','Digital & Growth Marketing',/digital marketing|growth marketing|seo specialist|performance marketing|content marketing/i],
 ['finance','Finance & Accounting',/finance analyst|financial analyst|accountant|accounting|audit associate|tax associate/i],
 ['operations','Operations & Supply Chain',/operations analyst|operations specialist|supply chain|procurement|logistics coordinator/i],
 ['customer_success','Customer Success & Service',/customer success|customer service|customer experience|client support|account manager/i],
 ['sales','Sales & Business Development',/sales representative|business development|sales executive|sales specialist|account executive/i],
 ['other','Other jobs',null]
 ];
 const egypt=/egypt|cairo|giza|alexandria|mansoura|tanta|suez|ismailia|october|sheikh zayed|maadi|helwan|nasr city|aswan|luxor|damietta|sohag|port said|hurghada|sharm el sheikh|assiut|new capital|qalyubia|\begy\b/i;
 const internships=/\b(?:intern(?:ship)?s?|trainee|traineeship|apprentice(?:ship)?|graduate\s+program(?:me)?|work experience)\b/i;
 function classify(job){
  const title=String(job.title||job.position||job.job_title||'');
  const values=categories.slice(0,-1).filter(([, ,re])=>re.test(title)).map(([key])=>key);
  return values.length?values:['other'];
 }
 function hasFilters(p){
  return !!p&&(Array.isArray(p.role_families)&&p.role_families.length>0||
    p.max_experience_years!==null&&p.max_experience_years!==undefined&&p.max_experience_years!==''||
    p.egypt_only===true||p.internships===true);
 }
 function yearsRequired(job){
  const description=String(job.description||'').slice(0,12000);
  const title=String(job.title||'');
  const explicit=description.match(/\b(?:minimum|min\.?|at least|requires?|required|over|more than)\s*(?:of\s*)?(\d{1,2})\s*\+?\s*years?\b/i)||
   description.match(/\b(\d{1,2})\s*\+?\s*years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?experience\b/i)||
   description.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*years?\s+(?:of\s+)?experience\b/i);
  if(explicit)return Number(explicit[1]);
  if(internships.test(title))return 0;
  return null; // Unknown is NOT automatically 0; avoid silently discarding jobs.
 }
 function isMatch(job,p){
  if(!p||!hasFilters(p))return true;
  const title=String(job.title||job.position||job.job_title||'');
  const loc=String(job.location||job.job_location||'');
  if(p.egypt_only===true&&!egypt.test(loc))return false;
  if(p.internships===true&&!internships.test(title+' '+String(job.employment||'')))return false;
  const categoriesWanted=Array.isArray(p.role_families)?p.role_families:[];
  if(categoriesWanted.length&&!classify(job).some(key=>categoriesWanted.includes(key)))return false;
  if(p.max_experience_years!==null&&p.max_experience_years!==undefined&&p.max_experience_years!==''){
   const years=Number(p.max_experience_years);
   if(Number.isFinite(years)){
    const required=yearsRequired(job);
    if(required!==null&&required>years)return false;
   }
  }
  return true;
 }
 return {categories:categories.map(([key,label])=>({key,label})),classify,hasFilters,isMatch,yearsRequired};
});
