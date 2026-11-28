'use strict';
// Publish the exact same catalog used by the website, from the latest main
// snapshot and native boards. Never touch accounts, watches or email queues.
const fs=require('node:fs/promises');
const monitor=require('../lib/secretj/native-preference-monitor');
const catalog=require('../lib/secretj/dictionary-catalog');
const env={...process.env,SECRETJ_LIVE_CATALOG:'true',ASSETS:{async fetch(req){
 const path=new URL(req.url).pathname;
 if(!['/data.json','/native-source-registry.json'].includes(path))return new Response(null,{status:404});
 return new Response(await fs.readFile('dist'+path),{headers:{'Content-Type':'application/json'}});
}}};
(async()=>{
 const started=new Date().toISOString();
 const gathered=await monitor.gather(env);
 if(!gathered.snapshotFresh||!gathered.jobs.length)throw Error('Fresh source snapshot unavailable');
 const result=await catalog.publish(env,gathered,monitor.safeJob,started);
 if(!result.published)throw Error('Catalog publication not acknowledged');
 console.log(JSON.stringify({published:true,jobs:result.rows.length,classified:result.classified,reused:result.reused,failedSources:gathered.failures.length,nativeBoards:gathered.official.size}));
})().catch(()=>{console.error('Dictionary catalog publication failed (details suppressed)');process.exitCode=1;});
