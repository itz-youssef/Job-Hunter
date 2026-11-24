'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
const page=fs.readFileSync('dist/index.html','utf8');
const js=fs.readFileSync('dist/assets/secretj-jobhunter-intro.js','utf8');
const landingCss=fs.readFileSync('dist/assets/secretj-landing.css','utf8');
const rules=css.slice(css.lastIndexOf('/* White Sculptural Architecture'));
test('approved Zulfugar Karimov real photo is the final Job Hunter-only Hero artwork',()=>{
 assert.match(rules,/photo-1762344677875-33739bc5d40d/);
 assert.match(rules,/grayscale\(1\)/);
 assert.doesNotMatch(rules,/jobhunter-editorial-geometry|jobhunter-brutalism/);
 assert.match(rules,/background-size:cover/);
 assert.match(rules,/pointer-events:none/);
});
test('light/dark overlays and mobile framing preserve live UI',()=>{
 assert.match(rules,/html\[data-theme="dark"\] \.jh-intro \.jh-intro-hero::before/);
 assert.match(rules,/@media\(max-width:1050px\)/);
 assert.match(rules,/@media\(max-width:760px\)/);
 assert.match(rules,/\.jh-intro-hero-grid\{position:relative;z-index:1\}/);
 assert.match(page,/secretj-jobhunter-intro\.css\?v=white-sculptural-photo-20261124/);
 assert.match(js,/data-navigate="jobs"/);
 assert.match(js,/data-home-scroll="how"/);
 assert.match(js,/class="jh-intro-preview"/);
});
test('Secret J original home architecture/photo configuration is untouched',()=>{
 assert.match(landingCss,/photo-1749090445091-8420739fc992/);
 assert.doesNotMatch(landingCss,/photo-1762344677875-33739bc5d40d/);
});
