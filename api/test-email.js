'use strict';
const { timingSafeEqual } = require('node:crypto');

function reply(res,status,body) {
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(body));
}
function authorized(req) {
  const expected=process.env.ADMIN_TOKEN || '';
  const actual=req.headers['x-admin-token'] || '';
  if(expected.length<24 || typeof actual!=='string')return false;
  const a=Buffer.from(expected),b=Buffer.from(actual);
  return a.length===b.length && timingSafeEqual(a,b);
}
module.exports=async function handler(req,res){
  if(!['POST','GET'].includes(req.method))return reply(res,405,{error:'Method not allowed'});
  if(!authorized(req))return reply(res,401,{error:'Admin authentication required'});
  const repo=process.env.GITHUB_REPO || '';
  const token=process.env.GITHUB_TOKEN || '';
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!token)return reply(res,503,{error:'GitHub integration is not configured on Vercel'});
  const base='https://api.github.com/repos/'+repo+'/actions/workflows/test-email.yml/';
  const isPost=req.method==='POST';
  try{
    const r=await fetch(base+(isPost?'dispatches':'runs?per_page=5'),{
      method:isPost?'POST':'GET',
      headers:{
        Authorization:'Bearer '+token,
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'job-hunter-email-test',
        ...(isPost?{'Content-Type':'application/json'}:{})
      },
      ...(isPost?{body:JSON.stringify({ref:'main'})}:{}),
      signal:AbortSignal.timeout(12000)
    });
    if(!r.ok) {
      const result=await r.json().catch(()=>({}));
      if(r.status===403)return reply(res,503,{error:'GitHub token needs Actions: write permission to start the email test. Update the Vercel GITHUB_TOKEN permissions.'});
      return reply(res,502,{error:'GitHub could not '+(isPost?'start':'read')+' the test ('+r.status+'): '+String(result.message||'Unknown').slice(0,140)});
    }
    if(isPost)return reply(res,202,{ok:true,queued:true,message:'Email delivery test requested. Check the workflow result and inbox.'});
    const data=await r.json();
    return reply(res,200,{ok:true,runs:(data.workflow_runs||[]).slice(0,5).map(run=>({
      id:run.id,status:run.status,conclusion:run.conclusion||null,
      created_at:run.created_at,
      url:'https://github.com/'+repo+'/actions/runs/'+run.id
    }))});
  }catch{
    return reply(res,502,{error:'Unable to contact GitHub right now'});
  }
};
