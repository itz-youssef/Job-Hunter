'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('dist/assets/secretj-landing.js','utf8');
const css=fs.readFileSync('dist/assets/secretj-landing.css','utf8');
const index=fs.readFileSync('dist/index.html','utf8');
const sandbox={window:{},document:{}};
vm.runInNewContext(js,sandbox);
const html=sandbox.window.SecretJLanding.render({sources:[],jobs:[]});
const products=html.slice(html.indexOf('<section class="sj-land-section" id="products">'),html.indexOf('<section class="sj-land-section sj-land-alt" id="companies">'));
test('live Job Hunter has Explore and direct Open Job Hunter actions side by side',()=>{
 assert.match(products,/class="sj-land-product-actions"/);
 assert.match(products,/data-navigate="hunter" class="sj-land-btn dark">Explore Job Hunter/);
 assert.match(products,/data-navigate="jobs" class="sj-land-btn sj-land-product-open">Open Job Hunter/);
});
test('Botfolio beta links to its isolated product',()=>{
 const botfolio=products.slice(products.indexOf('<article class="sj-land-product pending">'));
 assert.match(botfolio,/BETA/);
 assert.match(botfolio,/href="\/botfolio.html" class="sj-land-btn sj-land-product-open">Open Botfolio/);
});
test('burgundy light and gold dark glows plus disabled and reduced-motion states',()=>{
 const styles=css.slice(css.lastIndexOf('/* Meet Our Products: distinct open-product CTAs'));
 assert.match(styles,/background:#412c34/);
 assert.match(styles,/background:#d3a644/);
 assert.match(styles,/box-shadow:/);
 assert.match(styles,/:disabled/);
 assert.match(styles,/pointer-events:none/);
 assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(index,/secretj-landing\.css\?v=oxblood-leather-open-glow-20261124/);
 assert.match(index,/secretj-landing\.js\?v=botfolio-beta-20261125/);
});
