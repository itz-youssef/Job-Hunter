'use strict';
process.env.NODE_ENV='test';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../lib/secretj/core');
const health=require('../api/secretj-health');

function request(method='GET'){return {method,headers:{host:'www.jobsnow.tech'}};}
function invoke(req){
  return new Promise((resolve,reject)=>{
    const res={headers:{},statusCode:200,
      setHeader(k,v){this.headers[k]=v;},
      end(body){resolve({status:this.statusCode,headers:this.headers,data:JSON.parse(body)});}
    };
    Promise.resolve(health(req,res)).catch(reject);
  });
}
async function withEnv(env,fn){
  const prev={url:process.env.DATABASE_URL,enabled:process.env.SECRETJ_REGISTRATION_ENABLED};
  if(env.url===null)delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL=env.url;
  if(env.enabled===null)delete process.env.SECRETJ_REGISTRATION_ENABLED;
  else process.env.SECRETJ_REGISTRATION_ENABLED=env.enabled;
  try{return await fn();}
  finally{
    if(prev.url===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=prev.url;
    if(prev.enabled===undefined)delete process.env.SECRETJ_REGISTRATION_ENABLED;
    else process.env.SECRETJ_REGISTRATION_ENABLED=prev.enabled;
    core.setQueryForTests(null);
  }
}
test('missing Vercel secret is reported without exposing connection credentials',async()=>{
  await withEnv({url:null,enabled:'true'},async()=>{
    const r=await invoke(request());
    assert.equal(r.status,503);
    assert.equal(r.data.database,'not_configured');
    assert.equal(r.data.registration_enabled,false);
    assert.doesNotMatch(JSON.stringify(r.data),/postgres|password|neondb_owner/i);
    assert.match(r.headers['Cache-Control'],/no-store/);
  });
});
test('database exists and migrations complete allows registration diagnostic',async()=>{
  await withEnv({url:'postgresql://unusable:test@example.invalid/db',enabled:'true'},async()=>{
    core.setQueryForTests(async()=>[{ready_tables:10}]);
    const r=await invoke(request());
    assert.equal(r.status,200);
    assert.equal(r.data.database,'ready');
    assert.equal(r.data.registration_enabled,true);
    assert.equal(r.data.ok,true);
  });
});
test('missing schema is distinguished from missing credentials',async()=>{
  await withEnv({url:'postgresql://unusable:test@example.invalid/db',enabled:'true'},async()=>{
    core.setQueryForTests(async()=>[{ready_tables:9}]);
    const r=await invoke(request());
    assert.equal(r.status,503);
    assert.equal(r.data.database,'migration_required');
  });
});
test('Neon connection failure is reported without leaking driver error details',async()=>{
  await withEnv({url:'postgresql://unusable:test@example.invalid/db',enabled:'true'},async()=>{
    core.setQueryForTests(async()=>{throw Error('sensitive database string');});
    const r=await invoke(request());
    assert.equal(r.status,503);
    assert.equal(r.data.database,'connection_failed');
    assert.doesNotMatch(JSON.stringify(r.data),/sensitive|example\.invalid/);
  });
});
test('non-GET health probes are rejected',async()=>{
  const r=await invoke(request('POST'));
  assert.equal(r.status,405);
  assert.equal(r.data.ok,false);
});
