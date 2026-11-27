'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const home=fs.readFileSync('dist/index.html','utf8');
const account=fs.readFileSync('dist/account.html','utf8');
const accountJS=fs.readFileSync('dist/assets/secretj-account.js','utf8');
const css=fs.readFileSync('dist/assets/secretj-loading.css','utf8');

test('both pages load a single shared loading stylesheet',()=>{
  for(const html of [home,account])assert.match(html,/secretj-loading\.css/);
  assert.match(css,/\.sj-skeleton-grid/);
  assert.match(css,/\.sj-skeleton-card/);
  assert.match(css,/\.sj-loading-ring/);
});
test('skeleton is only active during a real feed fetch or account hydration',()=>{
  assert.match(home,/function loadingSkeleton\(/);
  assert.match(home,/if\(!saved&&state\.memberLoading&&state\.companyFilter==='all'\)/);
  assert.match(home,/state\.watchFeedLoading&&!state\.watchFeedLoaded/);
  assert.match(home,/state\.watchFeedLoading=false;/);
  assert.match(home,/watchFeedPendingSince/);
  assert.match(home,/role="status" aria-live="polite" aria-busy="true"/);
});
test('background refresh keeps matching jobs visible and restores state after errors',()=>{
  assert.match(home,/state\.watchFeedLoading=true;/);
  assert.match(home,/finally\{\s*state\.watchFeedLoading=false;/);
  assert.match(home,/Refreshing your matching jobs/);
  assert.match(home,/return state\.watchFeedLoaded\?state\.watchFeed\.filter\(publicJob\):\[\]/);
});
test('profile and account sections expose skeletons rather than loading text',()=>{
  assert.match(home,/Loading your profile/);
  assert.match(accountJS,/function loadingCards\(/);
  assert.match(accountJS,/root\.innerHTML=loadingCards\(/);
  assert.match(accountJS,/root\.setAttribute\('aria-busy','true'\)/);
  assert.match(accountJS,/root\.removeAttribute\('aria-busy'\)/);
});
test('save, preferences, email and upload actions always clear progress',()=>{
  assert.match(account,/id="sj-account-progress"[^>]*role="status"/);
  assert.match(accountJS,/function busyButton\(/);
  assert.match(accountJS,/Saving preferences…/);
  assert.match(accountJS,/setAccountProgress\(true,/);
  assert.match(accountJS,/finally\{\s*busyButton\(button,false\);\s*setAccountProgress\(false\)/);
  assert.match(accountJS,/finally\{if\(tracked\)setAccountProgress\(false\)/);
  assert.match(css,/\.sj-loading-feedback\[hidden\]\{display:none!important\}/);
});
test('animations respect accessibility and mobile layout',()=>{
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css,/html\[data-theme="dark"\]/);
  assert.match(home,/aria-hidden="true"/);
});
test('loading UI never changes dictionary or preference matching modules',()=>{
  assert.doesNotMatch(css,/(?:jobs\.db|career_levels\s*=)/);
  assert.match(home,/\/api\/secretj-native-status\?action=feed&offset=/);
});

test('preference scan has bounded skeleton display and short readiness polling',()=>{
  assert.match(home,/Date\.now\(\)-state\.watchFeedPendingSince<45000/);
  assert.match(home,/Date\.now\(\)-state\.watchFeedPendingSince<90000/);
  assert.match(home,/refreshMatchingFeed\(\);\s*},5000\)/);
  assert.match(home,/state\.watchFeedPendingSince=feed\.ready===false/);
});

test('initial workspace loading and manual refresh have visible bounded progress',()=>{
 assert.match(home,/Preparing your workspace/);
 assert.match(home,/sj-loading-shell" role="status"/);
 assert.match(home,/id="refresh-button"/);
 assert.match(home,/button\.classList\.add\('sj-refresh-busy'\)/);
 assert.match(home,/await Promise\.allSettled\(\[refresh\(\),hydrateMember\(\)\]\)/);
 assert.match(home,/button\.classList\.remove\('sj-refresh-busy'\)/);
 assert.match(css,/sj-loading-ring/);
});

test('global loader starts before first paint and fails open without a minimum delay',()=>{
  const vm=require('node:vm');
  for(const html of [home,account,fs.readFileSync('dist/manage-companies.html','utf8')]){
    const script=html.match(/<script id="sj-startup-script">([\s\S]*?)<\/script>/);
    assert.ok(script);
    assert.ok(html.indexOf(script[0])<html.indexOf('<body>'));
    assert.match(html,/<body>\s*<div id="sj-startup-loader"[^>]*role="status"/);
    assert.match(html,/secretj-loading\.css\?v=operation-progress-20261127/);
    for(const theme of ['light','dark']){
      const attrs=new Set();let timer;let delay;let restored;let cleared=false;
      const root={dataset:{},setAttribute:name=>attrs.add(name),removeAttribute:name=>attrs.delete(name)};
      const window={addEventListener:(name,callback)=>{if(name==='pageshow')restored=callback;}};
      vm.runInNewContext(script[1],{document:{documentElement:root},window,
        localStorage:{getItem:()=>theme},matchMedia:()=>({matches:false}),
        setTimeout:(callback,ms)=>{timer=callback;delay=ms;return 1;},
        clearTimeout:()=>{cleared=true;}});
      assert.equal(root.dataset.theme,theme);
      assert.ok(attrs.has('data-sj-startup'));
      assert.equal(delay,2000);
      window.SecretJStartup.finish();
      assert.equal(attrs.has('data-sj-startup'),false);
      assert.ok(cleared);
      attrs.add('data-sj-startup');timer();
      assert.equal(attrs.has('data-sj-startup'),false);
      attrs.add('data-sj-startup');restored({persisted:true});
      assert.equal(attrs.has('data-sj-startup'),false);
    }
  }
  assert.match(css,/\.sj-startup-loader\{display:none\}/);
  assert.match(css,/html\[data-theme="dark"\]\[data-sj-startup\]/);
  assert.match(css,/prefers-reduced-motion:reduce\)\{\.sj-startup-ring\{animation:none\}/);
});
test('global startup overlay releases after initial UI hydration',()=>{
  assert.match(home,/Promise\.allSettled\(\[initialMember,initialCatalog\]\)\.then\(\(\)=>window\.SecretJStartup\?\.finish\(\)\)/);
  assert.match(accountJS,/showAuth\(\);\s*window\.SecretJStartup\?\.finish\(\)/);
  assert.match(accountJS,/finally\{window\.SecretJStartup\?\.finish\(\);\}/);
  const manage=fs.readFileSync('dist/manage-companies.html','utf8');
  assert.match(manage,/load\(\)\.finally\(\(\)=>window\.SecretJStartup\?\.finish\(\)\)/);
});

test('public route navigation reuses rendered landing nodes and avoids duplicate hash renders',()=>{
  assert.match(home,/const landingViews=new Map\(\)/);
  assert.match(home,/cached\?\.html===html&&renderedPage===state\.page/);
  assert.match(home,/root\.replaceChildren\(\.\.\.cached\.nodes\)/);
  assert.match(home,/if\(requested!==state\.page\)go\(requested\)/);
  assert.match(home,/const wasReady=memberHydrated/);
  assert.match(home,/if\(changed\)\{landingViews\.clear\(\);state\.memberLoading=true;/);
});
test('account tabs cache only successful current-user views and invalidate after mutations',()=>{
  assert.match(accountJS,/const ACCOUNT_VIEW_TTL_MS=120000/);
  assert.match(accountJS,/cached\.userId===userId&&Date\.now\(\)-cached\.at<ACCOUNT_VIEW_TTL_MS/);
  assert.match(accountJS,/reuse&&view!=='admin'\?accountViews\.get\(view\):null/);
  assert.match(accountJS,/showView\(button\.dataset\.view,\{reuse:true\}\)/);
  assert.match(accountJS,/if\(method!=='GET' && endpoint\.startsWith\('\/api\/secretj-'\)\) \{\s*invalidateAccountViews\(\)/);
  assert.match(accountJS,/function showAuth\(\) \{\s*invalidateAccountViews\(\)/);
  assert.match(accountJS,/generation===accountViewGeneration/);
  assert.match(accountJS,/if\(!current\(\)\)\{[\s\S]*?return showView\(view\);[\s\S]*?root\.innerHTML=target\.innerHTML/);
});

test('all interactive Secret J workspaces share nonblocking operation feedback',()=>{
 for(const path of ['dist/index.html','dist/account.html','dist/manage-companies.html','dist/botfolio.html','dist/botfolio-chat.html']){
  const html=fs.readFileSync(path,'utf8');
  assert.match(html,/secretj-progress\.js\?v=20261127/);
  assert.match(html,/secretj-loading\.css\?v=operation-progress-20261127/);
 }
 const bf=fs.readFileSync('dist/assets/botfolio.js','utf8');
 const chat=fs.readFileSync('dist/assets/botfolio-chat.js','utf8');
 assert.match(bf,/Creating your private draft/);
 assert.match(bf,/Reading your CV/);
 assert.match(bf,/finally\{finish\(\);actionBusy\(b,false\)/);
 assert.match(chat,/clearTimeout\(slow\);finish\(\);setBusy\(false\)/);
 assert.match(css,/\.sj-progress-compact \.sj-progress-rail\{display:none\}/);
 assert.match(css,/pointer-events:none/);
});
