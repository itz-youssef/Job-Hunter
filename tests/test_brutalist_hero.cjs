'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
const js=fs.readFileSync('dist/assets/secretj-jobhunter-intro.js','utf8');
const index=fs.readFileSync('dist/index.html','utf8');
test('both light and dark brute-concrete backgrounds are local, valid SVG artwork',()=>{
 for(const mode of ['light','dark']){
  const path='dist/assets/jobhunter-brutalism-'+mode+'.svg';
  const art=fs.readFileSync(path,'utf8');
  assert.match(art,/<svg[^>]+viewBox="0 0 2200 920"/);
  assert.match(art,/<\/svg>/);
  assert.match(art,/concrete|cantilever/i);
  assert.doesNotMatch(art,/JobHunter|LESS SEARCHING|Find what fits you/);
  assert.match(css,new RegExp('jobhunter-brutalism-'+mode+'\\.svg'));
 }
});
test('hero remains genuine interactive HTML and new style loads by versioned URL',()=>{
 assert.match(js,/class="jh-intro-hero"/);
 assert.match(js,/data-navigate="jobs"/);
 assert.match(js,/data-home-scroll="how"/);
 assert.match(js,/class="jh-intro-preview"/);
 assert.match(index,/secretj-jobhunter-intro\.css\?v=concrete-photo-20261124/);
});
test('brutalist artwork remains visible on stacked phone and tablet breakpoints',()=>{
 const final=css.slice(css.indexOf('/* Monochrome Brutalism'));
 assert.match(final,/@media\(max-width:1050px\)/);
 assert.match(final,/@media\(max-width:760px\)/);
 assert.match(final,/background-size:auto 100%/);
 assert.match(final,/pointer-events:none/);
 assert.match(final,/\.jh-intro-hero-grid\{position:relative;z-index:1\}/);
 assert.match(final,/html\[data-theme="dark"\] \.jh-intro \.jh-intro-hero::before/);
});
