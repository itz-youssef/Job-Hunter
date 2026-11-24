'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const landing=fs.readFileSync('dist/assets/secretj-landing.css','utf8');
const intro=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
const responsive=fs.readFileSync('dist/assets/responsive.css','utf8');
const home=fs.readFileSync('dist/index.html','utf8');
test('mobile preserves signup, full nav and homepage sections',()=>{
 assert.match(landing,/\.sj-land-account \.sj-land-signup\{display:inline-flex\}/);
 assert.match(landing,/\.sj-land-links\.open\{max-height:/);
 for(const name of ['sj-land-product-grid','sj-land-companies','sj-land-jobs','sj-land-steps'])
   assert.ok(landing.includes(name),'missing responsive '+name);
});
test('abstract artwork remains present in both themes on mobile',()=>{
 assert.match(intro,/\.jh-intro \.jh-intro-hero::before\{opacity:\.92/);
 assert.match(intro,/html\[data-theme="dark"\] \.jh-intro \.jh-intro-hero::after/);
 assert.match(landing,/html\[data-theme="dark"\] \.sj-landing #companies::before/);
});
test('workspace preserves mobile profile and hero illustrations',()=>{
 assert.match(responsive,/\.sidebar \.profile,\.sidebar \.secondary-links,\.sidebar \.sidebar-bottom\{display:flex\}/);
 assert.match(responsive,/\.hero-graphic\{display:grid/);
 assert.match(responsive,/\.region-tag,\.top-avatar\{display:inline-flex\}/);
});
test('responsive stylesheet URLs are versioned for client reload',()=>{
 assert.match(home,/mobile-workspace-nav-20261124/);
});
