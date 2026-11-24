'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
const page=fs.readFileSync('dist/index.html','utf8');
const hero=fs.readFileSync('dist/assets/secretj-jobhunter-intro.js','utf8');
test('minimal-concrete photo is rendered rather than vector artwork',()=>{
 const rules=css.slice(css.lastIndexOf('/* Minimal Concrete Geometry'));
 assert.match(rules,/images\.unsplash\.com\/photo-1760284739389-8a833519d6a5/);
 assert.match(rules,/grayscale\(1\)/);
 assert.doesNotMatch(rules,/jobhunter-brutalism-light\.svg/);
 assert.match(rules,/background-size:cover/);
 assert.match(rules,/pointer-events:none/);
});
test('photographic hero has explicit dark and mobile designs and keeps live UI',()=>{
 const rules=css.slice(css.lastIndexOf('/* Minimal Concrete Geometry'));
 assert.match(rules,/html\[data-theme="dark"\] \.jh-intro \.jh-intro-hero::before/);
 assert.match(rules,/@media\(max-width:1050px\)/);
 assert.match(rules,/@media\(max-width:760px\)/);
 assert.match(rules,/\.jh-intro-hero-grid\{position:relative;z-index:1\}/);
 assert.match(hero,/data-navigate="jobs"/);
 assert.match(hero,/data-home-scroll="how"/);
 assert.match(hero,/class="jh-intro-preview"/);
 assert.match(page,/secretj-jobhunter-intro\.css\?v=sharp-architectural-20261124/);
});
