'use strict';
const test=require('node:test');
const fs=require('node:fs');
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
