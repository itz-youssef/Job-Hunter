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
    sources:data.sources||[],jobs:data.jobs||[],member:data.member||null,catalogLoading:Boolean(data.catalogLoading),
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
 assert.match(html,/Botfolio · Beta/);
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
 assert.match(main,/\/assets\/secretj-landing\.js\?v=[\w-]+/);
});

test('footer is full width with accessible LinkedIn icon and one legal bar on landing',()=>{
 const html=landing();
 assert.match(html,/sj-land-footer-bottom/);
 assert.match(html,/sj-land-footer-legal/);
 assert.match(html,/sj-land-linkedin-icon/);
 assert.match(html,/aria-label="Secret J on LinkedIn/);
 assert.match(html,/linkedin\.com\/company\/secretj\/home/);
 assert.match(html,/Terms &amp; Conditions/);
 assert.match(html,/Privacy Policy/);
 assert.match(style,/body\.sj-editorial-home>\.sj-legal-footer\{display:none!important\}/);
 assert.match(style,/grid-template-columns:minmax\(270px,1\.7fr\)/);
});
test('dark companies section is layered and legible without changing light treatment',()=>{
 assert.match(style,/html\[data-theme="dark"\] \.sj-landing #companies::before/);
 assert.match(style,/html\[data-theme="dark"\] \.sj-landing #companies::after/);
 assert.match(style,/background:#1c2028/);
 assert.match(style,/background:rgba\(38,44,54,\.97\)/);
 assert.match(style,/brand-vois\{color:#ff646d/);
 assert.match(main,/\/assets\/secretj-landing\.js\?v=[\w-]+/);
});

test('approved dark wall uses monochrome black, soft logos and retains light mosaic',()=>{
 assert.match(style,/secretj-companies-dark\.svg/);
 assert.match(style,/background:#101010/);
 assert.match(style,/background:rgba\(23,23,23,\.96\)/);
 assert.match(style,/filter:none/);
 assert.match(style,/secretj-companies-mosaic\.svg/);
 assert.match(main,/\/assets\/secretj-landing\.js\?v=[\w-]+/);
 const darkAsset=fs.readFileSync('dist/assets/secretj-companies-dark.svg','utf8');
 for(const brand of ['Microsoft','IBM','aws','Deloitte','pwc','EY','Nestlé','Schneider','Uber','Coca-Cola']){
   assert.ok(darkAsset.includes(brand),'dark wall includes '+brand);
 }
 assert.doesNotMatch(darkAsset,/#1c2028|#303640|#242a33/);
});

test('how-it-works uses pinned career-note artwork for both themes without touching workspace',()=>{
 assert.match(style,/\.sj-landing #how::before/);
 assert.match(style,/secretj-how-notes-light\.svg/);
 assert.match(style,/secretj-how-notes-dark\.svg/);
 assert.match(style,/html\[data-theme="dark"\] \.sj-landing #how/);
 assert.match(style,/pointer-events:none/);
 assert.match(main,/\/assets\/secretj-landing\.js\?v=[\w-]+/);
 const light=fs.readFileSync('dist/assets/secretj-how-notes-light.svg','utf8');
 const dark=fs.readFileSync('dist/assets/secretj-how-notes-dark.svg','utf8');
 for(const asset of [light,dark]){
   assert.match(asset,/Career Plan/);
   assert.match(asset,/Reminders/);
   assert.match(asset,/Target Roles/);
   assert.match(asset,/Job Hunt/);
 }
 assert.match(landing(),/From searching to finding\./);
});

test('dark footer uses neutral black with no navy tint, keeping light theme untouched',()=>{
 assert.match(style,/html\[data-theme="dark"\] \.sj-landing \.sj-land-footer\{background:#0b0b0b;border-color:#303030\}/);
 assert.match(style,/html\[data-theme="dark"\] \.sj-landing \.sj-land-linkedin-icon\{background:#181818;border-color:#4a4a4a;color:#f5f5f5\}/);
 assert.doesNotMatch(style,/\.sj-land-footer\{background:#12151b/);
 assert.match(main,/\/assets\/secretj-landing\.js\?v=[\w-]+/);
});

test('Job Hunter product hero has separate safe editorial note backgrounds for both modes',()=>{
 const product=fs.readFileSync('dist/assets/secretj-jobhunter-intro.js','utf8');
 const css=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
 const light=fs.readFileSync('dist/assets/secretj-jobhunter-hero-light.svg','utf8');
 const dark=fs.readFileSync('dist/assets/secretj-jobhunter-hero-dark.svg','utf8');
 assert.match(css,/secretj-jobhunter-hero-light\.svg/);
 assert.match(css,/secretj-jobhunter-hero-dark\.svg/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/html\[data-theme="dark"\] \.jh-intro \.jh-intro-hero/);
 assert.match(main,/\/assets\/secretj-jobhunter-intro\.css\?v=[\w-]+/);
 for(const a of [light,dark]){
   assert.match(a,/Job Goals/);
   assert.match(a,/Find the right role/);
   assert.match(a,/(Applications|Apply for jobs)/);
   assert.match(a,/<svg/);
 }
 assert.match(product,/LESS SEARCHING\./);
 assert.match(product,/data-navigate="jobs"/);
 assert.match(product,/data-home-scroll="how"/);
});

test('product intro keeps stationery at edges and removes repeated notes from its steps',()=>{
 const css=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
 assert.match(css,/\.jh-intro \.jh-intro-hero::before\{/);
 assert.match(css,/mask-image:linear-gradient/);
 assert.match(css,/\.jh-intro #how::before\{content:none!important/);
 assert.match(css,/\.jh-intro #how::after\{content:none!important/);
 assert.match(css,/html\[data-theme="dark"\] \.jh-intro #how\{/);
 assert.match(css,/background:#0c0c0c/);
 assert.match(main,/\/assets\/secretj-jobhunter-intro\.css\?v=[\w-]+/);
});

test('Job Hunter hero uses local monochrome architectural shadow artwork in both themes',()=>{
 const css=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
 const block=css.slice(css.indexOf('/* Job Hunter — Abstract Light & Shadow.'));
 const light=fs.readFileSync('dist/assets/jobhunter-abstract-light.svg','utf8');
 const dark=fs.readFileSync('dist/assets/jobhunter-abstract-dark.svg','utf8');
 assert.match(block,/jobhunter-abstract-light\.svg/);
 assert.match(block,/jobhunter-abstract-dark\.svg/);
 assert.match(block,/html\[data-theme="dark"\] \.jh-intro \.jh-intro-hero::before/);
 assert.match(block,/pointer-events:none/);
 assert.match(block,/jobhunter-editorial-geometry-light\.svg/);
 assert.doesNotMatch(css.slice(css.indexOf('/* Job Hunter — Abstract Light & Shadow.'),css.indexOf('/* Monochrome Brutalism')),/sticky|stationery|saturate\(/);
 assert.match(main,/\/assets\/secretj-jobhunter-intro\.css\?v=[\w-]+/);
 for(const image of [light,dark]){
   assert.match(image,/<svg/);
   assert.match(image,/<linearGradient/);
   assert.match(image,/<!-- Soft architectural planes/);
   assert.ok(!image.includes('<image ') && !image.includes('xlink:href='), 'no remote or embedded image nodes');
 }
});

test('stronger shadow treatment remains neutral and keeps responsive text protection',()=>{
 const css=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
 const fineTune=css.slice(css.indexOf('/* Abstract Light & Shadow / visibility refinement.'));
 assert.match(fineTune,/filter:contrast\(1\.18\)/);
 assert.match(fineTune,/filter:contrast\(1\.24\) brightness\(1\.20\)/);
 assert.match(fineTune,/rgba\(246,246,244,\.31\)/);
 assert.match(fineTune,/rgba\(13,13,13,\.31\)/);
 assert.match(fineTune,/@media\(max-width:760px\)/);
 assert.match(main,/\/assets\/secretj-jobhunter-intro\.css\?v=[\w-]+/);
});

test('company catalog loads independently of slower status requests and shows skeletons',()=>{
 const initial=landing({sources:[],jobs:[],catalogLoading:true});
 assert.match(initial,/sj-land-company-skeleton/);
 assert.match(initial,/aria-busy="true"/);
 assert.doesNotMatch(initial,/Company records will appear after the next source update/);
 assert.equal((initial.match(/sj-land-company-skeleton"/g)||[]).length,8);
 const ready=landing({sources:[{name:'Siemens'}],jobs:[],catalogLoading:false});
 assert.match(ready,/Siemens/);
 assert.doesNotMatch(ready,/sj-land-company-skeleton/);
 assert.match(main,/publicCatalogLoading:true/);
 assert.match(main,/const catalogRequest=requests\[0\]\.then/);
 assert.match(main,/if\(state\.page==='home'\|\|state\.page==='hunter'\)render\(\)/);
 assert.match(main,/Promise\.allSettled\(\[catalogRequest,\.\.\.requests\.slice\(1\)\]\)/);
 assert.match(style,/sj-land-company-skeleton/);
 assert.match(style,/prefers-reduced-motion:reduce/);
 assert.match(main,/\/assets\/secretj-landing\.js\?v=[\w-]+/);
});

test('public and account copy does not expose database or hosting providers',()=>{
 const account=fs.readFileSync('dist/account.html','utf8');
 const accountUI=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 const privacy=fs.readFileSync('dist/privacy.html','utf8');
 const admin=fs.readFileSync('dist/assets/secretj-admin-console.js','utf8');
 assert.doesNotMatch(account,/Neon|PostgreSQL|public GitHub repository/i);
 assert.doesNotMatch(privacy,/Neon|PostgreSQL|Cloudflare|GitHub|Vercel/);
 assert.doesNotMatch(accountUI,/stored in Neon|saved to Neon|Neon is not connected|Vercel deployment|production Neon/i);
 assert.match(accountUI,/LinkedIn profile connected successfully\. Your account information is saved\./);
 assert.match(accountUI,/Sign up is temporarily unavailable\./);
 assert.match(account,/secretj-account\.js\?v=[\w-]+/);
 assert.match(admin,/does not expose passwords, session tokens, or private CV file contents/);
 assert.doesNotMatch(main,/GitHub watchlist could not be loaded|check Vercel deployment|Private GitHub sync/);
 assert.match(main,/The company list could not be loaded/);
 assert.match(privacy,/third-party infrastructure providers for hosting, data storage/);
});

test('Job Hunter FAQ and CTA get legible coordinated light/dark abstract decorations',()=>{
 const css=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
 const light=fs.readFileSync('dist/assets/jobhunter-faq-editorial-light.svg','utf8');
 const dark=fs.readFileSync('dist/assets/jobhunter-faq-editorial-dark.svg','utf8');
 const block=css.slice(css.indexOf('/* Editorial FAQ + closing CTA:'));
 assert.match(block,/jobhunter-faq-editorial-light\.svg/);
 assert.match(block,/jobhunter-faq-editorial-dark\.svg/);
 assert.match(block,/\.jh-intro #questions \.jh-intro-faq details p\{color:#484848\}/);
 assert.match(block,/html\[data-theme="dark"\] \.jh-intro #questions \.jh-intro-faq details p\{color:#d3d3d3\}/);
 assert.match(block,/pointer-events:none/);
 assert.match(block,/@media\(max-width:760px\)/);
 assert.match(main,/\/assets\/secretj-jobhunter-intro\.css\?v=[\w-]+/);
 assert.match(light,/<svg/);
 assert.match(dark,/<svg/);
 assert.match(light,/radialGradient/);
 assert.match(dark,/radialGradient/);
});
