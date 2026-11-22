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
  assert.match(home,/if\(!saved&&state\.memberLoading\)/);
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
