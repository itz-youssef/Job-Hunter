'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('dist/index.html','utf8');
const css=fs.readFileSync('dist/assets/responsive.css','utf8');
test('mobile workspace shortcuts expose Home, Job Hunter, Resume, CV and Profile visibly',()=>{
 const nav=html.slice(html.indexOf('<nav id="navigation"'),html.indexOf('</nav>',html.indexOf('<nav id="navigation"')));
 assert.match(nav,/class="sj-mobile-workspace-shortcuts"/);
 for(const p of ['home','hunter','resume','cv','profile'])assert.match(nav,new RegExp('data-page="'+p+'"'));
 assert.match(nav,/class="sj-mobile-job-tools"/);
 for(const p of ['jobs','saved','companies','alerts'])assert.match(nav,new RegExp('data-page="'+p+'"'));
 assert.match(css,/@media\(max-width:750px\)/);
 assert.match(css,/\.sidebar #navigation>\.sj-mobile-workspace-shortcuts\{\s*display:grid/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.sidebar #navigation>\.sj-mobile-job-tools\{\s*display:flex/);
 assert.match(css,/overflow-x:auto/);
});
test('preserve desktop navigation and existing route dispatch',()=>{
 assert.match(css,/\.sidebar #navigation>\.sj-mobile-workspace-shortcuts,\s*\.sidebar #navigation>\.sj-mobile-job-tools\{display:contents\}/);
 assert.match(html,/document\.querySelectorAll\('nav button\[data-page\]'\)/);
 assert.match(html,/responsive\.css\?v=mobile-workspace-nav-20261124/);
 assert.equal((html.match(/id="nav-job-count"/g)||[]).length,1);
});
