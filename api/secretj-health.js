'use strict';

/**
 * Public operational check with no connection strings, emails or user data.
 * An empty guest session does not prove Neon is configured.
 */
const core=require('../lib/secretj/core');

module.exports=async function handler(req,res) {
  if(req.method!=='GET')
    return core.reply(res,405,{ok:false,status:'method_not_allowed'});
  if(!process.env.DATABASE_URL)
    return core.reply(res,503,{ok:false,database:'not_configured',
      registration_enabled:false});
  try{
    const rows=await core.query(
      `SELECT COUNT(*)::int AS ready_tables
         FROM information_schema.tables
        WHERE table_schema='public'
          AND table_name IN
            ('sj_users','sj_sessions','sj_profiles','sj_preferences',
             'sj_saved_jobs','sj_applications','sj_cv_files','sj_avatars',
             'sj_auth_attempts','sj_admin_audit')`
    );
    if(Number(rows[0]?.ready_tables)!==10)
      return core.reply(res,503,{ok:false,database:'migration_required',
        registration_enabled:false});
    return core.reply(res,200,{ok:true,database:'ready',
      registration_enabled:process.env.SECRETJ_REGISTRATION_ENABLED==='true'});
  }catch{
    return core.reply(res,503,{ok:false,database:'connection_failed',
      registration_enabled:false});
  }
};
