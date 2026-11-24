'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8');
const functions=html.slice(html.indexOf('  function vacancyFingerprint(j){'),html.indexOf('  function validJobs(){'));
function count(rows){
  const ctx={URL,companyOf:j=>j.company,titleOf:j=>j.title,locationOf:j=>j.location,
    jobURL:j=>j.url,publicJob:j=>!!j.title&&!!j.url,jobs:()=>rows,
    state:{snapshot:{jobs:rows}},dedupSnapshot:null,dedupPublic:null};
  vm.createContext(ctx);
  return vm.runInContext(functions+'\nallPublicJobs().length',ctx);
}
test('IBM distinct requisitions remain visible even when all advert text is identical',()=>{
  const job={company:'IBM',title:'Data Engineer',location:'Giza, EG',
    description:'Identical vacancy text '.repeat(20)};
  const a={...job,id:'custom-ibm-123',url:'https://careers.ibm.com/careers/JobDetail?jobId=123'};
  const b={...job,id:'custom-ibm-456',url:'https://careers.ibm.com/careers/JobDetail?jobId=456'};
  const same={...a,url:a.url+'&source=tracking'};
  assert.equal(count([a,b,same,a]),2);
  assert.equal(count([{...a,id:''},{...b,id:''}]),2);
});
test('unrelated companies retain existing advert fingerprint behavior',()=>{
  const a={company:'Another company',title:'Engineer',location:'Egypt',
    description:'Identical vacancy text '.repeat(20),url:'https://example.com/1'};
  assert.equal(count([a,{...a,url:'https://example.com/2'}]),1);
});
test('all unique IBM requisitions in the real published catalog remain visible',()=>{
  const snapshot=JSON.parse(fs.readFileSync('dist/data.json','utf8'));
  const rows=snapshot.jobs.filter(j=>j.company==='IBM'&&j.url&&j.title);
  const unique=new Set(rows.map(j=>String(j.id||'').match(/^custom-ibm-([a-z0-9_-]+)$/i)?.[1]||new URL(j.url).searchParams.get('jobId')||j.url));
  assert.equal(count(rows),unique.size);
  console.log('IBM published rows:',rows.length,'unique requisitions:',unique.size,'visible:',count(rows));
});
