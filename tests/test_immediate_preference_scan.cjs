'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../lib/secretj/core');
const native=require('../api/secretj-native-scan');
const UID='e07bb2d6-a213-45d0-ab23-e5051967a616';
const COOKIE='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
async function execute(opts={}){
  const calls=[],background=[];
  let started=false;
  core.setQueryForTests(async(sql,args=[])=>{
    calls.push({sql,args});
    if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))
      return opts.signedOut?[]:[{id:UID,email:'member@example.com',is_active:true}];
    if(sql==='SELECT 1 FROM public.sj_preferences WHERE user_id=$1 LIMIT 1')
      return [{one:1}];
    if(sql.includes('INSERT INTO public.sj_native_scan_requests'))
      return opts.running?[]:[{started_at:'2026-11-16T00:00:00.000Z'}];
    if(sql.includes('FROM public.sj_preferences p JOIN public.sj_users u'))
      return [{id:UID,role_families:['software'],career_levels:['junior'],
        egypt_only:true,internships:false,max_experience_years:null}];
    if(sql.includes('FROM public.sj_preferences p WHERE p.user_id'))
      return [{id:UID,role_families:['software'],career_levels:['junior'],
        egypt_only:true,internships:false,max_experience_years:null}];
    if(sql.startsWith('SELECT preference_signature'))return [];
    if(sql.includes('FROM jsonb_to_recordset'))return [];
    if(sql.startsWith('INSERT INTO public.sj_native_watch_state'))return [];
    if(sql.includes('UPDATE public.sj_native_scan_requests'))return [];
    throw Error('Unexpected SQL in immediate scan: '+sql);
  });
  const env={SECRETJ_NATIVE_MONITOR_ENABLED:'true',
    ASSETS:{fetch:async request=>({ok:true,json:async()=>String(request.url).includes('native-source-registry')
      ?{companies:[]}:
       {generated_at:new Date().toISOString(),jobs:[
        {company:'Example',title:'Junior Software Engineer',location:'Cairo, Egypt',
         url:'https://example.com/careers/junior',description:'Build product software'}
       ]}})}};
  const ctx=opts.noContext?null:{waitUntil(p){background.push(p);started=true;}};
  const handler=native.createImmediateHandler(env,ctx);
  let statusCode=200,result;
  const response={setHeader(){},get statusCode(){return statusCode;},set statusCode(v){statusCode=v;},
    end(value){result=JSON.parse(value);}};
  const req={method:opts.method||'POST',headers:{
    host:'jobs.example.com',origin:opts.origin||'https://jobs.example.com',
    cookie:opts.signedOut?'':COOKIE},body:{},query:{}};
  try{
    await handler(req,response);
    await Promise.allSettled(background);
    return {statusCode,result,calls,started};
  }finally{core.setQueryForTests(null);}
}
test('saving preferences triggers authenticated immediate source scan for only that account',async()=>{
 const x=await execute();
 assert.equal(x.statusCode,202);
 assert.equal(x.result.status,'started');
 assert.equal(x.started,true);
 assert.ok(x.calls.some(x=>x.sql.includes('INSERT INTO public.sj_native_scan_requests')));
 assert.ok(x.calls.some(x=>x.sql.includes('FROM jsonb_to_recordset')));
 assert.ok(x.calls.some(x=>x.sql.includes('INSERT INTO public.sj_native_watch_state')));
 assert.ok(x.calls.filter(c=>!c.sql.includes('FROM public.sj_sessions s JOIN public.sj_users u')).every(c=>!c.args.length||c.args[0]===UID));
 assert.ok(!x.calls.some(c=>c.sql.includes('sj_email_alert_log')),'Immediate baseline is never an email blast');
});
test('only a logged-in user can trigger immediate scan',async()=>{
 const x=await execute({signedOut:true});
 assert.equal(x.statusCode,401);assert.equal(x.started,false);
 assert.ok(!x.calls.some(c=>c.sql.includes('sj_native_scan_requests')));
});
test('cross-origin preference scan attempts are rejected before database queries',async()=>{
 const x=await execute({origin:'https://attacker.example'});
 assert.equal(x.statusCode,403);assert.equal(x.started,false);
 assert.equal(x.calls.length,0);
});
test('duplicate concurrent scan request reuses active single-account lease',async()=>{
 const x=await execute({running:true});
 assert.equal(x.statusCode,202);assert.equal(x.result.status,'already_running');
 assert.equal(x.started,false);
});
test('no Cloudflare waitUntil means no false claim that an immediate scan started',async()=>{
 const x=await execute({noContext:true});
 assert.equal(x.statusCode,503);assert.equal(x.started,false);
});
test('account save workflow triggers immediate source scan only after a successful PUT',()=>{
 const js=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 const save=js.indexOf("await api(dataUrl('preferences'),'PUT'");
 const trigger=js.indexOf("await api('/api/secretj-native-scan','POST'");
 assert.ok(save>0&&trigger>save);
 const worker=fs.readFileSync('cloudflare/site/worker.mjs','utf8');
 assert.match(worker,/createImmediateHandler\(env,ctx\)/);
 assert.match(worker,/runNodeHandler\(nativeScan\.createImmediateHandler/);
 const monitor=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 assert.match(monitor,/async function scanOneUser\(/);
 assert.match(monitor,/await qualifyJobs\(selected,latest\[0\],env,fetchImpl\)/);
 assert.match(monitor,/await reserveNew\(latest\[0\],signature\(latest\[0\]\),verified\.accepted\)/);
 assert.doesNotMatch(monitor.slice(monitor.indexOf('async function scanOneUser('),monitor.indexOf('function mailConfiguration(')),/flush\(|deliverQueued\(/);
});

test('immediate source scan uses concurrent employer queries to minimize Worker waitUntil time',()=>{
 const code=fs.readFileSync('lib/secretj/native-preference-monitor.js','utf8');
 assert.match(code,/const batchSize=options\.immediate===true\?12:4/);
 assert.match(code,/gather\(env,fetchImpl,\{immediate:true\}\)/);
});
test('immediate scan lifecycle is visible only through an authenticated private status endpoint',()=>{
 const status=fs.readFileSync('api/secretj-native-status.js','utf8');
 assert.match(status,/core\.requireUser\(req\)/);
 assert.match(status,/FROM public\.sj_native_scan_requests WHERE user_id=\$1/);
 assert.match(status,/immediate_scan:scanRows\[0\]\|\|null/);
 const account=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 assert.match(account,/Save preferences &amp; scan now/);
 assert.match(account,/Immediate scan in progress/);
 assert.match(account,/Immediate source scan completed/);
 assert.match(account,/await api\('\/api\/secretj-native-scan','POST'/);
});

test('abandoned worker scans report timeout instead of staying running forever',()=>{
 const api=fs.readFileSync('api/secretj-native-status.js','utf8');
 assert.match(api,/WHEN status='running' AND started_at<now\(\)-interval '2 minutes'/);
 assert.match(api,/THEN 'timed_out' ELSE status END AS status/);
 const frontend=fs.readFileSync('dist/assets/secretj-account.js','utf8');
 assert.match(frontend,/\['failed','timed_out'\]\.includes\(currentScan\?\.status\)/);
 assert.match(frontend,/\['complete','failed','timed_out'\]\.includes\(scan\?\.status\)/);
});
