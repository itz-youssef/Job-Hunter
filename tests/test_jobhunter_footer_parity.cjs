'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const landingJS=fs.readFileSync('dist/assets/secretj-landing.js','utf8');
const hunterJS=fs.readFileSync('dist/assets/secretj-jobhunter-intro.js','utf8');
const styles=fs.readFileSync('dist/assets/secretj-landing.css','utf8');
const index=fs.readFileSync('dist/index.html','utf8');
function footer(html){const start=html.indexOf('<footer class="sj-land-footer"');const end=html.indexOf('</footer>',start);assert.ok(start>=0&&end>start);return html.slice(start,end+9)}
function output(source,data){const context={window:{},document:{}};vm.runInNewContext(source,context);return source===hunterJS?context.window.SecretJJobHunterIntro.render(data):context.window.SecretJLanding.render(data)}
test('Job Hunter footer matches main home structure and column distribution',()=>{
 const home=footer(output(landingJS,{sources:[],jobs:[]}));
 const hunter=footer(output(hunterJS,{jobs:[],titleOf:j=>j.title,companyOf:j=>j.company,locationOf:j=>j.location}));
 const classes=['sj-land-footer-brand','sj-land-footer-links','sj-land-footer-social','sj-land-footer-bottom','sj-land-footer-legal','sj-land-linkedin-icon','sj-land-footer-tagline'];
 for(const cls of classes){assert.match(home,new RegExp(cls));assert.match(hunter,new RegExp(cls));}
 assert.equal((hunter.match(/class="sj-land-footer-links"/g)||[]).length,2);
 assert.equal((home.match(/class="sj-land-footer-links"/g)||[]).length,2);
 assert.match(hunter,/OUR PRODUCTS/);assert.match(hunter,/EXPLORE SECRET J/);assert.match(hunter,/CONNECT WITH US/);
 assert.match(hunter,/All rights reserved/);
 assert.match(hunter,/Terms &amp; Conditions/);assert.match(hunter,/Privacy Policy/);
});
test('all footer controls navigate safely on the Job Hunter page',()=>{
 const hunter=footer(output(hunterJS,{jobs:[]}));
 assert.match(hunter,/data-navigate="home">All Products/);
 assert.match(hunter,/data-navigate="home">About Us/);
 assert.match(hunter,/data-home-scroll="how">How Job Hunter Works/);
 assert.match(hunter,/data-navigate="jobs">Find Jobs/);
 assert.match(hunter,/data-navigate="companies">Explore Companies/);
 assert.match(hunter,/href="https:\/\/www\.linkedin\.com\/company\/secretj\/home\/"[^>]*rel="noopener noreferrer"/);
 assert.equal((hunter.match(/class="sj-land-footer-bottom/g)||[]).length,1);
});
test('both products use existing shared 4-column responsive footer CSS unchanged',()=>{
 assert.match(styles,/grid-template-columns:minmax\(270px,1\.7fr\) minmax\(180px,\.9fr\)/);
 assert.match(styles,/@media\(max-width:760px\)\{/);
 assert.match(styles,/\.sj-landing \.sj-land-footer-inner\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(index,/secretj-jobhunter-intro\.js\?v=footer-match-home-20261124/);
});
