/**
 * Secret J Cloudflare site (NOT the separate scheduled scanner Worker).
 * Publishes current dist/ assets and adapts the existing, tested Vercel-style
 * account handlers to Workers Request/Response. No Vercel proxy or credentials
 * in public static files.
 */
import authHandler from '../../api/secretj-auth.js';
import dataHandler from '../../api/secretj-data.js';
import adminHandler from '../../api/secretj-admin.js';
import healthHandler from '../../api/secretj-health.js';
import linkedinHandler from '../../api/secretj-linkedin.js';

const handlers = new Map([
  ['/api/secretj-auth',authHandler],
  ['/api/secretj-data',dataHandler],
  ['/api/secretj-admin',adminHandler],
  ['/api/secretj-health',healthHandler],
  ['/api/secretj-linkedin',linkedinHandler]
]);
const maxBody = 1_250_000;
const jsonHeaders={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff'
};
function json(status,body){return new Response(JSON.stringify(body),{status,headers:jsonHeaders});}

/** Production Node handler shim. Exactly one HTTP response per invocation. */
export async function runNodeHandler(handler,request){
  const url=new URL(request.url);
  const method=request.method.toUpperCase();
  if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))
    return json(405,{ok:false,error:'Method not allowed'});
  let body={};
  if(['POST','PUT','PATCH'].includes(method)){
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
  // The CF-Connecting-IP header is supplied by Cloudflare at the edge.
  // Do not trust a client-supplied X-Forwarded-For for login throttling.
  headers['x-forwarded-for']=request.headers.get('cf-connecting-ip')||'unknown';
  const query=Object.fromEntries(url.searchParams.entries());
  const req={method,headers,query,body,socket:{remoteAddress:headers['x-forwarded-for']}};
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

export async function handleRequest(request,env){
  const url=new URL(request.url);
  const handler=handlers.get(url.pathname.replace(/\/+$/,''));
  if(handler)return runNodeHandler(handler,request);

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
export default {fetch:handleRequest};
