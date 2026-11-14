const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('dist/index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('dashboard JavaScript compiles',()=>assert.doesNotThrow(()=>new Function(script)));
test('lazy company logos remain paintable and have fallback',()=>{
  assert.match(html,/\.company-brand img\{[^}]*display:block;opacity:0/);
  assert.match(html,/\.company-brand img\.brand-loaded\{[^}]*opacity:1/);
  assert.match(html,/brand-monogram/);
  assert.match(html,/data-edit-logo=/);
});
test('CV Holder in navigation and content routing',()=>{
  assert.match(html,/data-page="cv"/);
  assert.match(script,/cv:'CV Holder'/);
  assert.match(script,/state\.page==='cv'\?cvPage\(\)/);
  assert.match(script,/function acceptCV\(file\)/);
  assert.match(script,/function cvAction\(mode,payload\)/);
  assert.match(script,/indexedDB\.open\(CV_DB,1\)/);
  assert.match(script,/new Blob|blob:file/);
  assert.match(script,/data-cv-remove/);
  assert.match(script,/data-cv-download/);
});
test('local CV handling stays browser-local unless private backup is explicitly requested',()=>{
  const local=script.slice(script.indexOf('// CV files never leave'),script.indexOf('  function legacyProfilePage()'));
  assert.ok(!local.includes('fetch('),'Local CV storage must not send data over the network');
  assert.ok(!local.includes('XMLHttpRequest'));
  const save=script.slice(script.indexOf('async function acceptCV(file)'),script.indexOf('  function resumePage()'));
  assert.match(save,/10\*1024\*1024/);
  assert.match(save,/cvAction\('save',item\)/);
  assert.match(script,/async function profileCloud\(method,kind,payload,token\)/);
});
test('email test has an actual workflow',()=>{
  const workflow=fs.readFileSync('.github/workflows/test-email.yml','utf8');
  assert.match(workflow,/workflow_dispatch/);
  assert.doesNotMatch(workflow,/smtplib/);
  assert.doesNotMatch(workflow,/secrets\.SMTP_PASSWORD/);
  assert.match(html,/actions\/workflows\/test-email\.yml/);
});
