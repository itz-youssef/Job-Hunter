'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const home=fs.readFileSync('dist/index.html','utf8');
const parent=fs.readFileSync('dist/assets/secretj-landing.js','utf8');
const intro=fs.readFileSync('dist/assets/secretj-jobhunter-intro.js','utf8');
const styles=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
function render(data={}){
 const context={window:{},Date};
 vm.runInNewContext(intro,context,{filename:'secretj-jobhunter-intro.js'});
 return context.window.SecretJJobHunterIntro.render({
  jobs:data.jobs||[],member:data.member||null,
  titleOf:j=>j.title,companyOf:j=>j.company,locationOf:j=>j.location
 });
}
test('parent Secret J routes Job Hunter product card and footer to a product intro',()=>{
 assert.match(parent,/data-navigate="hunter" class="sj-land-btn dark">Explore Job Hunter/);
 assert.match(parent,/data-navigate="hunter">Job Hunter · Live/);
 assert.match(home,/hunter:'Job Hunter'/);
 assert.match(home,/data-page="hunter"/);
 assert.match(home,/state\.page==='hunter'\?jobHunterIntro\(\)/);
 assert.match(home,/state\.page==='home'\|\|state\.page==='hunter'/);
 assert.match(home,/secretj-jobhunter-intro\.js/);
 assert.match(home,/secretj-jobhunter-intro\.css/);
});
test('first visit makes features and a direct exit to existing public job feed obvious',()=>{
 const result=render();
 assert.match(result,/LESS SEARCHING/);
 assert.match(result,/You can browse jobs without an account/);
 assert.match(result,/Find jobs now ↗/);
 assert.match(result,/data-navigate="jobs"/);
 assert.match(result,/How it works/);
 assert.match(result,/Personalized opportunities/);
 assert.match(result,/Optional notifications/);
 assert.match(result,/Does Job Hunter apply on my behalf/);
 assert.match(result,/No\. Job Hunter helps/);
 assert.match(result,/aria-expanded="false"/);
 assert.match(result,/data-navigate="home"/);
 assert.match(result,/LinkedIn/);
});
test('signed-in account and visitor see appropriate next actions',()=>{
 const visitor=render();
 assert.match(visitor,/mode=register/);
 const member=render({member:{id:'u1'}});
 assert.match(member,/view=preferences/);
 assert.doesNotMatch(member,/mode=register/);
});
test('public live preview renders only supplied jobs, never fabricated postings',()=>{
 const job={title:'Software Engineer Intern',company:'Blink22',location:'Cairo, Egypt'};
 const html=render({jobs:[job]});
 assert.match(html,/Software Engineer Intern/);
 assert.match(html,/Blink22/);
 assert.match(html,/Cairo, Egypt/);
 assert.doesNotMatch(render(),/Software Engineer Intern/);
 assert.match(render(),/latest listings will appear/);
 assert.match(home,/const latest=allPublicJobs\(\)\.slice\(\)\.sort/);
});
test('source-derived job strings are escaped',()=>{
 const html=render({jobs:[{title:'<script>bad()</script>',company:'<img src=x>',location:'Cairo & Giza'}]});
 assert.doesNotMatch(html,/<script>bad/);
 assert.doesNotMatch(html,/<img src=x>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/Cairo &amp; Giza/);
});
test('landing remains mobile responsive without affecting the feed workspace',()=>{
 assert.match(styles,/\.jh-intro-hero-grid\{display:grid/);
 assert.match(styles,/@media\(max-width:760px\)/);
 assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(home,/state\.page==='jobs'\?jobsPage\(\)/);
 assert.match(home,/state\.page==='radar'\?radarHome\(\)/);
 assert.match(home,/state\.page==='home'\|\|state\.page==='hunter'/);
});
