/**
 * Secret J Cloudflare site (NOT the separate scheduled scanner Worker).
 * Publishes current dist/ assets and adapts the existing, tested Vercel-style
 * account handlers to Workers Request/Response. No Vercel proxy or credentials
 * in public static files.
 */
import authHandler from '../../api/secretj-auth.js';
import botfolioHandler from '../../api/secretj-botfolio.js';
import dataHandler from '../../api/secretj-data.js';
import adminHandler from '../../api/secretj-admin.js';
import healthHandler from '../../api/secretj-health.js';
import linkedinHandler from '../../api/secretj-linkedin.js';
import emailHandler from '../../api/secretj-email.js';
import nativeStatusHandler from '../../api/secretj-native-status.js';
import memberAlerts from '../../lib/secretj/member-alerts.js';
import nativeMonitor from '../../lib/secretj/native-preference-monitor.js';
import isolatedRouting from '../../lib/secretj/isolated-read-routing.js';
import nativeScan from '../../api/secretj-native-scan.js';

const handlers = new Map([
  ['/api/secretj-auth',authHandler],
  ['/api/secretj-botfolio',botfolioHandler],
  ['/api/secretj-data',dataHandler],
  ['/api/secretj-admin',adminHandler],
  ['/api/secretj-health',healthHandler],
  ['/api/secretj-linkedin',linkedinHandler],
  ['/api/secretj-email',emailHandler],
  ['/api/secretj-native-status',nativeStatusHandler]
]);
const maxBody = 1_250_000;
const jsonHeaders={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff'
};
function json(status,body){return new Response(JSON.stringify(body),{status,headers:jsonHeaders});}

/** Production Node handler shim. Exactly one HTTP response per invocation. */
export async function runNodeHandler(handler,request,workerEnv,ctx){
  const url=new URL(request.url);
  const method=request.method.toUpperCase();
  if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))
    return json(405,{ok:false,error:'Method not allowed'});
  let body={};
  if(['POST','PUT','PATCH','DELETE'].includes(method)){
    const type=request.headers.get('content-type')||'';
    const size=Number(request.headers.get('content-length')||0);
    if(size>maxBody)return json(413,{ok:false,error:'Request too large'});
    if(!/^application\/json(?:\s*;|$)/i.test(type))
      return json(415,{ok:false,error:'JSON request expected'});
    const raw=await request.text();
    if(raw.length>maxBody)return json(413,{ok:false,error:'Request too large'});
    try{body=raw?JSON.parse(raw):{};}catch{return json(400,{ok:false,error:'Invalid JSON'});}
  }
  const headers=Object.fromEntries(request.headers);
  // Bind origin checks to the actual routed Worker host, not a spoofed Host.
  headers.host=url.host;
  // The CF-Connecting-IP header is supplied by Cloudflare at the edge.
  // Do not trust a client-supplied X-Forwarded-For for login throttling.
  headers['x-forwarded-for']=request.headers.get('cf-connecting-ip')||'unknown';
  const query=Object.fromEntries(url.searchParams.entries());
  const req={method,headers,query,body,env:workerEnv,waitUntil:typeof ctx?.waitUntil==='function'?ctx.waitUntil.bind(ctx):undefined,socket:{remoteAddress:headers['x-forwarded-for']}};
  let response;
  const res={
    statusCode:200,
    headers:new Headers(),
    setHeader(name,value){this.headers.set(name,String(value));},
    end(body=''){
      if(response)throw Error('Attempted duplicate response');
      response=new Response(body,{status:this.statusCode,headers:this.headers});
    }
  };
  try{await handler(req,res);}
  catch{
    return json(500,{ok:false,error:'Account service unavailable'});
  }
  return response||json(500,{ok:false,error:'No response from account service'});
}

export async function handleRequest(request,env,ctx){
  const url=new URL(request.url);
  const pathname=url.pathname.replace(/\/+$/,'');
  if(pathname==='/api/secretj-native-scan')
    return runNodeHandler(nativeScan.createImmediateHandler(env,ctx),request);
  if(pathname==='/api/secretj-native-status')
    return runNodeHandler(nativeStatusHandler.createHandler(env),request);
  const handler=handlers.get(pathname);
  if(handler)return runNodeHandler(handler,request,env,ctx);

  if(url.pathname.startsWith('/api/')){
    // Do not silently proxy old administrative routes to Vercel.
    return json(404,{ok:false,error:'This API is not available on Cloudflare'});
  }
  // No worker path should access secrets for asset requests. Deploy the
  // exact dist/ version accompanying this code, not an old build branch.
  const response=await env.ASSETS.fetch(request);
  if(url.pathname==='/'||url.pathname.endsWith('.html')||
     url.pathname.endsWith('.css')||url.pathname.endsWith('.js')){
    const headers=new Headers(response.headers);
    headers.set('Cache-Control','no-cache, max-age=0, must-revalidate');
    headers.set('X-Content-Type-Options','nosniff');
    return new Response(response.body,{status:response.status,headers});
  }
  return response;
}
export async function scheduled(controller,env,ctx){
  const when=new Date(controller?.scheduledTime||Date.now());
  try{
    if(env.SECRETJ_NATIVE_MONITOR_ENABLED==='true'){
      // Independent five-minute subscriber checks; public discovery stays intact.
      if(when.getUTCMinutes()%5!==0){
        const queue=await nativeMonitor.deliverQueued(env);
        console.log('secretj-alert-outbox',{status:queue.status,sent:queue.sent||0,failed:queue.failed||0});
        return;
      }
      const result=await nativeMonitor.deliver(env);
      console.log('secretj-native-preferences',{
        status:result.status,processed:result.processed||0,
        sent:result.sent||0,failed:result.failed||0,
        nativeBoards:result.nativeBoards||0,
        failedSources:result.failedSources||0,mailReady:result.mailReady===true
      });
    }else{
      const result=await memberAlerts.deliver(env);
      console.log('secretj-member-alerts',{status:result.status,
        delivered:result.delivered||0,failed:result.failed||0});
    }
  }catch(error){
    // Never log recipients, profile fields, secrets, or CV contents.
    console.warn('secretj-personalized-alerts',{status:'failed',code:String(error?.code||'runtime_error').slice(0,30)});
    throw error;
  }finally{
    // Commit journal is already durable. Independent bounded write-through
    // runs after job delivery, never ahead of the email queue or source scan.
    if(ctx?.waitUntil&&env.SECRETJ_ISOLATED_WRITE_THROUGH==='true'&&when.getUTCMinutes()%5===0){
      ctx.waitUntil(Promise.allSettled(['jobHunter','botfolio'].map(async service=>{
        const result=await isolatedRouting.drainWrites(service,env,4);
        console.log('secretj-isolated-write',{service,status:result.status,count:result.count});
      })));
    }else if(when.getUTCMinutes()%15===1&&ctx?.waitUntil&&env.SECRETJ_ISOLATED_SYNC_ENABLED==='true')
      ctx.waitUntil(isolatedRouting.syncIsolated(env).catch(()=>console.warn('secretj-isolated-sync',{status:'retry'})));
  }
}
export default {fetch:handleRequest,scheduled};
