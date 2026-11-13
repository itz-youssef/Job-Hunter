const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const start=js.indexOf('  // Estimated UTC cron slots');
const end=js.indexOf('  function companyCard(c){',start);
assert(start>=0&&end>start,'Expected scheduling UI implementation');
const ctx={Date,Intl,Number,esc:x=>x};
vm.createContext(ctx);
vm.runInContext(js.slice(start,end)+';this.nextExpectedCheck=nextExpectedCheck;this.expectedCheckLabel=expectedCheckLabel;',ctx);
const iso=(company,when)=>ctx.nextExpectedCheck(company,Date.parse(when))?.toISOString();
test('main built-in company uses 03,18,33,48 UTC',()=>{
  assert.equal(iso({managed:false,active:true},'2026-11-13T00:01:00Z'),'2026-11-13T00:03:00.000Z');
  assert.equal(iso({managed:false,active:true},'2026-11-13T00:48:10Z'),'2026-11-13T01:03:00.000Z');
});
test('custom company uses 10,25,40,55 UTC',()=>{
  assert.equal(iso({managed:true},'2026-11-13T00:18:00Z'),'2026-11-13T00:25:00.000Z');
  assert.equal(iso({managed:true},'2026-11-13T00:55:00Z'),'2026-11-13T01:10:00.000Z');
});
test('Siemens scanned on both channels uses earliest expected check',()=>{
  assert.equal(iso({managed:true,alsoMain:true},'2026-11-13T00:18:00Z'),'2026-11-13T00:25:00.000Z');
  assert.equal(iso({managed:true,alsoMain:true},'2026-11-13T00:25:00Z'),'2026-11-13T00:33:00.000Z');
});
test('company card displays approximate timing in local browser timezone',()=>{
  assert.match(html,/\$\{expectedCheckLabel\(c\)\}/);
  assert.match(html,/Next scheduled/);
  assert.match(html,/Last scan overdue/);
  assert.match(html,/Not currently scheduled/);
  assert.match(html,/last:s\.last_check \|\|/);
});
