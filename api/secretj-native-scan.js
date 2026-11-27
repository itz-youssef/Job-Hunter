'use strict';
/**
 * POST /api/secretj-native-scan
 * Authenticate the account, atomically acquire an account-specific lease,
 * then immediately run its own employer-source scan using Workers waitUntil.
 * Never rely on user-provided account IDs or background work after response
 * unless the Cloudflare execution context explicitly accepts waitUntil.
 */
const core=require('../lib/secretj/core');
const monitor=require('../lib/secretj/native-preference-monitor');
const isolated=require('../lib/secretj/isolated-read-routing');
function createImmediateHandler(env,ctx){
 return async function immediateHandler(req,res){
  try{
   core.allowedMethod(req,['POST']);
   const user=await core.requireUser(req);
   if((env.SECRETJ_NATIVE_MONITOR_ENABLED??process.env.SECRETJ_NATIVE_MONITOR_ENABLED)!=='true')
     throw core.fail(503,'Personalized source monitoring is disabled');
   if(typeof ctx?.waitUntil!=='function')
     throw core.fail(503,'Immediate background scanning is unavailable');
   const saved=await core.query(
    'SELECT 1 FROM public.sj_preferences WHERE user_id=$1 LIMIT 1',[user.id]);
   if(!saved.length)throw core.fail(409,'Save job preferences first');
   const claimed=await core.query(
    `INSERT INTO public.sj_native_scan_requests
       (user_id,status,started_at,completed_at,last_error)
       VALUES ($1,'running',now(),NULL,NULL)
       ON CONFLICT(user_id) DO UPDATE SET
         status='running',started_at=now(),completed_at=NULL,last_error=NULL
       WHERE sj_native_scan_requests.status<>'running'
          OR sj_native_scan_requests.started_at < now()-interval '2 minutes'
       RETURNING started_at`,[user.id]);
   if(!claimed.length)
     return core.reply(res,202,{ok:true,status:'already_running',
       message:'A source scan is already in progress for this account'});
   const task=(async()=>{
     let result;
     try{
       result=await monitor.scanOneUser(env,user.id);
       const complete=result.status==='processed';
       await core.query(
        `UPDATE public.sj_native_scan_requests SET
          status=$2,completed_at=now(),last_error=$3
          WHERE user_id=$1 AND started_at=$4`,
        [user.id,complete?'complete':'failed',
         complete?null:String(result.status||'source data unavailable').slice(0,180),
         claimed[0].started_at]);
       if(complete)await isolated.syncAfterWrite('jobHunter',env,user.id);
     }catch(error){
       // Log no identity, preferences, URL, API keys or private job records.
       await core.query(
         `UPDATE public.sj_native_scan_requests SET
           status='failed',completed_at=now(),last_error=$2
           WHERE user_id=$1 AND started_at=$3`,
         [user.id,'Source scan could not be completed',claimed[0].started_at]
       ).catch(()=>{});
     }
   })();
   ctx.waitUntil(task);
   return core.reply(res,202,{ok:true,status:'started',
     message:'Immediate company-source scan started for your saved preferences'});
  }catch(error){return core.safeError(res,error);}
 };
}
module.exports={createImmediateHandler};
