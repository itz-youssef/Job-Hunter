'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('dist/assets/secretj-landing.css','utf8');
const js=fs.readFileSync('dist/assets/secretj-landing.js','utf8');
const html=fs.readFileSync('dist/index.html','utf8');
const glow=css.slice(css.lastIndexOf('/* Secret J header Sign Up:'));
test('Signup remains an actual registration link and glow is scoped to it',()=>{
 assert.match(js,/class="sj-land-btn dark sj-land-signup" href="\/account\.html\?mode=register&after=home"/);
 assert.match(glow,/\.sj-landing \.sj-land-account \.sj-land-signup/);
 assert.doesNotMatch(glow,/\.sj-land-hero\{|#companies\{|\.sj-land-company\{/);
});
test('light and dark signup glow have hover shine, focus and motion-safety',()=>{
 assert.match(glow,/animation:sj-signup-aura/);
 assert.match(glow,/::after/);
 assert.match(glow,/box-shadow:/);
 assert.match(glow,/html\[data-theme="dark"\]/);
 assert.match(glow,/:focus-visible/);
 assert.match(glow,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(html,/secretj-landing\.css\?v=oxblood-leather-open-glow-20261124/);
});
