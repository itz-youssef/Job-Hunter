'use strict';
/* Audits EVERY job in the currently published snapshot.
 * Reports evidence coverage separately from algorithm correctness.
 * A missing employer description cannot be called "verified" or 100% accurate.
 */
const fs=require('node:fs');
const path=require('node:path');
const search=require('../dist/assets/secretj-job-search');
const prefs=require('../dist/assets/secretj-job-preferences');
function auditCatalog(jobs,generatedAt=''){
  const profiles={
    beginner:{role_families:[],max_experience_years:2,egypt_only:false,internships:false},
    unrestricted:{role_families:[],max_experience_years:null,egypt_only:false,internships:false}
  };
  const stats={total:jobs.length,descriptionMissing:0,postingDateMissing:0,
    levelMissing:0,employmentMissing:0,invalidApplyLinks:0,duplicateApplyLinks:0,
    outsideBeginner:0,unverifiedBeginner:0,otherCategory:0,internshipTagged:0,
    internshipSearchable:0,searchUnreachable:0,matchExplanationDisagreement:0};
  const byCompany={};
  const seenUrls=new Set();
  const rows=jobs.map((j,index)=>{
    const title=String(j.title||j.position||j.job_title||'');
    const company=String(j.company||j.company_name||j.employer||'');
    const url=String(j.url||j.apply_url||j.link||'');
    let safe=false;
    try{const u=new URL(url);safe=u.protocol==='https:'&&!u.username&&!u.password;}catch{}
    const description=String(j.description||j.requirements||'');
    const posted=Boolean(j.published_at||j.published||j.date_posted);
    const level=Boolean(j.seniority||j.experience_level||j.career_level||j.level);
    const employment=Boolean(j.employment||j.job_type);
    const internship=search.isInternship(j);
    const internshipsFound=search.matches(j,'internship',prefs.classify);
    const ownTitleFound=search.matches(j,title,prefs.classify);
    const evaluation=prefs.assess(j,profiles.beginner);
    const match=prefs.isMatch(j,profiles.beginner);
    const categories=prefs.classify(j);
    const reasons=[];
    if(!description){stats.descriptionMissing++;reasons.push('description_missing');}
    if(!posted){stats.postingDateMissing++;reasons.push('posted_date_missing');}
    if(!level){stats.levelMissing++;}
    if(!employment){stats.employmentMissing++;}
    if(!safe){stats.invalidApplyLinks++;reasons.push('invalid_apply_url');}
    if(seenUrls.has(url)){stats.duplicateApplyLinks++;reasons.push('duplicate_apply_url');}
    seenUrls.add(url);
    if(!ownTitleFound){stats.searchUnreachable++;reasons.push('title_unsearchable');}
    if(internship&&!internshipsFound)reasons.push('internship_unsearchable');
    if(!evaluation.match)stats.outsideBeginner++;
    if(evaluation.status==='experience-unverified')stats.unverifiedBeginner++;
    if(categories.includes('other'))stats.otherCategory++;
    if(internship)stats.internshipTagged++;
    if(internshipsFound)stats.internshipSearchable++;
    if(evaluation.match!==match||prefs.explain(j,profiles.beginner).match!==match){
      stats.matchExplanationDisagreement++;reasons.push('inconsistent_matcher');
    }
    byCompany[company]??={total:0,missingDescription:0,internships:0,beginnerMatches:0};
    byCompany[company].total++;
    if(!description)byCompany[company].missingDescription++;
    if(internship)byCompany[company].internships++;
    if(evaluation.match)byCompany[company].beginnerMatches++;
    return {index:index+1,id:String(j.id||j.source_id||url),company,title,url,
      categories,internship,internshipSearchable:internshipsFound,
      hasDescription:!!description,hasEmployerPostDate:posted,hasCareerLevel:level,
      requiredYears:evaluation.requiredYears,beginnerEligibility:evaluation.status,
      beginnerMatch:match,explanation:evaluation.reasons,issues:reasons};
  });
  const deloitte=rows.filter(j=>/deloitte/i.test(j.company)&&/giu winter internship/i.test(j.title));
  return {generatedAt,totalReviewed:rows.length,metrics:stats,byCompany,
    regression:{deloitteGIUFound:deloitte.length,deloitteGIUSearchable:deloitte.filter(j=>j.internshipSearchable).length},
    rows};
}
function csvCell(v){const x=typeof v==='string'?v:JSON.stringify(v??'');return '"'+x.replace(/"/g,'""')+'"';}
function toCsv(rows){
 const fields=['index','id','company','title','url','categories','internship','internshipSearchable',
   'hasDescription','hasEmployerPostDate','hasCareerLevel','requiredYears','beginnerEligibility',
   'beginnerMatch','explanation','issues'];
 return fields.join(',')+'\n'+rows.map(r=>fields.map(f=>csvCell(r[f])).join(',')).join('\n')+'\n';
}
if(require.main===module){
 const input=JSON.parse(fs.readFileSync(path.join(__dirname,'..','dist','data.json'),'utf8'));
 const report=auditCatalog(input.jobs||[],input.generated_at||'');
 const target=path.join(__dirname,'..','reports','job-catalog-audit');
 fs.mkdirSync(target,{recursive:true});
 fs.writeFileSync(path.join(target,'all-jobs.csv'),toCsv(report.rows));
 fs.writeFileSync(path.join(target,'summary.json'),JSON.stringify({
   generatedAt:report.generatedAt,totalReviewed:report.totalReviewed,
   metrics:report.metrics,byCompany:report.byCompany,regression:report.regression
 },null,2)+'\n');
 process.stdout.write(JSON.stringify({totalReviewed:report.totalReviewed,
   metrics:report.metrics,regression:report.regression},null,2)+'\n');
 if(report.metrics.searchUnreachable||report.metrics.matchExplanationDisagreement||
    report.regression.deloitteGIUSearchable<1||report.metrics.invalidApplyLinks)
   process.exitCode=1;
}
module.exports={auditCatalog,toCsv};
