'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('dist/index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function harness(){
  const controls=new Map();
  const control=q=>{if(!controls.has(q))controls.set(q,{innerHTML:'',textContent:'',hidden:true,classList:{toggle(){}}});return controls.get(q);};
  const model={user:{id:'user-one',email:'one@example.com',role:'member'},name:'Account One',cvName:'one.pdf',failProfile:false,failSession:false};
  const requests=[];
  const context={console,URL,Blob,Uint8Array,Date,Promise,setTimeout,clearTimeout,
    atob:x=>Buffer.from(x,'base64').toString('binary'),
    localStorage:{getItem(){return null;}},
    document:{readyState:'loading',addEventListener(){},querySelector:control},
    location:{hostname:'jobhunter-youssef.yoyoyasso19.workers.dev'},
    window:{},
    fetch:async(url,opts={})=>{
      requests.push({url,opts});let result;
      if(url.includes('action=session')){
        if(model.failSession)throw Error('Session unavailable');
        result={user:model.user};
      }else if(url.includes('scope=profile')){
        if(model.failProfile)throw Error('Profile unavailable');
        result={profile:{display_name:model.name,headline:'Engineer',skills:'Python',summary:'Build useful software'}};
      }else if(url.includes('scope=avatar'))result={found:true,file:{mime_type:'image/png',base64:'YWJj\nZA=='}};
      else if(url.includes('scope=cv'))result={found:true,file:{original_name:model.cvName,mime_type:'application/pdf',base64:'JVBERi0='}};
      else if(url.includes('scope=saved'))result={jobs:[{job_key:'archived-job',job_snapshot:{title:'Saved role',company:'Example',url:'https://example.com/job'}}]};
      else if(url.includes('action=status'))result={configured:true,verified:true,recipient:model.user.email};
      else if(url.includes('action=test'))result={delivered_to:JSON.parse(opts.body).recipient_email,needs_verification:false};
      else throw Error('Unexpected request '+url);
      return {ok:true,json:async()=>result};
    }
  };
  const expose='globalThis.app={state,hydrateMember,profilePage,cvPage,resumePage,jobsPage,memberEmailAlertsPage,sendEmailTest,getProfile:()=>profile,getCV:()=>cvEntry};';
  vm.runInNewContext(script.replace("  if(document.readyState==='loading')",expose+"\n  if(document.readyState==='loading')"),context);
  return {app:context.app,model,requests};
}
test('profile, avatar, CV and saved jobs hydrate from the signed-in account on Cloudflare',async()=>{
  const {app,model}=harness();await app.hydrateMember();
  assert.match(app.profilePage(),/Account One/);
  assert.match(app.getProfile().photo,/base64,YWJjZA==$/);
  assert.match(app.cvPage(),/one.pdf/);
  assert.match(app.jobsPage(true),/Saved role/);
  assert.match(app.resumePage(),/Python/);
  model.name='Updated account';model.cvName='revised.pdf';
  await app.hydrateMember();
  assert.match(app.profilePage(),/Updated account/);
  assert.match(app.cvPage(),/revised.pdf/);
});
test('switching account or losing the session never exposes previous profile or CV',async()=>{
  const {app,model}=harness();await app.hydrateMember();
  model.user={id:'user-two',email:'two@example.com',role:'member'};model.failProfile=true;model.cvName='two.pdf';
  await app.hydrateMember();
  assert.doesNotMatch(app.profilePage(),/Account One|one@example.com/);
  assert.match(app.profilePage(),/Profile unavailable/);
  model.failSession=true;await app.hydrateMember();
  assert.equal(app.getCV(),null);
  assert.doesNotMatch(app.cvPage(),/two.pdf|one.pdf/);
  assert.match(app.cvPage(),/Sign in/);
});
test('Check email sends only to the member destination without admin tokens or workflow dispatch',async()=>{
  const {app,requests}=harness();await app.hydrateMember();await app.sendEmailTest();
  const sent=requests.find(x=>x.url.includes('action=test'));
  assert.deepEqual(JSON.parse(sent.opts.body),{recipient_email:'one@example.com'});
  assert.equal(sent.opts.credentials,'same-origin');
  assert.ok(!requests.some(x=>x.url==='/api/test-email'||x.opts.headers?.['x-admin-token']));
  assert.match(app.memberEmailAlertsPage(),/Check email/);
});
