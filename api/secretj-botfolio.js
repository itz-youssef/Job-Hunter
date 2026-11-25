'use strict';
const core=require('../lib/secretj/core'), B=require('../lib/secretj/botfolio');
const idOf=v=>{if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))throw core.fail(404,'Bot not found');return v;};
const fields='id,name,headline,published,created_at,updated_at';
const valid=(v,n,label)=>core.validateText(v||'',n,label);
const publicMeta=row=>({id:row.id,name:row.name,headline:row.headline});
async function getPublic(id,withKnowledge=false){
 const rows=await core.query('SELECT '+(withKnowledge?'b.id,b.name,b.headline,b.knowledge,b.embedding_model,b.updated_at':'b.id,b.name,b.headline')+' FROM public.sj_botfolio_bots b JOIN public.sj_users u ON u.id=b.user_id WHERE b.id=$1 AND b.published=true AND u.is_active=true LIMIT 1',[id]);
 if(!rows.length)throw core.fail(404,'This portfolio is unavailable.');
 return rows[0];
}
module.exports=async function(req,res){
 try{
  core.allowedMethod(req,['GET','POST','PATCH','DELETE']);
  const action=req.query?.action||'list',method=req.method;
  if(action==='public'&&method==='GET')return core.reply(res,200,{ok:true,bot:publicMeta(await getPublic(idOf(req.query?.id)))});
  if(action==='chat'&&method==='POST'){
   const body=core.parseBody(req),bot=await getPublic(idOf(body.id),true);
   const message=valid(body.message,900,'Question');if(!message)throw core.fail(400,'Enter a question.');
   if(bot.embedding_model!==B.EMBED_MODEL)throw core.fail(503,'This portfolio needs to be re-indexed.');
   const ip=String(req.headers?.['x-forwarded-for']||'unknown').slice(0,100);
   await B.consume('ip:'+core.hash(ip),1,B.MAX_IP_CHATS);await B.consume('bot:'+bot.id,1,B.MAX_BOT_CHATS);
   const answer=await B.answer(req.env,bot,message,body.history);
   return core.reply(res,200,{ok:true,answer});
  }
  const user=await core.requireUser(req),uid=user.id;
  if(action==='list'&&method==='GET'){
   const rows=await core.query('SELECT '+fields+' FROM public.sj_botfolio_bots WHERE user_id=$1 ORDER BY created_at DESC',[uid]);
   return core.reply(res,200,{ok:true,bots:rows,ai_ready:B.ready(req.env)});
  }
  if(action==='create'&&method==='POST'){
   const body=core.parseBody(req),name=valid(body.name,100,'Bot name'),headline=valid(body.headline,220,'Headline');
   if(!name)throw core.fail(400,'Enter a name.');
   if(body.reviewed!==true)throw core.fail(400,'Review and approve the knowledge before indexing.');
   if(typeof body.knowledge!=='string'||body.knowledge.length>B.MAX_CV)throw core.fail(400,'CV text is invalid or too long.');
   const chunks=B.splitText(body.knowledge),ai=B.getAI(req.env);
   const free=await core.query('SELECT count(*)::int AS n FROM public.sj_botfolio_bots WHERE user_id=$1',[uid]);
   if(Number(free[0]?.n)>=B.MAX_BOTS)throw core.fail(409,'You can create up to 5 portfolios in this pilot.');
   await B.consume('create:'+uid,1,B.MAX_INDEX_ATTEMPTS);
   const vectors=await B.embed(ai,chunks),knowledge=chunks.map((text,i)=>({text,vector:vectors[i]}));
   const rows=await core.query('INSERT INTO public.sj_botfolio_bots(id,user_id,slot,name,headline,knowledge,embedding_model,published) SELECT $1,$2,s,$3,$4,$5::jsonb,$6,false FROM generate_series(1,5) s WHERE NOT EXISTS (SELECT 1 FROM public.sj_botfolio_bots WHERE user_id=$2 AND slot=s) ORDER BY s LIMIT 1 RETURNING '+fields,[core.randomUUID(),uid,name,headline,JSON.stringify(knowledge),B.EMBED_MODEL]);
   if(!rows.length)throw core.fail(409,'Portfolio limit reached.');
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
 }catch(error){if(error?.code==='42P01')return core.reply(res,503,{ok:false,error:'Botfolio storage is not ready.'});return core.safeError(res,error);}
};
