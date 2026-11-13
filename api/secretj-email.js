'use strict';
/** Secret J per-account email confirmation and test delivery.
 * Server sends only to the authenticated account email, never to an operator
 * address or to a client-provided recipient. No SMTP secrets reach the browser.
 */
const {randomBytes,randomInt,timingSafeEqual}=require('node:crypto');
const core=require('../lib/secretj/core');
const RATE_MINUTES=15;
function configured(){
  return Boolean(process.env.RESEND_API_KEY&&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(process.env.SECRETJ_EMAIL_FROM||''));
}
async function send(to,subject,text){
  if(!configured())throw core.fail(503,'Email delivery is not configured yet');
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{
      Authorization:'Bearer '+process.env.RESEND_API_KEY,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      from:process.env.SECRETJ_EMAIL_FROM,
      to:[to],subject,text
    }),
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw core.fail(503,'Email provider did not accept the message');
  return true;
}
function matchesHash(a,b){
  if(!/^[a-f0-9]{64}$/.test(String(a||''))||!/^[a-f0-9]{64}$/.test(String(b||'')))return false;
  return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
module.exports=async function handler(req,res){
  try{
    core.allowedMethod(req,['GET','POST']);
    const action=req.query?.action||'status';
    if(!['status','test','verify'].includes(action))throw core.fail(404,'Unknown email action');
    if((req.method==='GET')!==(action==='status'))throw core.fail(405,'Method not allowed');
    const user=await core.requireUser(req);
    if(action==='status'){
      const rows=await core.query(
        'SELECT verified_at,last_sent_at FROM public.sj_email_verifications WHERE user_id=$1',
        [user.id]
      );
      return core.reply(res,200,{
        ok:true,configured:configured(),
        recipient:user.email,verified:Boolean(rows[0]?.verified_at),
        last_test_at:rows[0]?.last_sent_at||null
      });
    }
    if(action==='test'){
      if(!configured())throw core.fail(503,'Email provider not configured');
      const code=String(randomInt(100000,999999)),salt=randomBytes(16).toString('hex');
      const record=await core.query(
        `INSERT INTO public.sj_email_verifications
           (user_id,code_hash,code_salt,expires_at,attempts,last_sent_at)
         VALUES($1,$2,$3,now()+interval '10 minutes',0,now())
         ON CONFLICT(user_id) DO UPDATE SET
           code_hash=EXCLUDED.code_hash,code_salt=EXCLUDED.code_salt,
           expires_at=EXCLUDED.expires_at,attempts=0,last_sent_at=now()
         WHERE sj_email_verifications.last_sent_at IS NULL OR
           sj_email_verifications.last_sent_at<now()-interval '15 minutes'
         RETURNING verified_at`,
        [user.id,core.hash(user.id+':'+code+':'+salt),salt]
      );
      if(!record[0])throw core.fail(429,'Please wait 15 minutes before another test email');
      const needsVerification=!record[0].verified_at;
      const subject=needsVerification?'Secret J: Confirm your email':'Secret J: Test alert delivered';
      const text=needsVerification?
        'Your Secret J verification and test email is working.\n\nConfirmation code: '+code+
        '\n\nEnter this code in your Secret J account within 10 minutes. If you did not request it, ignore this message.':
        'Your Secret J test email reached the address associated with your account.\n\n'+
        'Job alerts are sent only if you have opted in and your email is verified.';
      try{await send(user.email,subject,text);}
      catch(error){
        // A failed send must not block the user from retrying for 15 minutes.
        await core.query(
          `UPDATE public.sj_email_verifications
           SET last_sent_at=NULL,code_hash=NULL,code_salt=NULL,expires_at=NULL
           WHERE user_id=$1 AND code_salt=$2`,
          [user.id,salt]
        ).catch(()=>{});
        throw error;
      }
      return core.reply(res,200,{ok:true,delivered_to:user.email,
        needs_verification:needsVerification,
        message:'Test email accepted by provider. Check your inbox.'});
    }
    const body=core.parseBody(req);
    const code=String(body.code||'').trim();
    if(!/^\d{6}$/.test(code))throw core.fail(400,'Enter the six-digit email code');
    const attempt=await core.query(
      `UPDATE public.sj_email_verifications
       SET attempts=attempts+1
       WHERE user_id=$1 AND expires_at>now()
         AND verified_at IS NULL AND attempts<5 AND code_hash IS NOT NULL
       RETURNING code_hash,code_salt`,[user.id]
    );
    if(!attempt[0])throw core.fail(400,'Code expired or too many attempts. Request another email.');
    const digest=core.hash(user.id+':'+code+':'+attempt[0].code_salt);
    if(!matchesHash(digest,attempt[0].code_hash))
      throw core.fail(400,'Incorrect confirmation code');
    await core.query(
      `UPDATE public.sj_email_verifications
       SET verified_at=now(),code_hash=NULL,code_salt=NULL,expires_at=NULL,
           attempts=0
       WHERE user_id=$1 AND code_hash=$2`,
      [user.id,digest]
    );
    return core.reply(res,200,{ok:true,verified:true,recipient:user.email});
  }catch(error){return core.safeError(res,error);}
};
module.exports.send=send;
