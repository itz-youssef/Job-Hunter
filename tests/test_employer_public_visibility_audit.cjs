'use strict';
const test=require('node:test');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8');
const snapshot=JSON.parse(fs.readFileSync('dist/data.json','utf8'));
const registry=JSON.parse(fs.readFileSync('companies.json','utf8'));
const functions=html.slice(html.indexOf('  function vacancyFingerprint(j){'),html.indexOf('  function validJobs(){'));
test('report all employer losses from public catalog rendering',()=>{
 const rows=snapshot.jobs;
 const ctx={URL,companyOf:j=>j.company,titleOf:j=>j.title,locationOf:j=>j.location,jobURL:j=>j.url||'#',publicJob:j=>!!j.title&&!!j.url,jobs:()=>rows,state:{snapshot:{jobs:rows}},dedupSnapshot:null,dedupPublic:null};
 vm.createContext(ctx);
 const visible=vm.runInContext(functions+'\nallPublicJobs()',ctx);
 const selected=new Set(visible);
 for(const c of registry){
   const companyRows=rows.filter(j=>j.company===c.name);
   const missing=companyRows.filter(j=>!selected.has(j));
   const fingerprint=vm.runInContext('vacancyFingerprint',ctx);
   const slim=j=>({id:j.id,external_id:j.external_id,title:j.title,url:j.url,location:j.location,source:j.source,source_id:j.source_id});
   console.log('UI_RECONCILE '+JSON.stringify({company:c.name,published:companyRows.length,visible:companyRows.length-missing.length,lost:missing.map(j=>({ ...slim(j), collisions:visible.filter(k=>k.url===j.url||(fingerprint(j)&&fingerprint(j)===fingerprint(k))).map(slim)}))}));
 }
});

test('separate authoritative ATS requisitions survive identical descriptions; tracking copies do not',()=>{
 const examples=[
  ['Amazon Egypt','https://www.amazon.jobs/en/jobs/123/title','https://www.amazon.jobs/en/jobs/456/title'],
  ['Schneider Electric','https://careers.se.com/jobs/123?lang=en-US','https://careers.se.com/jobs/456?lang=en-US'],
  ['Yassir','https://jobs.lever.co/Yassir/11111111-1111-1111-1111-111111111111','https://jobs.lever.co/Yassir/22222222-2222-2222-2222-222222222222'],
  ['Siemens','https://jobs.siemens.com/en_US/externaljobs/JobDetail/123','https://jobs.siemens.com/en_US/externaljobs/JobDetail/456'],
  ['Paymob','https://app.recruitera.ai/careers/paymob/sales-paymob-egypt-123','https://app.recruitera.ai/careers/paymob/sales-paymob-egypt-456']
 ];
 for(const [company,a,b] of examples){
   const base={company,title:'Example vacancy',location:'Egypt',description:'Identical text for separate requisitions. '.repeat(5)};
   const rows=[{...base,url:a},{...base,url:b},{...base,url:a+(a.includes('?')?'&':'?')+'utm_source=test'}];
   const ctx={URL,companyOf:j=>j.company,titleOf:j=>j.title,locationOf:j=>j.location,jobURL:j=>j.url,publicJob:()=>true,jobs:()=>rows,state:{snapshot:{jobs:rows}},dedupSnapshot:null,dedupPublic:null};
   vm.createContext(ctx);
   assert.equal(vm.runInContext(functions+'\nallPublicJobs().length',ctx),2,company);
 }
});
