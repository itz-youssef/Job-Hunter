'use strict';

process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const email=require('../api/secretj-email');
const memberAlerts=require('../lib/secretj/member-alerts');
const {parseText}=require('../dist/assets/secretj-cv-parser');
const {placement}=require('../dist/assets/secretj-avatar-crop');

const ID='e07bb2d6-a213-45d0-ab23-e5051967a616';
const USER_EMAIL='member@example.com';
const COOKIE='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
const req=(method,action,opts={})=>({
  method,query:{action},body:opts.body||{},
  headers:{host:'www.jobsnow.tech',origin:opts.origin||'https://www.jobsnow.tech',cookie:opts.cookie||COOKIE}
});
async function call(handler,request){
  let resolved;const result=new Promise(resolve=>resolved=resolve);
  const res={headers:{},statusCode:200,
    setHeader(name,value){this.headers[name]=value;},
    end(value){resolved({status:this.statusCode,data:JSON.parse(value)});}
  };
  await handler(request,res);
  return result;
}
function withSQL(fn,run){
  const calls=[];
  core.setQueryForTests(async (sql,args=[])=>{
    calls.push({sql,args});
    if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
      return [{id:ID,email:USER_EMAIL,role:'member',is_active:true}];
    return fn(sql,args);
  });
  return Promise.resolve().then(()=>run(calls))
    .finally(()=>core.setQueryForTests(null));
}
test('confirmation mail and test alerts are bound to session identity, not user input',async()=>{
  const oldFetch=global.fetch,oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.SECRETJ_EMAIL_FROM;
  const sent=[];
  global.fetch=async (url,opts)=>{
    assert.equal(url,'https://api.resend.com/emails');
    sent.push(JSON.parse(opts.body));
    return {ok:true};
  };
  process.env.RESEND_API_KEY='dummy-test-only-not-real';
  process.env.SECRETJ_EMAIL_FROM='alerts@jobsnow.tech';
  try{
    await withSQL((sql,args)=>{
      if(sql.includes('INSERT INTO public.sj_email_verifications'))return [{verified_at:null}];
      return [];
    },async calls=>{
      const r=await call(email,req('POST','test',{body:{to:'admin@example.com',recipient:'attacker@example.com'}}));
      assert.equal(r.status,200);
      assert.equal(r.data.delivered_to,USER_EMAIL);
      assert.equal(r.data.needs_verification,true);
      assert.deepEqual(sent[0].to,[USER_EMAIL]);
      assert.ok(!JSON.stringify(sent[0]).includes('admin@example.com'));
      assert.ok(calls.some(x=>x.sql.includes('sj_email_verifications')&&x.args[0]===ID));
    });
  }finally{
    global.fetch=oldFetch;
    if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;
    if(oldFrom===undefined)delete process.env.SECRETJ_EMAIL_FROM;else process.env.SECRETJ_EMAIL_FROM=oldFrom;
  }
});
test('email status is strictly account-scoped',async()=>{
  await withSQL((sql,args)=>{
    if(sql.includes('SELECT verified_at,last_sent_at')){assert.deepEqual(args,[ID]);return [{verified_at:'2026-11-13T12:00:00Z'}];}
    return [];
  },async()=>{
    const r=await call(email,req('GET','status'));
    assert.equal(r.status,200);
    assert.equal(r.data.recipient,USER_EMAIL);
    assert.equal(r.data.verified,true);
  });
});
test('email sending rejects cross-origin mutation before querying data',async()=>{
  await withSQL(()=>{throw Error('Should not query SQL');},async calls=>{
    const r=await call(email,req('POST','test',{origin:'https://example.evil'}));
    assert.equal(r.status,403);
    assert.equal(calls.length,0);
  });
});
test('15-minute test-email cooldown prevents repeated sends',async()=>{
  const old=process.env.RESEND_API_KEY,oldFrom=process.env.SECRETJ_EMAIL_FROM;
  process.env.RESEND_API_KEY='dummy-test';process.env.SECRETJ_EMAIL_FROM='alerts@jobsnow.tech';
  try{
    await withSQL(sql=>sql.includes('INSERT INTO public.sj_email_verifications')?[]:[],async()=>{
      const r=await call(email,req('POST','test'));
      assert.equal(r.status,429);
    });
  }finally{
    if(old===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=old;
    if(oldFrom===undefined)delete process.env.SECRETJ_EMAIL_FROM;else process.env.SECRETJ_EMAIL_FROM=oldFrom;
  }
});
test('member cron delivers only to verified, opted-in users and never operator email',async()=>{
  const oldEnabled=process.env.SECRETJ_ALERTS_ENABLED,oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.SECRETJ_EMAIL_FROM;
  process.env.SECRETJ_ALERTS_ENABLED='true';
  process.env.RESEND_API_KEY='dummy-test';process.env.SECRETJ_EMAIL_FROM='alerts@jobsnow.tech';
  const now=new Date().toISOString();
  const sent=[];
  const snapshot={generated_at:now,jobs:[{
    title:'Software Engineer',company:'Example',location:'Cairo, Egypt',
    description:'Develop APIs with Node',url:'https://example.com/jobs/42',
    discovered_at:now
  }]};
  try{
    await withSQL(sql=>{
      if(sql.includes('FROM public.sj_users u')&&sql.includes('sj_email_verifications'))
        return [{id:ID,email:USER_EMAIL,egypt_only:true,internships:true,role_families:['software']}];
      if(sql.includes('INSERT INTO public.sj_email_alert_log'))return [{job_key:'https://example.com/jobs/42'}];
      return [];
    },async calls=>{
      const env={ASSETS:{fetch:async()=>({ok:true,json:async()=>snapshot})}};
      const result=await memberAlerts.deliver(env,async(to,subject,body)=>sent.push({to,subject,body}));
      assert.equal(result.delivered,1);
      assert.equal(sent.length,1);
      assert.equal(sent[0].to,USER_EMAIL);
      assert.ok(!sent[0].body.includes('ALERT_EMAIL'));
      assert.ok(calls.some(x=>x.sql.includes('p.email_alerts=true AND v.verified_at IS NOT NULL')));
    });
  }finally{
    if(oldEnabled===undefined)delete process.env.SECRETJ_ALERTS_ENABLED;else process.env.SECRETJ_ALERTS_ENABLED=oldEnabled;
    if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;
    if(oldFrom===undefined)delete process.env.SECRETJ_EMAIL_FROM;else process.env.SECRETJ_EMAIL_FROM=oldFrom;
  }
});
test('email migration restricts data to account ownership with no public grants',()=>{
  const sql=fs.readFileSync('database/migrations/003_secretj_member_email.sql','utf8');
  for(const table of ['sj_email_verifications','sj_email_alert_log']){
    assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table));
    assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'));
  }
  assert.match(sql,/REVOKE ALL ON TABLE public\.sj_email_verifications/);
  assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+TABLE/);
});
test('auto CV parsing extracts structured fields without inventing missing experience',()=>{
  const parsed=parseText([
    'Jane Doe','AI Engineer','Cairo, Egypt','linkedin.com/in/janedoe',
    'Summary','I build machine learning applications.',
    'Skills','Python, PyTorch, SQL',
    'Experience','Computer Vision Intern at Example Labs, 2026',
    'Education','BSc Computer Science'
  ].join('\n'));
  assert.equal(parsed.display_name,'Jane Doe');
  assert.equal(parsed.skills,'Python, PyTorch, SQL');
  assert.ok(parsed.experience.includes('Computer Vision Intern'));
  assert.ok(parsed.linkedin.startsWith('https://linkedin.com/in/janedoe'));
});
test('image crop zoom and drag offsets remain within the 256px circular portrait bounds',()=>{
  const base=placement(1200,800,1,0,0);
  assert.ok(base.width>=256&&base.height>=256);
  const zoom=placement(1200,800,2,9999,-9999);
  assert.ok(zoom.width>=base.width);
  assert.ok(Math.abs(zoom.x)<zoom.width/2);
  assert.ok(Math.abs(zoom.y)<zoom.height/2);
  assert.throws(()=>placement(0,400));
});
test('account settings expose opt-in, individual test, code verification and image editor',()=>{
  const js=fs.readFileSync('dist/assets/secretj-account.js','utf8');
  const html=fs.readFileSync('dist/account.html','utf8');
  assert.match(js,/\/api\/secretj-email\?action=test/);
  assert.match(js,/\/api\/secretj-email\?action=verify/);
  assert.match(js,/email_alerts/);
  assert.match(js,/SecretJCVParser\.extract/);
  assert.match(js,/SecretJAvatarCrop\.open/);
  assert.match(html,/secretj-cv-parser\.js/);
  assert.match(html,/secretj-avatar-crop\.js/);
});

test('a member can choose an alternative address, but it is unverified until code confirmation',async()=>{
  const oldFetch=global.fetch,oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.SECRETJ_EMAIL_FROM;
  const sent=[];
  process.env.RESEND_API_KEY='dummy-test';process.env.SECRETJ_EMAIL_FROM='alerts@jobsnow.tech';
  global.fetch=async (url,opts)=>{
    sent.push(JSON.parse(opts.body));
    return {ok:true};
  };
  try{
    await withSQL((sql,args)=>{
      if(sql.includes('INSERT INTO public.sj_email_verifications')){
        assert.equal(args[0],ID);
        assert.equal(args[3],'alternative@example.net');
        assert.equal(args[4],USER_EMAIL);
        return [{verified_at:null}];
      }
      return [];
    },async()=>{
      const result=await call(email,req('POST','test',{body:{
        recipient_email:'Alternative@Example.Net'
      }}));
      assert.equal(result.status,200);
      assert.equal(result.data.needs_verification,true);
      assert.equal(result.data.delivered_to,'alternative@example.net');
      assert.deepEqual(sent[0].to,['alternative@example.net']);
      assert.match(sent[0].text,/confirmation code/i);
    });
    await withSQL((sql,args)=>{
      if(sql.includes('SELECT verified_at,last_sent_at,recipient_email,verified_email')){
        assert.deepEqual(args,[ID]);
        return [{verified_at:null,recipient_email:'alternative@example.net',verified_email:null}];
      }
      return [];
    },async()=>{
      const status=await call(email,req('GET','status'));
      assert.equal(status.status,200);
      assert.equal(status.data.recipient,'alternative@example.net');
      assert.equal(status.data.verified,false);
    });
    await withSQL((sql,args)=>{
      if(sql.includes('SELECT verified_at,last_sent_at,recipient_email,verified_email')){
        return [{verified_at:'2026-11-13T12:00:00Z',
          recipient_email:'alternative@example.net',verified_email:'alternative@example.net'}];
      }
      return [];
    },async()=>{
      const status=await call(email,req('GET','status'));
      assert.equal(status.data.verified,true);
    });
  }finally{
    global.fetch=oldFetch;
    if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;
    if(oldFrom===undefined)delete process.env.SECRETJ_EMAIL_FROM;else process.env.SECRETJ_EMAIL_FROM=oldFrom;
  }
});
test('scheduled mail selects only code-confirmed chosen recipient, never pending emails',()=>{
  const code=fs.readFileSync('lib/secretj/member-alerts.js','utf8');
  const sql=fs.readFileSync('database/migrations/003_secretj_member_email.sql','utf8');
  const front=fs.readFileSync('dist/assets/secretj-account.js','utf8');
  assert.match(code,/COALESCE\(v\.verified_email,u\.email\) AS email/);
  assert.match(code,/v\.verified_at IS NOT NULL/);
  assert.match(code,/v\.recipient_email=u\.email/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS recipient_email TEXT/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS verified_email TEXT/);
  assert.match(front,/id="sj-email-recipient"/);
  assert.match(front,/recipient_email:recipientEmail/);
});
