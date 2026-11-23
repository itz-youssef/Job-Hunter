'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const landing=fs.readFileSync('dist/assets/secretj-landing.js','utf8');
const css=fs.readFileSync('dist/assets/secretj-landing.css','utf8');
const account=fs.readFileSync('dist/account.html','utf8');
const home=fs.readFileSync('dist/index.html','utf8');
test('products menu retains live product and disabled coming-soon item',()=>{
 assert.match(landing,/class="sj-land-products-menu"/);
 assert.match(landing,/data-navigate="hunter">Job Hunter/);
 assert.match(landing,/aria-disabled="true">Botfolio/);
});
test('landing avatar menu provides account sections and sign-out',()=>{
 assert.match(landing,/class="sj-land-profile-menu"/);
 assert.match(landing,/data-land-signout/);
 assert.match(home,/sj-header-logout/);
 assert.match(home,/closest\('\[data-land-signout\]'\)/);
});
test('account profile menu contains its original logout control',()=>{
 assert.match(account,/class="profile-dropdown-divider"/);
 assert.match(account,/id="logout" type="button" class="account-profile-signout"/);
 assert.match(account,/sj-linkedin-connect\{background:#0a66c2!important/);
});
test('brand LinkedIn CTA uses official blue and accessible white text',()=>{
 assert.match(landing,/sj-land-linkedin-cta/);
 assert.match(css,/sj-land-linkedin-cta:hover/);
 assert.match(css,/background:#0a66c2!important;color:#fff!important/);
});
