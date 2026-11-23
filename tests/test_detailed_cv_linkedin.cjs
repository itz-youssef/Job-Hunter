'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const parser=require('../dist/assets/secretj-cv-parser.js');

test('CV parser preserves detailed section boundaries without inventing data',()=>{
 const cv=[
  'Mona Ahmed','Data Analyst','Cairo, Egypt',
  'SUMMARY','Data visualization and reporting.',
  'SKILLS','Python, SQL, Power BI',
  'WORK EXPERIENCE','Data Analyst Intern | Company A | 2025 - 2026',
  'Built reports for stakeholders.',
  'EDUCATION','BSc Computer Science | University A | 2025',
  'PROJECTS','Sales Dashboard | Power BI | Reporting project',
  'CERTIFICATIONS','SQL Certificate | Provider | 2025',
  'LANGUAGES','Arabic: Native','English: Fluent',
  'AWARDS','Analytics Competition Winner | 2024',
  'VOLUNTEERING','Student Mentor | Community group',
  'COURSES','Data Visualization Workshop | 2024',
  'PUBLICATIONS','Research Methods Article | 2024',
  'https://linkedin.com/in/mona-ahmed',
  'https://github.com/mona-ahmed'
 ].join('\n');
 const result=parser.parseText(cv);
 assert.match(result.skills,/Python/);
 assert.match(result.experience,/Company A/);
 assert.match(result.education,/University A/);
 for(const field of ['projects','certifications','languages','awards','volunteering','training','publications']){
  assert.equal(typeof result[field],'string','Missing '+field);
 }
 assert.match(result.projects,/Sales Dashboard/);
 assert.match(result.certifications,/SQL Certificate/);
 assert.match(result.languages,/English: Fluent/);
 assert.match(result.awards,/Analytics Competition/);
 assert.match(result.volunteering,/Student Mentor/);
 assert.match(result.training,/Visualization Workshop/);
 assert.match(result.publications,/Research Methods Article/);
 assert.doesNotMatch(result.experience,/Sales Dashboard/);
 assert.doesNotMatch(result.education,/SQL Certificate/);
});
test('parser does not hallucinate absent fields or accept image-only PDFs',()=>{
 const cv='Amina Hassan\nBusiness Analyst\nSUMMARY\nAn experienced analyst exploring roles in Egypt.\nSKILLS\nExcel and business reporting';
 const result=parser.parseText(cv);
 assert.equal(result.projects,undefined);
 assert.equal(result.certifications,undefined);
 assert.throws(()=>parser.parseText(''),/readable CV text/);
});
test('account UI supports LinkedIn activation and extended professional data',()=>{
 const ui=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 const api=fs.readFileSync('api/secretj-data.js','utf8');
 const migration=fs.readFileSync('database/migrations/012_professional_profile_details.sql','utf8');
 for(const field of ['projects','certifications','languages','awards','volunteering','training','publications']){
  assert.ok(ui.includes("formField('"+field+"'"),field+' field missing in UI');
  assert.match(api,new RegExp('\\b'+field+'\\b'));
  assert.match(migration,new RegExp('ADD COLUMN IF NOT EXISTS '+field+' TEXT'));
 }
 assert.match(ui,/sj-linkedin-connect/);
 assert.match(ui,/data-linkedin-disabled/);
 assert.match(ui,/CV/);
 assert.match(api,/prior\[0\]/);
});
