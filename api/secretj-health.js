'use strict';

/**
 * Production-safe Cloudflare/Neon diagnostics.
 * Never return the connection string, host, username, passwords, SQL text,
 * database driver error messages or the underlying exception.
 */
const core=require('../lib/secretj/core');

function inspectConnectionString(value) {
  if(typeof value!=='string'||value.trim()==='')return 'not_configured';
  const trimmed=value.trim();
  if(!/^postgres(?:ql)?:\/\//i.test(trimmed))return 'invalid_format';
  try{
    const url=new URL(trimmed);
    if(!url.hostname||!url.username||!url.password)return 'invalid_credentials_format';
    if(/\*{3,}|%2a(?:%2a){2,}/i.test(url.password))return 'redacted_password';
    if(!url.pathname||url.pathname==='/')return 'missing_database_name';
    return 'valid';
  }catch{return 'invalid_format';}
}
function classifyConnectionFailure(error) {
  const code=String(error?.code||'').toUpperCase();
  const name=String(error?.name||'');
  // Inspect exception messages only internally, never return the message.
  const message=String(error?.message||'').toLowerCase();
  if(code==='28P01'||/password authentication failed|invalid password|authentication failed/.test(message))
    return 'invalid_credentials';
  if(code==='3D000'||/database .* does not exist/.test(message))return 'database_not_found';
  if(code==='42501'||/permission denied|insufficient privilege/.test(message))return 'permission_denied';
  if(code==='ENOTFOUND'||code==='EAI_AGAIN'||/dns|name resolution/.test(message))
    return 'dns_error';
  if(code==='ETIMEDOUT'||code==='ESOCKETTIMEDOUT'||/timed? ?out/.test(message))
    return 'timeout';
  if(/fetch failed|network|connect econn|connection refused|websocket/.test(message))
    return 'network_error';
  if(/cannot find module|require is not defined|module not found|unsupported|node:/.test(message))
    return 'runtime_incompatible';
  if(name==='NeonDbError'||/neon\/v2|neon-http/.test(message))
    return 'neon_query_error';
  return 'query_failed';
}

module.exports=async function handler(req,res) {
  if(req.method!=='GET')
    return core.reply(res,405,{ok:false,status:'method_not_allowed'});
  const format=inspectConnectionString(process.env.DATABASE_URL);
  if(format!=='valid')
    return core.reply(res,503,{ok:false,database:format==='not_configured'?'not_configured':'invalid_connection_string',
      reason:format,registration_enabled:false});
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
      registration_enabled:process.env.SECRETJ_REGISTRATION_ENABLED==='true',
      email:{configured:require('./secretj-email').configured(),
        alerts_enabled:process.env.SECRETJ_ALERTS_ENABLED==='true'}});
  }catch(error){
    const reason=classifyConnectionFailure(error);
    console.warn('Secret J Neon health query failed', {reason});
    return core.reply(res,503,{ok:false,database:'connection_failed',
      reason,registration_enabled:false});
  }
};

module.exports.inspectConnectionString=inspectConnectionString;
module.exports.classifyConnectionFailure=classifyConnectionFailure;
