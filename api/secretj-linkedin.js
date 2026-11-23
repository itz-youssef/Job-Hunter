'use strict';

/**
 * LinkedIn OIDC CONNECT (not a login provider).
 * Requests only openid/profile/email. LinkedIn's restricted APIs for
 * education, employment history and certifications are NOT used.
 * The authorization code/access token remain transient server-side secrets.
 */
const {randomBytes}=require('node:crypto');
const core=require('../lib/secretj/core');
const AUTHORIZE='https://www.linkedin.com/oauth/v2/authorization';
const TOKEN='https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO='https://api.linkedin.com/v2/userinfo';
const CALLBACK='https://www.jobsnow.tech/api/secretj-linkedin?action=callback';
const RETURN_OK='/account.html?view=profile&linkedin=connected';
const RETURN_FAIL='/account.html?view=profile&linkedin=error';

function settings(req){
  // Cloudflare bindings are supplied directly by the Worker. Node.js
  // process.env remains supported for local/Vercel execution and tests.
  const env=req?.env||process.env;
  return {
    id:env.LINKEDIN_CLIENT_ID,
    secret:env.LINKEDIN_CLIENT_SECRET,
    redirect:env.LINKEDIN_REDIRECT_URI||CALLBACK
  };
}
function setupIssues(options){
  const issues=[];
  if(typeof options.id!=='string'||!options.id.trim())issues.push('LINKEDIN_CLIENT_ID_missing');
  if(typeof options.secret!=='string'||!options.secret.trim())issues.push('LINKEDIN_CLIENT_SECRET_missing');
  if(options.redirect!==CALLBACK)issues.push('LINKEDIN_REDIRECT_URI_mismatch');
  return issues;
}
function configured(options){
  return setupIssues(options).length===0;
}
function redirect(res,path){
  res.statusCode=302;
  res.setHeader('Location',path);
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.end('');
}
function text(value,max=200){
  return typeof value==='string'?value.trim().slice(0,max):'';
}
function safePicture(input){
  if(typeof input!=='string'||input.length>2000)return null;
  try{
    const u=new URL(input);
    const host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password)return null;
    if(!['licdn.com','licdn-ei.com','licdn-static.com'].some(domain=>
      host===domain||host.endsWith('.'+domain)))return null;
    return u.href;
  }catch{return null;}
}
async function exchangeCode(code,options){
  const request=new URLSearchParams({
    grant_type:'authorization_code',
    code,
    redirect_uri:CALLBACK,
    client_id:options.id,
    client_secret:options.secret
  });
  const tokenResponse=await fetch(TOKEN,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:request,signal:AbortSignal.timeout(12000)
  });
  if(!tokenResponse.ok)throw core.fail(502,'LinkedIn token exchange failed');
  const token=await tokenResponse.json();
  if(typeof token.access_token!=='string'||!token.access_token)throw core.fail(502,'LinkedIn returned no access token');
  const infoResponse=await fetch(USERINFO,{
    headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'},
    signal:AbortSignal.timeout(12000)
  });
  if(!infoResponse.ok)throw core.fail(502,'LinkedIn profile request failed');
  const profile=await infoResponse.json();
  const sub=text(profile.sub,300);
  if(!sub)throw core.fail(502,'LinkedIn did not return a subject identifier');
  return {
    subject:sub,
    name:text(profile.name,200),
    email:typeof profile.email==='string'&&profile.email.length<=254
      ?profile.email.toLowerCase():null,
    picture:safePicture(profile.picture)
  };
}

module.exports=async function handler(req,res){
  const action=req.query?.action||'status';
  const options=settings(req);
  try{
    core.allowedMethod(req,['GET','POST']);
    if(req.method==='POST'&&action!=='disconnect')throw core.fail(405,'Method not allowed');
    if(req.method==='GET'&&!['status','start','callback'].includes(action))
      throw core.fail(404,'Unknown action');
    const user=await core.requireUser(req);
    if(action==='status'){
      const enabled=configured(options);
      let rows=[],schemaReady=true;
      if(enabled){
        try{
          rows=await core.query(
            `SELECT full_name,provider_email,picture_url,connected_at
               FROM public.sj_linkedin_connections WHERE user_id=$1`,
            [user.id]
          );
        }catch(error){
          // 42P01: undefined_table. No secrets or SQL details are returned.
          if(error?.code!=='42P01')throw error;
          schemaReady=false;
        }
      }
      return core.reply(res,200,{
        ok:true,configured:enabled,connected:Boolean(rows[0]),
        connection:rows[0]||null,
        // Only enum-like setup codes; never expose IDs, secret values or actual redirects.
        setup_issues:[...setupIssues(options),...(schemaReady?[]:['LINKEDIN_DATABASE_MIGRATION_REQUIRED'])]
      });
    }
    if(action==='disconnect'){
      await core.query(
        'DELETE FROM public.sj_linkedin_connections WHERE user_id=$1',
        [user.id]
      );
      return core.reply(res,200,{ok:true,connected:false});
    }
    if(!configured(options))throw core.fail(503,'LinkedIn connection is not configured on the server');
    if(action==='start'){
      // A missing schema must be reported before redirecting users to LinkedIn.
      try{
        await core.query('SELECT 1 FROM public.sj_linkedin_oauth_states LIMIT 0');
        await core.query('SELECT 1 FROM public.sj_linkedin_connections LIMIT 0');
      }catch(error){
        if(error?.code==='42P01')throw core.fail(503,'LinkedIn database migration 002 is required');
        throw error;
      }
      const state=randomBytes(32).toString('base64url');
      await core.query('DELETE FROM public.sj_linkedin_oauth_states WHERE expires_at<now()');
      await core.query(
        `INSERT INTO public.sj_linkedin_oauth_states(state_hash,user_id,expires_at)
         VALUES($1,$2,now()+interval '10 minutes')`,
        [core.hash(state),user.id]
      );
      const request=new URL(AUTHORIZE);
      request.searchParams.set('response_type','code');
      request.searchParams.set('client_id',options.id);
      request.searchParams.set('redirect_uri',CALLBACK);
      request.searchParams.set('scope','openid profile email');
      request.searchParams.set('state',state);
      return redirect(res,request.href);
    }

    if(req.query?.error){
      return redirect(res,RETURN_FAIL);
    }
    const state=req.query?.state;
    const code=req.query?.code;
    if(typeof state!=='string'||typeof code!=='string'||
       !/^[A-Za-z0-9_-]{40,60}$/.test(state)||
       code.length<4||code.length>2048)
      throw core.fail(400,'Invalid LinkedIn authorization response');
    // An expiring, single-use state binds this callback to the logged-in user.
    const ownership=await core.query(
      `DELETE FROM public.sj_linkedin_oauth_states
       WHERE state_hash=$1 AND user_id=$2 AND expires_at>now()
       RETURNING user_id`,
      [core.hash(state),user.id]
    );
    if(!ownership[0])throw core.fail(403,'LinkedIn authorization expired or not owned by this user');

    const profile=await exchangeCode(code,options);
    // Preserve manually edited profile fields. Never overwrite the account's
    // login email or alert destination with the LinkedIn provider email.
    await core.query(
      `WITH linked AS (
          INSERT INTO public.sj_linkedin_connections
            (user_id,provider_subject,full_name,provider_email,picture_url)
          VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(user_id) DO UPDATE SET
            provider_subject=EXCLUDED.provider_subject,full_name=EXCLUDED.full_name,
            provider_email=EXCLUDED.provider_email,picture_url=EXCLUDED.picture_url,
            connected_at=now()
          RETURNING user_id
        ), imported AS (
          INSERT INTO public.sj_profiles(user_id,display_name)
          SELECT user_id,$3 FROM linked
          ON CONFLICT(user_id) DO UPDATE SET
            display_name=CASE WHEN length(trim(sj_profiles.display_name))=0
              THEN EXCLUDED.display_name ELSE sj_profiles.display_name END,
            updated_at=now()
          RETURNING user_id
        ) SELECT user_id FROM imported`,
      [user.id,profile.subject,profile.name,profile.email,profile.picture]
    );
    return redirect(res,RETURN_OK);
  }catch(error){
    if(action==='callback')return redirect(res,RETURN_FAIL);
    return core.safeError(res,error);
  }
};
