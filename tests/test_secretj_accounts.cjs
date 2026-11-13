'use strict';

/** Offline security regression tests: no real Neon connection or emails. */
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../lib/secretj/core');
const auth=require('../api/secretj-auth');
const data=require('../api/secretj-data');
const admin=require('../api/secretj-admin');
const fs=require('node:fs');

const ID='e07bb2d6-a213-45d0-ab23-e5051967a616';
const OTHER='fdc01d09-20e9-466f-bf8b-afdca97fec01';
const COOKIE='sj_session='+Buffer.from('A'.repeat(32)).toString('base64url');
function req(method='GET',body={},query={},opts={}){
  return {
    method,body,query,
    headers:{
      host:'www.jobsnow.tech',
      origin:'https://www.jobsnow.tech',
      ...(opts.cookie?{cookie:opts.cookie}:{}),
      ...(opts.headers||{})
    }
  };
}
async function call(handler,request) {
  return new Promise((resolve,reject)=>{
    const headers={};
    const res={
      statusCode:200,
      setHeader(k,v){headers[k]=v;},
      end(body){resolve({status:this.statusCode,body:JSON.parse(body),headers});}
    };
    Promise.resolve(handler(request,res)).catch(reject);
  });
}
function fakeUser({role='member',id=ID}={}) {
  return {id,email:'member@example.com',role,is_active:true};
}
function fixture(run, {role='member',user=ID}={}) {
  const calls=[];
  core.setQueryForTests(async (sql,args=[])=>{
    calls.push({sql,args});
    if(sql.includes('FROM public.sj_sessions s JOIN public.sj_users u'))return [fakeUser({role,id:user})];
    if(sql.includes('sj_auth_attempts'))return [{attempts:1}];
    if(sql.includes('FROM public.sj_users WHERE email='))return [];
    if(sql.includes('WITH created AS'))return [fakeUser()];
    if(sql.includes('RETURNING'))return [{updated_at:'2026-11-13T12:00:00Z'}];
    return [];
  });
  return Promise.resolve().then(()=>run(calls)).finally(()=>core.setQueryForTests(null));
}

test('Origin and method guard blocks CSRF before SQL is touched',async()=>{
  await fixture(async calls=>{
    const denied=await call(auth,req('POST',{email:'user@example.com',password:'correct horse battery staple'},{action:'login'},{
      headers:{origin:'https://evil.example'}
    }));
    assert.equal(denied.status,403);
    assert.equal(calls.length,0);
  });
});
test('guest sessions return null without exposing database information',async()=>{
  await fixture(async calls=>{
    const r=await call(auth,req('GET',{},{action:'session'}));
    assert.equal(r.status,200);
    assert.equal(r.body.user,null);
    assert.equal(calls.length,0);
    assert.match(r.headers['Cache-Control'],/no-store/);
  });
});
test('signup disabled until Neon has been configured and registration enabled',async()=>{
  await fixture(async calls=>{
    delete process.env.SECRETJ_REGISTRATION_ENABLED;
    const r=await call(auth,req('POST',{
      email:'member@example.com',password:'correct horse battery staple',
      name:'Test User'
    },{action:'register'}));
    assert.equal(r.status,503);
    assert.equal(calls.length,0);
  });
});
test('signup always creates a normal member and a cookie with HttpOnly SameSite',async()=>{
  await fixture(async calls=>{
    const prev=process.env.SECRETJ_REGISTRATION_ENABLED;
    process.env.SECRETJ_REGISTRATION_ENABLED='true';
    try{
      const r=await call(auth,req('POST',{
        email:'member@example.com',password:'correct horse battery staple',
        name:'Test User',role:'admin'
      },{action:'register'}));
      assert.equal(r.status,201);
      assert.equal(r.body.user.role,'member');
      assert.equal(r.body.user.password_hash,undefined);
      assert.match(r.headers['Set-Cookie'],/HttpOnly/);
      assert.match(r.headers['Set-Cookie'],/SameSite=Lax/);
      const saved=calls.find(x=>x.sql.includes('WITH created AS'));
      assert.ok(saved);
      assert.ok(saved.args[2].startsWith('scrypt$'));
      assert.ok(!saved.sql.includes('role,'));
    }finally{
      if(prev===undefined)delete process.env.SECRETJ_REGISTRATION_ENABLED;
      else process.env.SECRETJ_REGISTRATION_ENABLED=prev;
    }
  });
});
test('unauthorized requests never query user data',async()=>{
  await fixture(async calls=>{
    const r=await call(data,req('GET',{},{scope:'profile'}));
    assert.equal(r.status,401);
    assert.equal(calls.length,0);
    const a=await call(admin,req('GET',{},{action:'summary'}));
    assert.equal(a.status,401);
    assert.equal(calls.length,0);
  });
});
test('normal members cannot read admin data or mutate roles',async()=>{
  await fixture(async calls=>{
    const r=await call(admin,req('GET',{},{action:'users'},{cookie:COOKIE}));
    assert.equal(r.status,403);
    assert.equal(calls.length,1); // Only validated session lookup.
    assert.equal(calls.some(x=>x.sql.includes('SELECT u.id,u.email,u.role,u.is_active,u.created_at')),false);
  });
});
test('all profile and saved-job SQL access is scoped by a verified user id',async()=>{
  await fixture(async calls=>{
    const r=await call(data,req('GET',{},{scope:'profile'},{cookie:COOKIE}));
    assert.equal(r.status,200);
    const q=calls.find(x=>x.sql.includes('FROM public.sj_profiles'));
    assert.deepEqual(q.args,[ID]);
    assert.match(q.sql,/WHERE user_id=\$1/);
    const s=await call(data,req('GET',{},{scope:'saved'},{cookie:COOKIE}));
    assert.equal(s.status,200);
    const q2=calls.find(x=>x.sql.includes('FROM public.sj_saved_jobs'));
    assert.deepEqual(q2.args,[ID]);
    assert.match(q2.sql,/WHERE user_id=\$1/);
  });
});
test('neither body user_id nor requested role is used to update another account',async()=>{
  await fixture(async calls=>{
    const r=await call(data,req('PUT',{
      user_id:OTHER,role:'admin',display_name:'My Name',headline:'AI Engineer'
    },{scope:'profile'},{cookie:COOKIE}));
    assert.equal(r.status,200);
    const q=calls.find(x=>x.sql.includes('INSERT INTO public.sj_profiles'));
    assert.ok(q);
    assert.equal(q.args[0],ID);
    assert.ok(!q.sql.includes('role='));
    assert.ok(!q.args.includes(OTHER));
  });
});
test('malformed URLs and non-PDF files are rejected before storage',async()=>{
  await fixture(async calls=>{
    const invalid=await call(data,req('POST',{key:'job1',job:{
      title:'Software Intern',company:'Example',url:'javascript:alert(1)'
    }},{scope:'saved'},{cookie:COOKIE}));
    assert.equal(invalid.status,400);
    const cv=await call(data,req('POST',{
      name:'fake.pdf',mime:'application/pdf',
      content:Buffer.from('This is not a PDF').toString('base64')
    },{scope:'cv'},{cookie:COOKIE}));
    assert.equal(cv.status,400);
    assert.equal(calls.some(x=>x.sql.includes('INSERT INTO public.sj_cv_files')),false);
  });
});
test('member saved-job mutation is limited to its own identity',async()=>{
  await fixture(async calls=>{
    const r=await call(data,req('POST',{
      user_id:OTHER,key:'job123',job:{title:'AI Intern',company:'Example',
        url:'https://example.com/job/123',location:'Cairo'}
    },{scope:'saved'},{cookie:COOKIE}));
    assert.equal(r.status,201);
    const q=calls.find(x=>x.sql.includes('INSERT INTO public.sj_saved_jobs'));
    assert.equal(q.args[0],ID);
    assert.equal(q.args[1],'job123');
    assert.ok(!q.args.includes(OTHER));
  });
});
test('admin never changes their own role or suspends their own account',async()=>{
  await fixture(async calls=>{
    const r=await call(admin,req('PATCH',{id:ID,field:'role',value:'member'},{
      action:'user'
    },{cookie:COOKIE}));
    assert.equal(r.status,403);
    assert.equal(calls.filter(x=>x.sql.includes('UPDATE public.sj_users')).length,0);
  },{role:'admin'});
});
test('admin changes use a CTE with audit record, not a client-provided admin flag',async()=>{
  await fixture(async calls=>{
    const r=await call(admin,req('PATCH',{id:OTHER,field:'role',value:'admin'},{
      action:'user'
    },{cookie:COOKIE}));
    assert.equal(r.status,200); // Mock returns a simulated update row.
    const q=calls.find(x=>x.sql.includes('WITH changed AS'));
    assert.ok(q);
    assert.match(q.sql,/INSERT INTO public.sj_admin_audit/);
    assert.deepEqual(q.args.slice(0,3),['admin',OTHER,ID]);
  },{role:'admin'});
});
test('account page includes complete forms but no database credentials',()=>{
  const h=fs.readFileSync('dist/account.html','utf8');
  const js=fs.readFileSync('dist/assets/secretj-account.js','utf8');
  assert.match(h,/SECRET <span>J\./);
  for(const x of ['profile','saved','applications','preferences','documents','admin'])
    assert.ok(h.includes('data-view="'+x+'"'));
  assert.ok(js.includes("'/api/secretj-auth"));
  assert.ok(js.includes("'/api/secretj-data"));
  assert.ok(js.includes("'/api/secretj-admin"));
  assert.doesNotMatch(h+js,/DATABASE_URL|npg_|postgresql:\/\/|neondb_owner/);
});

test('binary account files strip PostgreSQL base64 line breaks before returning to browsers',async()=>{
  core.setQueryForTests(async(sql,args)=>{
    if(sql.includes('FROM public.sj_sessions'))return [fakeUser()];
    assert.deepEqual(args,[ID]);
    return [{mime_type:'image/png',size_bytes:4,base64:'YWJj\nZA==\n'}];
  });
  try{
    const result=await call(data,req('GET',{},{scope:'avatar'},{cookie:COOKIE}));
    assert.equal(result.status,200);
    assert.equal(result.body.file.base64,'YWJjZA==');
    assert.match(result.headers['Cache-Control'],/no-store/);
  }finally{core.setQueryForTests(null);}
});
