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
 // Known employer naming variants. Generic "engineer" and "analyst"
 // need corroborating details rather than inheriting an unrelated discipline.
 const titleAliases=[
  ['software',/application (?:development|engineer)|(?:software|platform|product) development|associate developer|programming (?:specialist|associate)|technology development/i],
  ['backend',/api (?:engineer|developer)|server (?:engineer|developer)|microservice(?:s)? (?:engineer|developer)/i],
  ['frontend',/web interface|ui engineer|client[ -]?side developer/i],
  ['fullstack',/full[ -]?stack|end[ -]?to[ -]?end developer/i],
  ['cybersecurity',/security operations|blue team|red team|security engineer|information assurance|vulnerability analyst/i],
  ['data_analytics',/reporting analyst|insights analyst|decision scientist|analytics consultant/i],
  ['data_engineering',/etl developer|data platform engineer|big data developer/i],
  ['talent_acquisition',/talent sourc(?:er|ing)|recruitment coordinator|hiring specialist|people sourcer/i],
  ['qa',/test engineer|test specialist|verification engineer|validation engineer/i],
  ['it_support',/technical assistance|end user support|service desk|customer technical engineer/i],
  ['ai_ml',/applied (?:scientist|researcher)|intelligent systems|language model engineer/i],
  ['devops',/release engineer|build engineer|continuous delivery engineer/i],
  ['cloud',/cloud operations|cloud platform|cloud services engineer/i]
 ];
 const genericTitle=/^(?:(?:junior|senior|associate|graduate|entry[ -]?level)\\s+)?(?:technology|technical|it|digital|engineering|application|solutions?|platform|systems?|product|research|development|associate|graduate|intern|trainee|specialist|analyst|engineer|consultant)(?:[ \\/-]+(?:engineer|developer|analyst|intern|trainee|associate|specialist|consultant|graduate|technology|technical|solutions?|systems?|research|engineering|development|platform|program))*(?:\\s*[-–].*)?$/i;
 const descriptorSignals=[
  ['software',/develop(?:ment|ing)? (?:software|applications)|software engineering|coding and programming|design(?:ing)? and build(?:ing)? applications/i],
  ['backend',/backend|back[ -]?end|rest(?:ful)? apis?|microservices|server[ -]?side/i],
  ['frontend',/front[ -]?end|user interfaces|react\\.js|angular|vue\\.js/i],
  ['cybersecurity',/cyber.?security|security monitoring|siem|incident response|penetration testing/i],
  ['ai_ml',/machine learning|deep learning|generative ai|natural language processing|large language models/i],
  ['cv',/computer vision|object detection|image processing/i],
  ['data_engineering',/data pipeline|etl process|data warehouse engineering/i],
  ['talent_acquisition',/talent acquisition|candidate sourcing|recruitment lifecycle|interview coordination/i],
  ['qa',/test automation|quality assurance|test plans|functional testing/i],
  ['cloud',/cloud infrastructure|aws cloud|azure cloud|cloud computing/i]
 ];
 function classify(job){
  const title=String(job.title||job.position||job.job_title||'').trim();
  const values=new Set(categories.slice(0,-1).filter(([, ,re])=>re.test(title)).map(([key])=>key));
  for(const [key,re] of titleAliases)if(re.test(title))values.add(key);
  // Description helps only for genuinely ambiguous titles; never infer that
  // an HR manager is an AI engineer merely because an HR posting mentions AI.
  if(!values.size && genericTitle.test(title)){
    const desc=String(job.description||job.summary||'').slice(0,1600);
    for(const [key,re] of descriptorSignals)if(re.test(desc))values.add(key);
  }
  return values.size?[...values]:['other'];
 }
 function hasFilters(p){
  return !!p&&(Array.isArray(p.role_families)&&p.role_families.length>0||
    p.max_experience_years!==null&&p.max_experience_years!==undefined&&p.max_experience_years!==''||
    p.egypt_only===true||p.internships===true);
 }
 function yearsRequired(job){
  // Requirements must be present in the stored snapshot. Do not confuse the
  // employer's history ("27 years in business") with applicant experience.
  const raw=String(job.requirements||'')+' '+String(job.description||'');
  const source=raw.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,20000);
  const heading=source.search(/\b(?:requirements|qualifications|what you bring|who you are|must[- ]haves?)\s*[:\-]?\s/i);
  const section=heading>=0?source.slice(heading).split(/\b(?:benefits|what we offer|about (?:us|the company)|how to apply)\s*[:\-]?\s/i)[0]:source;
  const patterns=[
    /\b(?:at least|minimum(?: of)?|requires?|required|must have|need(?:s)?)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi,
    /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:(?:relevant|professional|commercial|industry|hands-on|work|software engineering|software development)\s+){0,3}experience\b/gi,
    /\b(\d{1,2})\s*[-–]\s*\d{1,2}\s*(?:years?|yrs?)\s+(?:of\s+)?(?:(?:relevant|professional)\s+)?experience\b/gi,
    /\bexperience\s*:?\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi,
    /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:total|direct|hands[- ]on|overall|prior)\s+(?:(?:relevant|professional|software|technical|people|team|engineering|management|leadership|work|industry|development)\s+){0,5}experience\b/gi,
    /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:total|direct)\s+(?:experience|(?:people|team|technical)\s+management)\b/gi,
    /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+of\s+(?:building|developing|designing|shipping|delivering|implementing|architecting|managing|leading|working)\b/gi
  ];
  const numbers=[];
  for(const pattern of patterns){
    for(const match of section.matchAll(pattern)){
      const before=section.slice(Math.max(0,match.index-85),match.index);
      const after=section.slice(match.index,match.index+125);
      // "B.TECH has over 27 years of experience in offering..." is history,
      // not a mandatory requirement for applicants.
      if(/\byears?\s+of\s+experience\s+in\s+(?:offering|providing|serving|helping|the\s+market)\b/i.test(after))continue;
      if(/\b(?:company|retailer|platform|business)\s+(?:has|with|brings|boasts)\s+(?:over\s+)?\d{1,2}\+?\s+years?/i.test(before+after))continue;
      numbers.push(Number(match[1]));
    }
  }
  if(numbers.length)return Math.max(...numbers);
  if(internships.test(String(job.title||'')))return 0;
  return null; // Unknown remains unknown, not a fabricated zero.
 }
 // Evidence-based eligibility: one single decision function for browser and email.
 // "review" is a soft signal, NOT a rejection: missing descriptions should
 // never silently cost a member a potential opportunity.
 const highTitle=/\b(?:senior|sr\.?|lead|consultant|staff|principal|director|head of|team manager|engineering manager|software manager|development manager|technical manager|tech manager|tech lead|team lead)\b/i;
 const juniorTitle=/\b(?:junior|jr\.?|entry[ -]?level|graduate|fresh(?:er| graduate)|new grad|intern(?:ship)?|trainee|apprentice|associate)\b/i;
 const higherATS=/\b(?:senior|mid[ -]?senior|mid[ -]?level|lead|principal|staff|director|executive|management)\b/i;
 const juniorATS=/\b(?:entry[ -]?level|entry professional|graduate|early[ -]?career|junior|intern(?:ship)?|trainee|associate)\b/i;
 const ownershipSignals=[
   /\b(?:manage|managing|lead|leading)\s+(?:a\s+|the\s+)?(?:team|engineers|developers|direct reports|people)\b/i,
   /\b(?:hire|hiring|performance reviews?|performance appraisals?|people management|direct reports)\b/i,
   /\b(?:own|ownership of|accountable for)\s+(?:the\s+)?(?:engineering|technical|technology)\s+(?:strategy|roadmap|organization|department)\b/i
 ];
 function assess(job,p){
   if(!hasFilters(p))return {match:true,status:'unrestricted',reasons:[],requiredYears:null,categories:classify(job),evidence:[]};
   const title=String(job.title||job.position||job.job_title||'');
   const location=String(job.location||job.job_location||'');
   const selected=Array.isArray(p.role_families)?p.role_families:[];
   const fields=classify(job);
   const reasons=[];
   const evidence=[];
   let review=false;
   if(p.egypt_only===true&&!egypt.test(location))reasons.push('Outside selected location');
   if(p.internships===true&&!internships.test(title+' '+String(job.employment||'')))reasons.push('Not an internship');
   if(selected.length&&!fields.some(key=>selected.includes(key)))
     reasons.push(fields.includes('other')?'Unclassified career field':'Outside selected career fields');
   const limit=p.max_experience_years===null||p.max_experience_years===undefined||p.max_experience_years===''?null:Number(p.max_experience_years);
   let required=null;
   if(limit!==null&&Number.isFinite(limit)){
     required=yearsRequired(job);
     if(required!==null) {
       evidence.push('Experience requirement detected: '+required+' years');
       if(required>limit)reasons.push('Requires '+required+' years; maximum '+limit);
     } else {
       review=true;
       evidence.push('No verified minimum years in stored description');
     }
     if(limit<=2){
       const level=String(job.seniority||job.career_level||job.experience_level||job.level||'');
       const titleIsHigh=highTitle.test(title);
       const titleIsJunior=juniorTitle.test(title);
       const levelIsHigh=higherATS.test(level);
       const levelIsJunior=juniorATS.test(level);
       if(titleIsHigh){
         reasons.push('Senior/Lead/Consultant/Staff/Principal or management title');
         evidence.push('Advanced title: '+title.slice(0,110));
       }
       if(levelIsHigh){
         evidence.push('Employer career level: '+level.slice(0,100));
         if(titleIsJunior&&!titleIsHigh){
           review=true;
           evidence.push('Conflicting employer seniority and junior title; manual review');
         } else reasons.push('Employer labels the vacancy as advanced level');
       }
       if(titleIsJunior||levelIsJunior)evidence.push('Entry/graduate signal from title or employer level');
       const text=String(job.requirements||'')+' '+String(job.description||'');
       const heading=text.search(/\b(?:responsibilities|what you will do|about the role)\b/i);
       const responsibility=heading<0?'':text.slice(heading,heading+5000).replace(/<[^>]*>/g,' ');
       const signals=ownershipSignals.filter(re=>re.test(responsibility));
       if(signals.length>=2&&!titleIsHigh&&!levelIsHigh){
         review=true;
         evidence.push('Several people/department leadership responsibilities; verify seniority');
       }
     }
   }
   const unique=[...new Set(reasons)];
   return {
     match:unique.length===0,
     status:unique.length?'excluded':review?'experience-unverified':'matched',
     reasons:unique,requiredYears:required,categories:fields,evidence
   };
 }
 function isMatch(job,p){return assess(job,p).match;}
 function explain(job,p){return assess(job,p);}

 return {categories:categories.map(([key,label])=>({key,label})),classify,hasFilters,isMatch,yearsRequired,explain,assess};
});
