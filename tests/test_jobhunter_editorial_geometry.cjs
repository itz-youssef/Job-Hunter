'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('dist/assets/secretj-jobhunter-intro.css','utf8');
const html=fs.readFileSync('dist/index.html','utf8');
const script=fs.readFileSync('dist/assets/secretj-jobhunter-intro.js','utf8');
const latest=css.slice(css.lastIndexOf('/* Job Hunter editorial architecture'));
test('Job Hunter has its own soft architecture in light and dark, not photos or brutalism',()=>{
 assert.match(latest,/jobhunter-editorial-geometry-light\.svg/);
 assert.match(latest,/jobhunter-editorial-geometry-dark\.svg/);
 assert.match(css,/images\.unsplash\.com\/photo-1762344677875-33739bc5d40d/);
 for(const mode of ['light','dark']){
  const svg=fs.readFileSync('dist/assets/jobhunter-editorial-geometry-'+mode+'.svg','utf8');
  assert.match(svg,/<svg[^>]+viewBox="0 0 2200 780"/);
  assert.match(svg,/<\/svg>/);
  assert.match(svg,/Smooth flowing architectural ceiling/);
  assert.doesNotMatch(svg,/<image|href=|LESS SEARCHING|Find what fits you/);
 }
});
test('Hero layout stays interactive and decorations remain nonblocking',()=>{
 assert.match(latest,/pointer-events:none/);
 assert.match(latest,/\.jh-intro-hero-grid\{position:relative;z-index:1\}/);
 assert.match(script,/data-navigate="jobs"/);
 assert.match(script,/data-home-scroll="how"/);
 assert.match(script,/class="jh-intro-preview"/);
 assert.match(html,/secretj-jobhunter-intro\.css\?v=soft-concrete-curves-20261124/);
});
test('Mobile and tablet still reveal architectural shapes in both themes',()=>{
 assert.match(latest,/@media\(max-width:1050px\)/);
 assert.match(latest,/@media\(max-width:760px\)/);
 assert.match(latest,/background-size:auto 100%/);
 assert.match(latest,/html\[data-theme="dark"\]/);
});
