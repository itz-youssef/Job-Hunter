'use strict';

/**
 * Personal data API. Every query is scoped by the verified server-side user id.
 * The DATABASE_URL credential must never be available to frontend code.
 */
const core=require('../lib/secretj/core');
const {Buffer}=require('node:buffer');

function jsonText(value){ return JSON.stringify(value); }
function validURL(value){
  if(!value)return '';
  if(typeof value!=='string'||value.length>500)throw core.fail(400,'Invalid URL');
  try {const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)
    throw Error('Not HTTPS');return url.toString();}
  catch {throw core.fail(400,'Only HTTPS links are allowed');}
}
function jobKey(value){
  const s=core.validateText(value,500,'Job key');
  if(!s)throw core.fail(400,'Job key is required');
  return s;
}
function jobSnapshot(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw core.fail(400,'Invalid job snapshot');
  return {
    title:core.validateText(input.title||'',220,'Job title'),
    company:core.validateText(input.company||'',180,'Company'),
    location:core.validateText(input.location||'',180,'Location'),
    url:validURL(input.url||''),
    score:Number.isFinite(Number(input.score))?Math.max(0,Math.min(100,Number(input.score))):0,
    published:core.validateText(input.published||'',100,'Posting date')
  };
}
function validateProfile(body){
  const specs={
    display_name:120,headline:220,location:180,summary:9000,skills:5000,
    experience:12000,education:12000,linkedin:500,github:500,portfolio:500
  };
  const record={};
  for(const [field,max] of Object.entries(specs)){
    record[field]=core.validateText(body[field]||'',max,field);
  }
  for(const name of ['linkedin','github','portfolio'])record[name]=validURL(record[name]);
  return record;
}
function dataURLToBytes(base64,max,mime,kind){
  if(typeof base64!=='string'||base64.length>Math.ceil(max*4/3)+32||
     !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
    throw core.fail(400,'Invalid '+kind+' file or size limit exceeded');
  const bytes=Buffer.from(base64,'base64');
  if(!bytes.length||bytes.length>max)throw core.fail(413,kind+' exceeds size limit');
  if(kind==='CV'){
    const pdf=bytes.subarray(0,5).toString('ascii')==='%PDF-';
    const docx=bytes.subarray(0,2).toString('ascii')==='PK';
    if((mime==='application/pdf'&&!pdf)||
       (mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'&&!docx)||
       ![ 'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ].includes(mime))
      throw core.fail(400,'Only valid PDF/DOCX CV files are accepted');
  }else{
    const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
    const png=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
    const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
    if(!((mime==='image/jpeg'&&jpeg)||(mime==='image/png'&&png)||(mime==='image/webp'&&webp)))
      throw core.fail(400,'Invalid avatar format');
  }
  return bytes;
}
module.exports=async function handler(req,res){
  try {
    core.allowedMethod(req,['GET','PUT','POST','DELETE']);
    const user=await core.requireUser(req);
    const scope=req.query?.scope;
    if(!['profile','preferences','saved','applications','cv','avatar'].includes(scope))
      throw core.fail(404,'Unknown account resource');
    const userId=user.id;
    const body=req.method==='GET'||req.method==='DELETE'?{}:core.parseBody(req);

    if(scope==='profile'){
      if(req.method==='GET'){
        const rows=await core.query('SELECT display_name,headline,location,summary,skills,experience,education,linkedin,github,portfolio,updated_at FROM public.sj_profiles WHERE user_id=$1',[userId]);
        return core.reply(res,200,{ok:true,profile:rows[0]||null});
      }
      if(req.method!=='PUT')throw core.fail(405,'Method not allowed');
      const v=validateProfile(body);
      const rows=await core.query(
        `INSERT INTO public.sj_profiles
           (user_id,display_name,headline,location,summary,skills,experience,education,linkedin,github,portfolio)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name=EXCLUDED.display_name,headline=EXCLUDED.headline,
           location=EXCLUDED.location,summary=EXCLUDED.summary,skills=EXCLUDED.skills,
           experience=EXCLUDED.experience,education=EXCLUDED.education,
           linkedin=EXCLUDED.linkedin,github=EXCLUDED.github,
           portfolio=EXCLUDED.portfolio,updated_at=now()
         RETURNING updated_at`,
        [userId,v.display_name,v.headline,v.location,v.summary,v.skills,v.experience,v.education,v.linkedin,v.github,v.portfolio]
      );
      return core.reply(res,200,{ok:true,updated_at:rows[0]?.updated_at});
    }
    if(scope==='preferences'){
      if(req.method==='GET'){
        const rows=await core.query('SELECT egypt_only,internships,max_experience_years,role_families,email_alerts FROM public.sj_preferences WHERE user_id=$1',[userId]);
        return core.reply(res,200,{ok:true,preferences:rows[0]||{
          egypt_only:true,internships:true,max_experience_years:2,
          role_families:['software','ai_ml','cv','mlops'],email_alerts:false
        }});
      }
      if(req.method!=='PUT')throw core.fail(405,'Method not allowed');
      const years=Number(body.max_experience_years);
      if(!Number.isInteger(years)||years<0||years>10||
         typeof body.egypt_only!=='boolean'||typeof body.internships!=='boolean'||
         typeof body.email_alerts!=='boolean'||!Array.isArray(body.role_families)||
         body.role_families.length>8||
         !body.role_families.every(x=>['software','ai_ml','cv','mlops'].includes(x)))throw core.fail(400,'Invalid preferences');
      await core.query(
        `INSERT INTO public.sj_preferences(user_id,egypt_only,internships,max_experience_years,role_families,email_alerts)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(user_id) DO UPDATE SET
           egypt_only=EXCLUDED.egypt_only,internships=EXCLUDED.internships,
           max_experience_years=EXCLUDED.max_experience_years,
           role_families=EXCLUDED.role_families,email_alerts=EXCLUDED.email_alerts,updated_at=now()`,
        [userId,body.egypt_only,body.internships,years,body.role_families,body.email_alerts]
      );
      return core.reply(res,200,{ok:true});
    }
    if(scope==='saved'){
      if(req.method==='GET'){
        const rows=await core.query('SELECT job_key,job_snapshot,saved_at FROM public.sj_saved_jobs WHERE user_id=$1 ORDER BY saved_at DESC LIMIT 300',[userId]);
        return core.reply(res,200,{ok:true,jobs:rows});
      }
      const key=jobKey(req.method==='DELETE'?req.query?.key:body.key);
      if(req.method==='DELETE'){
        await core.query('DELETE FROM public.sj_saved_jobs WHERE user_id=$1 AND job_key=$2',[userId,key]);
        return core.reply(res,200,{ok:true});
      }
      if(req.method!=='POST')throw core.fail(405,'Method not allowed');
      const snapshot=jobSnapshot(body.job);
      await core.query(
        `INSERT INTO public.sj_saved_jobs(user_id,job_key,job_snapshot)
         VALUES($1,$2,$3::jsonb)
         ON CONFLICT(user_id,job_key) DO UPDATE SET job_snapshot=EXCLUDED.job_snapshot`,
        [userId,key,jsonText(snapshot)]
      );
      return core.reply(res,201,{ok:true});
    }
    if(scope==='applications'){
      if(req.method==='GET'){
        const rows=await core.query('SELECT id,job_key,company,title,stage,notes,applied_at,updated_at FROM public.sj_applications WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 300',[userId]);
        return core.reply(res,200,{ok:true,applications:rows});
      }
      const key=jobKey(req.method==='DELETE'?req.query?.key:body.key);
      if(req.method==='DELETE'){
        await core.query('DELETE FROM public.sj_applications WHERE user_id=$1 AND job_key=$2',[userId,key]);
        return core.reply(res,200,{ok:true});
      }
      if(!['POST','PUT'].includes(req.method))throw core.fail(405,'Method not allowed');
      const stages=['interested','applied','assessment','interview','offer','rejected','withdrawn'];
      const stage=body.stage||'interested';
      if(!stages.includes(stage))throw core.fail(400,'Invalid application stage');
      const company=core.validateText(body.company||'',180,'Company');
      const title=core.validateText(body.title||'',220,'Job title');
      const notes=core.validateText(body.notes||'',6000,'Notes');
      await core.query(
        `INSERT INTO public.sj_applications(id,user_id,job_key,company,title,stage,notes,applied_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $6='applied' THEN now() ELSE NULL END)
         ON CONFLICT(user_id,job_key) DO UPDATE SET
           stage=EXCLUDED.stage,notes=EXCLUDED.notes,
           company=CASE WHEN EXCLUDED.company='' THEN sj_applications.company ELSE EXCLUDED.company END,
           title=CASE WHEN EXCLUDED.title='' THEN sj_applications.title ELSE EXCLUDED.title END,
           applied_at=COALESCE(sj_applications.applied_at,EXCLUDED.applied_at),
           updated_at=now()`,
        [core.randomUUID(),userId,key,company,title,stage,notes]
      );
      return core.reply(res,200,{ok:true});
    }

    const isCV=scope==='cv';
    const table=isCV?'sj_cv_files':'sj_avatars';
    if(req.method==='GET'){
      const select=isCV?
        'SELECT original_name,mime_type,size_bytes,encode(content,\'base64\') AS base64 FROM public.sj_cv_files WHERE user_id=$1':
        'SELECT mime_type,size_bytes,encode(content,\'base64\') AS base64 FROM public.sj_avatars WHERE user_id=$1';
      const rows=await core.query(select,[userId]);
      return core.reply(res,200,{ok:true,found:Boolean(rows[0]),file:rows[0]||null});
    }
    if(req.method==='DELETE'){
      await core.query('DELETE FROM public.'+table+' WHERE user_id=$1',[userId]);
      return core.reply(res,200,{ok:true});
    }
    if(req.method!=='POST')throw core.fail(405,'Method not allowed');
    const mime=String(body.mime||'');
    const bytes=dataURLToBytes(body.content,isCV?786432:102400,mime,isCV?'CV':'avatar');
    const originalName=isCV?core.validateText(body.name||'resume',200,'File name'):'';
    if(isCV)await core.query(
      `INSERT INTO public.sj_cv_files(user_id,original_name,mime_type,content,size_bytes)
       VALUES($1,$2,$3,decode($4,'base64'),$5)
       ON CONFLICT(user_id) DO UPDATE SET
         original_name=EXCLUDED.original_name,mime_type=EXCLUDED.mime_type,
         content=EXCLUDED.content,size_bytes=EXCLUDED.size_bytes,updated_at=now()`,
      [userId,originalName,mime,bytes.toString('base64'),bytes.length]
    );
    else await core.query(
      `INSERT INTO public.sj_avatars(user_id,mime_type,content,size_bytes)
       VALUES($1,$2,decode($3,'base64'),$4)
       ON CONFLICT(user_id) DO UPDATE SET
         mime_type=EXCLUDED.mime_type,content=EXCLUDED.content,
         size_bytes=EXCLUDED.size_bytes,updated_at=now()`,
      [userId,mime,bytes.toString('base64'),bytes.length]
    );
    return core.reply(res,201,{ok:true,size_bytes:bytes.length});
  }catch(error){return core.safeError(res,error);}
};
