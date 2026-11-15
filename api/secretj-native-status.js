'use strict';
/** Private subscriber-only status; no cross-account access or exposed preferences. */
const core=require('../lib/secretj/core');
module.exports=async function handler(req,res){
 try{
  core.allowedMethod(req,['GET']);
  const user=await core.requireUser(req);
  const state=await core.query(
    'SELECT initialized_at,updated_at FROM public.sj_native_watch_state WHERE user_id=$1',
    [user.id]);
  const counters=await core.query(
    `SELECT status,count(*)::int AS count FROM public.sj_native_watch_jobs
      WHERE user_id=$1 GROUP BY status`,[user.id]);
  const counts={baseline:0,pending:0,sent:0,failed:0};
  for(const row of counters)if(Object.hasOwn(counts,row.status))counts[row.status]=Number(row.count)||0;
  return core.reply(res,200,{ok:true,monitor:'company-native-first',
    configured:state.length>0,initialized_at:state[0]?.initialized_at||null,
    last_preference_reset_at:state[0]?.updated_at||null,counts,
    note:'Only native-query supported sources use employer API filters. Other sources rely on explicit fallback classification.'});
 }catch(error){return core.handleError(res,error);}
};
