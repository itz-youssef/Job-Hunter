'use strict';
const core=require('../lib/secretj/core'), B=require('../lib/secretj/botfolio');
const idOf=v=>{if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))throw core.fail(404,'Bot not found');return v;};
const fields='id,name,headline,published,created_at,updated_at';
const valid=(v,n,label)=>core.validateText(v||'',n,label);
const publicMeta=row=>({id:row.id,name:row.name,headline:row.headline});
async function getPublic(id,withKnowledge=false){
 const rows=await core.query('SELECT '+(withKnowledge?'b.id,b.name,b.headline,b.knowledge,b.embedding_model,b.updated_at,b.user_id,u.role AS owner_role':'b.id,b.name,b.headline')+' FROM public.sj_botfolio_bots b JOIN public.sj_users u ON u.id=b.user_id WHERE b.id=$1 AND b.published=true AND u.is_active=true LIMIT 1',[id]);
 if(!rows.length)throw core.fail(404,'This portfolio is unavailable.');
 return rows[0];
}
module.exports=async function(req,res){
 let phase='request';
 try{
  core.allowedMethod(req,['GET','POST','PATCH','DELETE']);
  const action=req.query?.action||'list',method=req.method;
  if(action==='public'&&method==='GET')return core.reply(res,200,{ok:true,bot:publicMeta(await getPublic(idOf(req.query?.id)))});
  if(action==='chat'&&method==='POST'){
   const body=core.parseBody(req),bot=await getPublic(idOf(body.id),true);
   const message=valid(body.message,900,'Question');if(!message)throw core.fail(400,'Enter a question.');
   if(bot.embedding_model!==B.EMBED_MODEL)throw core.fail(503,'This portfolio needs to be re-indexed.');
   const ip=String(req.headers?.['x-forwarded-for']||'unknown').slice(0,100);
   phase='reserve-chat';
   const adminOwned=bot.owner_role==='admin';
   const viewer=adminOwned?await core.userForRequest(req):null;
   const adminOwner=adminOwned&&viewer?.role==='admin'&&viewer.id===bot.user_id;
   if(!adminOwner)await B.consume('ip:'+core.hash(ip),1,B.MAX_IP_CHATS);
   await B.consumeOwnerChat(bot.user_id,adminOwned);
   phase='answer';
   const answer=await B.answer(req.env,bot,message,body.history);
   return core.reply(res,200,{ok:true,answer});
  }
  phase='authentication';
  const user=await core.requireUser(req),uid=user.id,isAdmin=user.role==='admin';
  if(action==='list'&&method==='GET'){
   phase='list';
   const rows=await core.query('SELECT '+fields+' FROM public.sj_botfolio_bots WHERE user_id=$1 ORDER BY created_at DESC',[uid]);
   return core.reply(res,200,{ok:true,bots:rows,ai_ready:B.ready(req.env),limits:{max_bots:isAdmin?null:B.MAX_BOTS,daily_messages:isAdmin?null:B.MAX_BOT_CHATS}});
  }
  if(action==='create'&&method==='POST'){
   const body=core.parseBody(req),name=valid(body.name,100,'Bot name'),headline=valid(body.headline,220,'Headline');
   if(!name)throw core.fail(400,'Enter a name.');
   if(body.reviewed!==true)throw core.fail(400,'Review and approve the knowledge before indexing.');
   if(typeof body.knowledge!=='string'||body.knowledge.length>B.MAX_CV)throw core.fail(400,'CV text is invalid or too long.');
   phase='validate-create';
   const chunks=B.splitText(body.knowledge),ai=B.getAI(req.env);
   phase='check-capacity';
   const free=await core.query('SELECT count(*)::int AS n FROM public.sj_botfolio_bots WHERE user_id=$1',[uid]);
   if(!isAdmin&&Number(free[0]?.n)>=B.MAX_BOTS)throw core.fail(409,'Your account can have one portfolio. Delete your existing portfolio before creating another.');
   phase='reserve-indexing';
   await B.consume('create:'+uid,1,isAdmin?null:B.MAX_INDEX_ATTEMPTS);
   phase='embedding';
   const vectors=await B.embed(ai,chunks),knowledge=chunks.map((text,i)=>({text,vector:vectors[i]}));
   phase='save-draft';
   const rows=await core.query(`INSERT INTO public.sj_botfolio_bots(id,user_id,slot,name,headline,knowledge,embedding_model,published) SELECT $1::uuid,$2::uuid,CASE WHEN u.role='admin' THEN COALESCE((SELECT max(slot) FROM public.sj_botfolio_bots WHERE user_id=u.id),0)+1 ELSE 1 END,$3::text,$4::text,$5::jsonb,$6::text,false FROM public.sj_users u WHERE u.id=$2::uuid AND u.is_active=true AND (u.role='admin' OR NOT EXISTS (SELECT 1 FROM public.sj_botfolio_bots WHERE user_id=u.id)) ON CONFLICT(user_id,slot) DO NOTHING RETURNING `+fields,[core.randomUUID(),uid,name,headline,JSON.stringify(knowledge),B.EMBED_MODEL]);
   if(!rows.length)throw core.fail(409,isAdmin?'Another portfolio was created at the same time. Please retry.':'Your account already has a portfolio.');
   return core.reply(res,201,{ok:true,bot:rows[0]});
  }
  if(action==='publish'&&method==='PATCH'){
   const body=core.parseBody(req);if(typeof body.published!=='boolean'||(body.published&&body.consent!==true))throw core.fail(400,'Confirm public sharing before publishing.');
   const rows=await core.query('UPDATE public.sj_botfolio_bots SET published=$3,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING '+fields,[idOf(body.id),uid,body.published]);
   if(!rows.length)throw core.fail(404,'Bot not found.');
   return core.reply(res,200,{ok:true,bot:rows[0]});
  }
  if(action==='delete'&&method==='DELETE'){
   const rows=await core.query('DELETE FROM public.sj_botfolio_bots WHERE id=$1 AND user_id=$2 RETURNING id',[idOf(req.query?.id),uid]);
   if(!rows.length)throw core.fail(404,'Bot not found.');
   return core.reply(res,200,{ok:true});
  }
  throw core.fail(405,'Unknown Botfolio action.');
 }catch(error){
  // Log only a fixed phase and an allowlisted SQLSTATE format, never request contents or provider/DB error messages.
  if(!error?.status||error.status>=500){const code=typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:'unknown';console.warn('botfolio request failed',{phase,code});}
  if(phase==='save-draft'&&error?.code==='23514')return core.reply(res,503,{ok:false,error:'Portfolio capacity upgrade is not installed yet.'});
  if(error?.code==='42P01')return core.reply(res,503,{ok:false,error:'Botfolio storage is not ready.'});return core.safeError(res,error);
 }
};
