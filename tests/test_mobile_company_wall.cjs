'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('dist/assets/secretj-landing.js','utf8');
const css=fs.readFileSync('dist/assets/secretj-landing.css','utf8');
const index=fs.readFileSync('dist/index.html','utf8');
test('all ten employer names remain in mobile decorative bands',()=>{
 for(const name of ['Microsoft','IBM','aws','EY','Nestlé','Deloitte.','pwc','Schneider Electric','Uber','Coca-Cola'])
  assert.ok(js.includes('>'+name+'</span>'),'Missing mobile decorative employer '+name);
 assert.match(js,/sj-land-mobile-company-wall-top/);
 assert.match(js,/sj-land-mobile-company-wall-bottom/);
 assert.match(js,/aria-hidden="true"/);
});
test('mobile logo bands are visible but desktop design stays unchanged',()=>{
 assert.match(css,/\.sj-landing #companies \.sj-land-mobile-company-wall\{display:none\}/);
 assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.sj-landing #companies \.sj-land-mobile-company-wall\{[\s\S]*?display:flex/);
 assert.match(css,/html\[data-theme="dark"\] \.sj-landing #companies \.sj-land-wall-brand/);
 assert.match(css,/pointer-events:none/);
 assert.match(index,/secretj-landing\.css\?v=oxblood-leather-open-glow-20261124/);
 assert.match(index,/secretj-landing\.js\?v=botfolio-beta-20261125/);
});
