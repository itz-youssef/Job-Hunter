'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const theme=read('dist/assets/secretj-global-theme.css');
const account=read('dist/account.html');
const home=read('dist/index.html');
const accountJs=read('dist/assets/secretj-account.js');
const homeJs=read('dist/assets/secretj-home.js');

test('role-specific navigation is hidden before session discovery, on both pages',()=>{
  assert.match(home, /id="sj-admin-link"[^>]*hidden/);
  assert.match(account,/id="account-admin-profile-link"[^>]*hidden/);
  assert.match(account,/id="admin-nav"[^>]*hidden/);
  assert.match(theme,/body :is\(#sj-admin-link,#account-admin-profile-link,#admin-nav\)\[hidden\]\s*\{\s*display:none!important/);
});

test('only a verified server session with admin role reveals admin links',()=>{
  assert.match(homeJs,/admin\.hidden = user\.role !== 'admin'/);
  assert.match(accountJs,/account-admin-profile-link'\)\.hidden=user\.role!=='admin'/);
  assert.match(accountJs,/admin-nav'\)\.hidden=user\.role!=='admin'/);
  assert.match(homeJs,/if \(admin\) admin\.hidden = true/);
  assert.match(accountJs,/\$\('#admin-nav'\)\.hidden=true/);
  assert.match(accountJs,/\$\('#account-admin-profile-link'\)\.hidden=true/);
});

test('manual admin deep links return ordinary members to the overview safely',()=>{
  assert.match(accountJs,/if\(view==='admin' && state\.user\?\.role!=='admin'\)view='overview'/);
  assert.match(read('lib/secretj/core.js'),/if \(user\.role !== 'admin'\) throw fail\(403/);
});

test('brand link remains clickable, without white hover inversion or underline',()=>{
  assert.match(home,/<a class="brand" href="#home"/);
  assert.match(account,/<a class="brand" href="\/"/);
  assert.match(theme,/body a\.brand\[href\]:is\(:hover,:focus-visible,:active\)/);
  assert.match(theme,/background-color:transparent!important/);
  assert.match(theme,/text-decoration:none!important/);
  assert.match(theme,/outline:2px solid var\(--mono-fg\)!important/);
  assert.doesNotMatch(theme,/pointer-events:none/);
});
