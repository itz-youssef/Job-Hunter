'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const home = fs.readFileSync('dist/index.html','utf8');
const css = fs.readFileSync('dist/assets/secretj-home.css','utf8');
const header = fs.readFileSync('dist/assets/secretj-home.js','utf8');
const account = fs.readFileSync('dist/account.html','utf8');

test('the circular signed-in avatar is at the right edge of the shared toolbar',()=>{
  const topbar = home.split('<header class="topbar">')[1].split('</header>')[0];
  assert.ok(topbar.includes('id="sj-guest-actions"'));
  assert.ok(topbar.includes('id="sj-member-actions" hidden'));
  assert.ok(topbar.indexOf('id="sj-guest-actions"')>topbar.indexOf('id="refresh-button"'));
  assert.ok(topbar.indexOf('id="sj-member-actions"')>topbar.indexOf('id="refresh-button"'));
  assert.match(topbar,/sj-avatar-circle/);
  assert.match(topbar,/id="sj-profile-photo" alt="" hidden/);
  assert.match(topbar,/href="\/account\.html\?mode=login&after=home"/);
  assert.match(topbar,/href="\/account\.html\?mode=register&after=home"/);
});
test('both appearance modes have inverse card/text palette',()=>{
  assert.match(css,/--card-bg:#111111/);
  assert.match(css,/--card-ink:#ffffff/);
  assert.match(css,/html\[data-theme="dark"\]\{\s*--card-bg:#ffffff/);
  assert.match(css,/--card-ink:#111111/);
  for(const card of ['job-card','company-card','feature-card','panel','stat',
    'job-filter-panel','sj-about-card','sj-home-hero','sj-service-card','sj-product-card']){
    assert.ok(css.includes('.'+card),card);
  }
  assert.match(css,/background:var\(--card-bg\)!important/);
  assert.match(css,/color:var\(--card-ink\)!important/);
  assert.match(css,/\.job-details p/);
  assert.match(css,/\.search-box/);
  assert.match(css,/\.btn\.primary/);
  assert.match(account,/--account-card-bg:#111/);
  assert.match(account,/html\[data-theme="dark"\]\{[\s\S]*?--account-card-bg:#fff/);
  assert.match(account,/\.panel\{\s*background:var\(--account-card-bg\)/);
});
test('there is no Cloudflare-only bypass of account session discovery',()=>{
  assert.doesNotMatch(header,/location\.hostname\.endsWith\('\.workers\.dev'\)/);
  assert.match(header,/fetch\('\/api\/secretj-auth\?action=session'/);
  assert.match(header,/fetch\('\/api\/secretj-data\?scope=avatar'/);
  assert.match(header,/window\.addEventListener\('hashchange'/);
  assert.match(header,/user\.role !== 'admin'/);
  assert.doesNotMatch(header,/DATABASE_URL|postgresql:\/\/|password_hash/);
});

function domNode(id) {
  return {
    id, hidden: id === 'sj-member-actions' || id === 'sj-profile-photo' || id === 'sj-admin-link',
    textContent: '', open:false, disabled:false, src:'',
    children: [],listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn;},
    removeAttribute(name){delete this[name];}
  };
}
function harness(options) {
  const listeners={window:{},document:{}};
  const nodes=new Map();
  const get=id => {
    if(!nodes.has(id))nodes.set(id,domNode(id));
    return nodes.get(id);
  };
  const calls=[];
  const document={
    getElementById:get,
    addEventListener(type,fn){listeners.document[type]=fn;},
    visibilityState:'visible'
  };
  const window={
    location:{hostname:options.host,assign(target){calls.push('redirect:'+target);}},
    addEventListener(type,fn){listeners.window[type]=fn;}
  };
  const fetch=async(url,params)=>{
    calls.push(url);
    if(url.includes('action=session'))return {ok:true,json:async()=>({user:options.user||null})};
    if(url.includes('scope=avatar'))return {ok:true,json:async()=>({
      found: Boolean(options.avatar),
      file: options.avatar||null
    })};
    if(url.includes('action=logout'))return {ok:true,json:async()=>({ok:true})};
    throw Error('Unexpected API call '+url);
  };
  vm.runInNewContext(header,{document,window,location:window.location,fetch,alert(){}},
    {filename:'dist/assets/secretj-home.js'});
  return {get,calls,listeners};
}
async function flush(){for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));}
const login={id:'d1f0607e-5482-4e06-8f44-53697355ba11',
  email:'member@example.com',role:'member'};
test('Cloudflare signed-in session switches guest actions to the circular avatar',async()=>{
  const u=harness({host:'jobhunter-youssef.yoyoyasso19.workers.dev',user:login,
    avatar:{mime_type:'image/png',base64:'YWJj'}});
  await flush();
  assert.ok(u.calls.includes('/api/secretj-auth?action=session'));
  assert.ok(u.calls.includes('/api/secretj-data?scope=avatar'));
  assert.equal(u.get('sj-guest-actions').hidden,true);
  assert.equal(u.get('sj-member-actions').hidden,false);
  assert.equal(u.get('sj-admin-link').hidden,true);
  assert.equal(u.get('sj-profile-initial').hidden,true);
  assert.equal(u.get('sj-profile-photo').hidden,false);
  assert.equal(u.get('sj-profile-photo').src,'data:image/png;base64,YWJj');
  assert.equal(u.get('sj-member-email').textContent,login.email);
  u.listeners.window.hashchange();
  await flush();
  assert.ok(u.calls.filter(x=>x.includes('action=session')).length>=2);
});
test('Vercel uses the same logged-in menu; admin only for verified role',async()=>{
  const u=harness({host:'www.jobsnow.tech',user:{...login,role:'admin'}});
  await flush();
  assert.equal(u.get('sj-guest-actions').hidden,true);
  assert.equal(u.get('sj-member-actions').hidden,false);
  assert.equal(u.get('sj-admin-link').hidden,false);
  assert.equal(u.get('sj-profile-initial').hidden,false);
  assert.equal(u.get('sj-profile-initial').textContent,'ME');
});
test('guest sessions never show a private profile on either host',async()=>{
  for(const host of ['www.jobsnow.tech','jobhunter-youssef.yoyoyasso19.workers.dev']){
    const u=harness({host,user:null});
    await flush();
    assert.equal(u.get('sj-guest-actions').hidden,false);
    assert.equal(u.get('sj-member-actions').hidden,true);
    assert.ok(!u.calls.some(x=>x.includes('scope=avatar')));
  }
});
