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
 assert.match(main,/document\.body\?\.classList\?\.toggle\('sj-editorial-home',state\.page==='home'\|\|state\.page==='hunter'\)/);
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

test('landing appearance control delegates to shared persistent theme switch',()=>{
 const guest=landing();
 const member=landing({member:{id:'member'}});
 assert.match(guest,/data-home-theme-toggle/);
 assert.match(member,/data-home-theme-toggle/);
 assert.match(main,/event\.target\.closest\('\[data-home-theme-toggle\]'\)/);
 assert.match(main,/el\('#theme-toggle'\)\.click\(\)/);
 assert.match(main,/localStorage\.setItem\('jh-theme'/);
 assert.match(main,/if\(state\.page==='home'\|\|state\.page==='hunter'\)syncLandingTheme\(\)/);
 assert.match(style,/html\[data-theme="dark"\] \.sj-landing/);
});

test('landing sections follow the shared light and dark theme without fixed contrasting bands',()=>{
 const how=landing();
 assert.match(how,/class="sj-land-section sj-land-dark"/);
 assert.match(how,/class="sj-land-bottom-cta"/);
 assert.match(how,/class="sj-land-footer"/);
 assert.match(style,/--sj-dark:#f5f4f2/);
 assert.match(style,/html\[data-theme="dark"\] \.sj-landing\{[^\n]*--sj-dark:#151515/);
 assert.match(style,/\.sj-land-dark\{background:var\(--sj-dark\);color:var\(--sj-text\)/);
 assert.match(style,/\.sj-land-bottom-cta\{background:var\(--sj-warm\)/);
 assert.match(style,/\.sj-land-footer\{background:var\(--sj-paper\);color:var\(--sj-text\)/);
 assert.doesNotMatch(style,/\.sj-land-bottom-cta\{background:#eae9e7/);
 assert.doesNotMatch(style,/\.sj-land-footer\{background:#111/);
});

test('company and product pages share full-bleed navigation, theme and profile controls',()=>{
 const product=fs.readFileSync('dist/assets/secretj-jobhunter-intro.js','utf8');
 assert.match(style,/\.sj-landing \.sj-land-topline,\s*\.sj-landing \.sj-land-nav\{\s*width:100%;max-width:none/);
 assert.match(style,/\.sj-landing \.sj-land-nav\{\s*position:sticky;top:0/);
 assert.match(style,/\.sj-landing \.sj-land-section\{scroll-margin-top:94px/);
 assert.match(product,/data-home-theme-toggle/);
 assert.match(product,/sj-land-profile-link/);
 assert.match(product,/data-navigate="home"/);
 assert.match(product,/data-navigate="jobs"/);
 assert.match(main,/state\.page==='home'\|\|state\.page==='hunter'\)syncLandingTheme\(\)/);
 assert.match(main,/state\.page==='home'\|\|state\.page==='hunter'\)window\.SecretJLanding\?\.syncAvatar/);
});

test('company discovery displays distinct logo branding without repeating foreground employers in backdrop',()=>{
 const sources=['Siemens','Blink22','ITWorx','Sumerge','Thndr','VOIS','ADCB Egypt','Amazon Egypt'].map(name=>({name}));
 const html=landing({sources});
 for(const name of ['Siemens','Blink22','ITWorx','Sumerge','Thndr','VOIS','ADCB Egypt','Amazon Egypt']){
   assert.match(html,new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
 for(const brand of ['siemens','blink22','itworx','sumerge','thndr','vois','adcb','amazon'])
   assert.match(html,new RegExp('brand-'+brand));
 assert.match(style,/secretj-companies-mosaic\.svg/);
 assert.match(style,/brand-vois\{color:#ed1c24/);
 assert.match(main,/company-logos-20261123/);
});
