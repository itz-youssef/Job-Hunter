const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('dist/index.html','utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';

test('browser JavaScript compiles',()=>assert.doesNotThrow(()=>new Function(js)));
test('CV stays on page through a modal PDF viewer and local DOCX text preview',()=>{
  assert.match(html,/id="cv-preview-dialog"/);
  assert.match(html,/data-cv-preview/);
  assert.match(js,/function openCvPreview\(\)/);
  assert.match(js,/function extractDocxText\(blob\)/);
  assert.match(js,/URL\.createObjectURL\(cvEntry\.blob\)/);
  assert.match(js,/cvPreviewBlobUrl=null/);
  assert.match(js,/new DOMParser\(\)/);
  const i=js.indexOf('async function extractDocxText');
  const j=js.indexOf('async function refreshCv',i);
  const section=js.slice(i,j);
  assert.ok(!section.includes('fetch('),'Preview must not upload CV');
});
test('job cards share company branding and editable overrides',()=>{
  assert.match(js,/function brandForJob\(j\)/);
  assert.match(js,/function jobCard\(j\)/);
  assert.match(js,/class="job-card-top">\$\{brandForJob\(j\)\}/);
  assert.match(js,/function companyBrand\(c\)/);
});
test('search has date, company, sorting, type and reset controls',()=>{
  for(const control of ['company-filter','date-filter','date-basis','sort-filter','type-filter','role-filter','job-search','data-reset-filters'])
    assert.ok(html.includes(control),control);
  assert.match(js,/function filterJobs\(list\)/);
  assert.match(js,/firstSeenDate\(j\)/);
});
test('mobile layout reflows to narrow screens',()=>{
  assert.match(html,/@media\(max-width:590px\)/);
  assert.match(html,/@media\(max-width:370px\)/);
  assert.match(html,/@media\(max-width:430px\)/);
});
