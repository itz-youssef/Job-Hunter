'use strict';
const { timingSafeEqual } = require('node:crypto');

const PROFILE_PATH='private/profile.json';
const CV_PATH='private/cv.bin';
const MAX_CV=2 * 1024 * 1024; // Under typical Vercel serverless body/response limits.
const PROFILE_FIELDS=['name','headline','email','phone','location','summary',
  'skills','education','experience','linkedin','github','portfolio','cvName','cvMime'];
function reply(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(data));
}
function auth(req){
  const expected=process.env.ADMIN_TOKEN||'';
  const actual=req.headers['x-admin-token']||'';
  if(expected.length<24||typeof actual!=='string')return false;
  const a=Buffer.from(expected),b=Buffer.from(actual);
  return a.length===b.length&&timingSafeEqual(a,b);
}
function config(){
  const repo=process.env.PROFILE_GITHUB_REPO||'';
  const token=process.env.PROFILE_GITHUB_TOKEN||process.env.GITHUB_TOKEN||'';
  const branch=process.env.PROFILE_GITHUB_BRANCH||'main';
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!token)throw Object.assign(
    new Error('Private cloud backup is not configured. Set PROFILE_GITHUB_REPO and PROFILE_GITHUB_TOKEN on Vercel.'),{code:503});
  if(repo.toLowerCase()===(process.env.GITHUB_REPO||'').toLowerCase())
    throw Object.assign(new Error('Refusing to store your CV in the public Job Hunter repository'),{code:503});
  return {repo,token,branch};
}
async function github(cfg,path,options={}){
  const response=await fetch('https://api.github.com/repos/'+cfg.repo+'/'+path,{
    ...options,
    headers:{Authorization:'Bearer '+cfg.token,Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28','User-Agent':'job-hunter-private-profile',
      ...(options.headers||{})},
    signal:AbortSignal.timeout(14000)
  });
  if(response.status===404&&!options.method)return null;
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error('Private GitHub repository request failed ('+response.status+')'),{code:response.status===409?409:502});
  return data;
}
async function verified(cfg){
  const info=await github(cfg,'');
  if(!info||info.private!==true)throw Object.assign(
    new Error('Cloud backup requires a separate PRIVATE GitHub repository'),{code:503});
}
async function read(cfg,path){
  const result=await github(cfg,'contents/'+path+'?ref='+encodeURIComponent(cfg.branch));
  if(!result)return null;
  if(result.type!=='file'||typeof result.content!=='string')
    throw Object.assign(new Error('Unsupported private GitHub file'),{code:502});
  return {sha:result.sha,bytes:Buffer.from(result.content.replace(/\s/g,''),'base64')};
}
async function write(cfg,path,bytes){
  const previous=await read(cfg,path);
  const request={message:'Update private Job Hunter profile data',
    branch:cfg.branch,content:Buffer.from(bytes).toString('base64')};
  if(previous)request.sha=previous.sha;
  return github(cfg,'contents/'+path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
}
async function remove(cfg,path){
  const previous=await read(cfg,path);
  if(!previous)return false;
  await github(cfg,'contents/'+path,{
    method:'DELETE',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({message:'Remove private Job Hunter CV',branch:cfg.branch,sha:previous.sha})
  });
  return true;
}
function validatedProfile(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(new Error('Invalid profile'),{code:400});
  const result={};
  for(const field of PROFILE_FIELDS){
    const value=input[field]??'';
    if(typeof value!=='string'||value.length>(['summary','experience','education'].includes(field)?9000:field==='skills'?2500:250))
      throw Object.assign(new Error('Profile field too long: '+field),{code:400});
    result[field]=value.trim();
  }
  const photo=input.photo||'';
  if(typeof photo!=='string'||photo.length>200000||
    (photo&&!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)))
      throw Object.assign(new Error('Invalid or oversized profile photo'),{code:400});
  result.photo=photo;
  result.updatedAt=new Date().toISOString();
  if(Buffer.byteLength(JSON.stringify(result))>240000)throw Object.assign(new Error('Profile is too large'),{code:400});
  return result;
}
module.exports=async function handler(req,res){
  if(!['GET','PUT','DELETE'].includes(req.method))return reply(res,405,{error:'Method not allowed'});
  if(!auth(req))return reply(res,401,{error:'Admin authentication required'});
  try{
    const cfg=config();
    await verified(cfg); // fail closed, never write to a public GitHub repository
    const kind=req.query?.kind==='cv'?'cv':'profile';
    const path=kind==='cv'?CV_PATH:PROFILE_PATH;
    if(req.method==='GET'){
      const file=await read(cfg,path);
      if(!file)return reply(res,200,{ok:true,found:false});
      if(kind==='cv'){
        if(file.bytes.length>MAX_CV)throw Object.assign(new Error('Stored CV exceeds size limit'),{code:413});
        return reply(res,200,{ok:true,found:true,content:file.bytes.toString('base64')});
      }
      const profile=JSON.parse(file.bytes.toString('utf8'));
      return reply(res,200,{ok:true,found:true,profile});
    }
    if(req.method==='DELETE'){
      if(kind!=='cv')return reply(res,405,{error:'Profile deletion is not available from this endpoint'});
      return reply(res,200,{ok:true,deleted:await remove(cfg,path)});
    }
    let body=req.body||{};
    if(typeof body==='string')body=JSON.parse(body);
    if(kind==='profile'){
      const sanitized=validatedProfile(body.profile);
      await write(cfg,path,Buffer.from(JSON.stringify(sanitized,null,2),'utf8'));
      return reply(res,200,{ok:true,saved:true});
    }
    if(typeof body.content!=='string'||body.content.length>Math.ceil(MAX_CV*4/3)+20||
       !/^[A-Za-z0-9+/]+={0,2}$/.test(body.content))
      return reply(res,400,{error:'Invalid CV content or file exceeds 2 MB cloud limit'});
    if(!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(body.mime))
      return reply(res,400,{error:'Only PDF or DOCX CV files are permitted'});
    const bytes=Buffer.from(body.content,'base64');
    if(!bytes.length||bytes.length>MAX_CV)return reply(res,413,{error:'Private cloud CV limit is 2 MB; larger CVs stay in local storage'});
    const looksPdf=bytes.subarray(0,5).toString()==='%PDF-';
    const looksZip=bytes.subarray(0,2).toString()==='PK';
    if(!(looksPdf&&body.mime==='application/pdf')&&!(looksZip&&body.mime!=='application/pdf'))
      return reply(res,400,{error:'CV file content does not match PDF or DOCX'});
    await write(cfg,path,bytes);
    return reply(res,200,{ok:true,saved:true,bytes:bytes.length});
  }catch(error){
    return reply(res,error.code||500,{error:error.code?error.message:'Private storage request failed. Check Vercel logs.'});
  }
};
