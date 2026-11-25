'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const landing=fs.readFileSync('dist/assets/secretj-landing.js','utf8');
const css=fs.readFileSync('dist/assets/secretj-landing.css','utf8');
const account=fs.readFileSync('dist/account.html','utf8');
const home=fs.readFileSync('dist/index.html','utf8');
test('products menu retains Job Hunter and links to Botfolio beta',()=>{
 assert.match(landing,/class="sj-land-products-menu"/);
 assert.match(landing,/class="sj-land-products-trigger" aria-haspopup="true"/);
 assert.doesNotMatch(landing,/sj-land-nav-chevron/);
 assert.match(landing,/data-navigate="hunter">Job Hunter/);
 assert.match(landing,/href="\/botfolio.html">Botfolio/);
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

test('product navigation is CSS-hover powered without requiring desktop clicks',()=>{
 assert.match(css,/\.sj-land-products-menu:hover>\.sj-land-products-dropdown/);
 assert.match(css,/\.sj-land-products-menu>\.sj-land-products-dropdown\{display:none/);
 assert.doesNotMatch(landing,/<summary>Our Products/);
 assert.match(home,/productsTrigger && matchMedia/);
});
