'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const main=fs.readFileSync('dist/index.html','utf8');
const source=fs.readFileSync('dist/assets/secretj-landing.js','utf8');
const style=fs.readFileSync('dist/assets/secretj-landing.css','utf8');
function landing(data={}){
  let output=null;
  const sandbox={window:{},Date};
  vm.runInNewContext(source,sandbox,{filename:'secretj-landing.js'});
  assert.equal(typeof sandbox.window.SecretJLanding.render,'function');
  output=sandbox.window.SecretJLanding.render({
    sources:data.sources||[],jobs:data.jobs||[],member:data.member||null,
    titleOf:j=>j.title,companyOf:j=>j.company,locationOf:j=>j.location,
    jobURL:j=>j.url
  });
  return output;
}
test('approved V2 brand hierarchy, editorial layout and real LinkedIn footer',()=>{
 const html=landing();
 assert.match(html,/YOUR CAREER\./);
 assert.match(html,/Meet our products/);
 assert.match(html,/Job Hunter · Live/);
 assert.match(html,/Botfolio · Coming Soon/);
 assert.match(html,/WHO WE ARE/);
 assert.match(html,/How It Works/);
 assert.match(html,/https:\/\/www\.linkedin\.com\/company\/secretj\/home\//);
 assert.match(html,/<footer class="sj-land-footer"/);
 assert.match(style,/--sj-paper:#fff/);
 assert.match(style,/--sj-text:#111/);
 assert.doesNotMatch(html,/#ffd|yellow/i);
});
test('guest gets top-right login and signup while logged-in member sees account',()=>{
 const guest=landing();
 assert.match(guest,/\/account\.html\?mode=login&amp;after=home|\/account\.html\?mode=login&after=home/);
 assert.match(guest,/\/account\.html\?mode=register&after=home/);
 const member=landing({member:{id:'test-user'}});
 assert.match(member,/\/account\.html\?view=overview/);
 assert.doesNotMatch(member,/href="\/account\.html\?mode=register/);
});
test('job previews are actual supplied jobs and external employers use safe links',()=>{
 const html=landing({jobs:[{
   title:'Software Engineer Intern',company:'Blink22',location:'Cairo, Egypt',
   url:'https://apply.workable.com/blink22-3/j/123/'
 }]});
 assert.match(html,/Software Engineer Intern/);
 assert.match(html,/Blink22/);
 assert.match(html,/apply\.workable\.com\/blink22-3\/j\/123/);
 assert.doesNotMatch(html,/EXAMPLE CARD|Company name ·/);
});
test('malicious employer content is escaped and cannot inject markup',()=>{
 const html=landing({sources:[{name:'<img src=x onerror=alert(1)>'}],
 jobs:[{title:'<script>alert(1)</script>',company:'Demo',location:'Cairo',
 url:'https://example.com/a?q=" onclick="alert(1)'}]});
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.doesNotMatch(html,/<img src=x onerror=/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/onclick="alert\(1\)"/);
});
test('job feed, company list and homepage search link to working workspace',()=>{
 const html=landing({sources:[{name:'Blink22'}]});
 assert.match(html,/data-navigate="jobs"/);
 assert.match(html,/data-navigate="companies"/);
 assert.match(html,/id="sj-home-search"/);
 assert.match(main,/state\.query=String\(new FormData\(event\.target\)\.get\('q'\)/);
 assert.match(main,/go\('jobs'\);return/);
 assert.match(main,/const latest=allPublicJobs\(\)\.slice\(\)/);
 assert.doesNotMatch(source,/secretj-job-preferences|matchingEngine|qualification_status/);
});
test('new landing theme applies only to home and mobile menu is accessible',()=>{
 assert.match(main,/document\.body\?\.classList\?\.toggle\('sj-editorial-home',state\.page==='home'\)/);
 assert.match(style,/body\.sj-editorial-home \.sidebar/);
 assert.match(style,/body\.sj-editorial-home \.topbar/);
 assert.match(style,/@media\(max-width:760px\)/);
 assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(landing(),/aria-expanded="false"/);
 assert.match(main,/setAttribute\('aria-expanded',String\(!open\)\)/);
});

test('global workspace theme does not flatten editorial landing backgrounds or hover styles',()=>{
 const theme=fs.readFileSync('dist/assets/secretj-global-theme.css','utf8');
 assert.match(theme,/body \*:not\(img\)[^\n]*:not\(:where\(\.sj-landing \*\)\)/);
 assert.match(theme,/body :is\(button,a,input,textarea,select,summary,\[role="button"\]\):not\(:where\(\.sj-landing \*\)\)/);
 assert.match(theme,/body \[aria-selected="true"\]:not\(:where\(\.sj-landing \*\)\)/);
 assert.match(style,/\.sj-land-hero\{background:var\(--sj-warm\)/);
 assert.match(style,/\.sj-land-dark\{background:var\(--sj-dark\)/);
});

test('desktop editorial menu is horizontal and legacy sidebar button widths cannot stack it',()=>{
 assert.match(style,/\.sj-landing \.sj-land-links\{display:flex;flex-direction:row;flex-wrap:nowrap;/);
 assert.match(style,/\.sj-landing \.sj-land-links :is\(a,button\)\{display:inline-flex;width:auto;flex:0 0 auto;/);
 assert.match(style,/@media\(max-width:900px\)[\s\S]*?\.sj-landing \.sj-land-links\{display:none;[^\n]*flex-direction:column/);
});
