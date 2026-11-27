'use strict';
/** Secret J per-account email confirmation and test delivery.
 * Test codes go to the chosen destination and scheduled alerts go only to
 * destinations verified by this signed-in member. No operator fallback.
 */
const {randomBytes,randomInt,timingSafeEqual}=require('node:crypto');
const core=require('../lib/secretj/core');
const templates=require('../lib/secretj/email-templates');
// Rasterized from the existing Secret J emblem; embedded, not remotely fetched.
const logo={filename:'secret-j.png',content_id:'secretj-logo',content_type:'image/png',content:'iVBORw0KGgoAAAANSUhEUgAAAEQAAABEBAMAAADKPY6BAAAAGFBMVEX////r6+vGxsajo6OQkJCCgoItLS0SEhI4m86PAAAB1UlEQVR42u2Wv2/TQBTHP/dsWHuFZmFyUnWAKQgBayr6B6RIZUei3bvwx8DSpVOlljkIwQ6imWCI1HpuSnNslQi+Dk6J4z7fSZ15iyX7c1+/d+/HnQHAdNrctIvv5UeA5I1Fs+IgB5IAgXn04xISMNsNBJjsGARajQSsdEEwmwTsBQh3bAhJM4THBG0doRtGVpDEhhGxkhCxnizHECs2htxrQrybx60jo0PzdH2WhFRZbez0EP+1nenI2R6Yt58Af7Q7C1t1ZAjwhwAyLcE8gBTlI4S4xRSoGxpHZi+zAJIsiOkqtrrxKsImwGrIF1oZpP0gYnpwPxgROJhEkBx8HCnCiHcVJNVVnlQbUo9oI5Yj4mn8j9wWMbdXcTEVP/qi9WqlGPxgeHfe6qIgxUF+Xaq5/qPifQ5TB1A43V3jAH8EMAJoK0gGMD6G8w9A/VRIHdDNAT/4uOT4t6Ki4oDOwjiuVbyXmy87deQUMP1ayy8iHmCtOjhqI38iUwB5PXeufpoOpRzArWt1s2Xrk1z4DGCevSw1XtUi5i8p5+XqtZ2LyW/ldvELA897gXry75zAt1DJjR0J+PHDZpH9SwQY5Y3EwM1m+c8Hyw3EcF5hq+pF6cQBXAGcJXuPKUi+HQAAAABJRU5ErkJggg=='};

function configured(config=process.env){
  return Boolean(config.RESEND_API_KEY&&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.SECRETJ_EMAIL_FROM||''));
}
async function send(to,subject,text,config=process.env,template=null){
  if(!configured(config))throw core.fail(503,'Email delivery is not configured yet');
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{
      Authorization:'Bearer '+config.RESEND_API_KEY,
      'Content-Type':'application/json',
      ...(config.IDEMPOTENCY_KEY?{'Idempotency-Key':config.IDEMPOTENCY_KEY}:{})
    },
    body:JSON.stringify({
      from:config.SECRETJ_EMAIL_FROM,
      ...(template?.sender?{from:template.sender+' <'+config.SECRETJ_EMAIL_FROM+'>'}:{}),
      to:[to],subject,text,...(template?.html?{html:template.html,attachments:[logo]}:{})
    }),
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Object.assign(core.fail(503,'Email provider did not accept the message'),{providerStatus:response.status});
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
        'SELECT verified_at,last_sent_at,recipient_email,verified_email FROM public.sj_email_verifications WHERE user_id=$1',
        [user.id]
      );
      return core.reply(res,200,{
        ok:true,configured:configured(),
        recipient:rows[0]?.recipient_email||user.email,
        verified:Boolean(rows[0]?.verified_at)&&
          (rows[0]?.verified_email
            ?rows[0].verified_email===(rows[0]?.recipient_email||user.email)
            :(rows[0]?.recipient_email||user.email)===user.email),
        last_test_at:rows[0]?.last_sent_at||null
      });
    }
    if(action==='test'){
      if(!configured())throw core.fail(503,'Email provider not configured');
      const body=core.parseBody(req);
      // Recipient choice is permitted ONLY for a confirmation email.
      // Periodic job alerts require possession of the 6-digit code.
      const recipient=core.cleanEmail(body.recipient_email||user.email);
      const code=String(randomInt(100000,1000000)),salt=randomBytes(16).toString('hex');
      const record=await core.query(
        `INSERT INTO public.sj_email_verifications
           (user_id,recipient_email,code_hash,code_salt,expires_at,attempts,last_sent_at)
         VALUES($1,$4,$2,$3,now()+interval '10 minutes',0,now())
         ON CONFLICT(user_id) DO UPDATE SET
           recipient_email=EXCLUDED.recipient_email,
           verified_at=CASE WHEN
             sj_email_verifications.verified_email=EXCLUDED.recipient_email OR
             (sj_email_verifications.verified_email IS NULL AND
              EXCLUDED.recipient_email=$5)
             THEN sj_email_verifications.verified_at ELSE NULL END,
           verified_email=CASE WHEN
             sj_email_verifications.verified_email=EXCLUDED.recipient_email
             THEN sj_email_verifications.verified_email ELSE NULL END,
           code_hash=EXCLUDED.code_hash,code_salt=EXCLUDED.code_salt,
           expires_at=EXCLUDED.expires_at,attempts=0,last_sent_at=now()
         WHERE sj_email_verifications.last_sent_at IS NULL OR
           sj_email_verifications.last_sent_at<now()-interval '15 minutes'
         RETURNING verified_at`,
        [user.id,core.hash(user.id+':'+code+':'+salt),salt,recipient,user.email]
      );
      if(!record[0])throw core.fail(429,'Please wait 15 minutes before another test email');
      const needsVerification=!record[0].verified_at;
      const message=needsVerification?templates.codeEmail('alert',code):templates.testEmail();
      try{await send(recipient,message.subject,message.text,process.env,message);}
      catch(error){
        // Failed provider calls must not lock an account into cooldown.
        await core.query(
          `UPDATE public.sj_email_verifications
           SET last_sent_at=NULL,code_hash=NULL,code_salt=NULL,expires_at=NULL
           WHERE user_id=$1 AND code_salt=$2`,
          [user.id,salt]
        ).catch(()=>{});
        throw error;
      }
      return core.reply(res,200,{ok:true,delivered_to:recipient,
        needs_verification:needsVerification,
        message:'Email provider accepted the test. Check your inbox.'});
    }
    const body=core.parseBody(req);
    const code=String(body.code||'').trim();
    if(!/^\d{6}$/.test(code))throw core.fail(400,'Enter the six-digit email code');
    const attempt=await core.query(
      `UPDATE public.sj_email_verifications
       SET attempts=attempts+1
       WHERE user_id=$1 AND expires_at>now()
         AND verified_at IS NULL AND attempts<5 AND code_hash IS NOT NULL
       RETURNING code_hash,code_salt,recipient_email`,[user.id]
    );
    if(!attempt[0])throw core.fail(400,'Code expired or too many attempts. Request another email.');
    const digest=core.hash(user.id+':'+code+':'+attempt[0].code_salt);
    if(!matchesHash(digest,attempt[0].code_hash))
      throw core.fail(400,'Incorrect confirmation code');
    await core.query(
      `UPDATE public.sj_email_verifications
       SET verified_at=now(),verified_email=COALESCE(recipient_email,$3),
           code_hash=NULL,code_salt=NULL,expires_at=NULL,attempts=0
       WHERE user_id=$1 AND code_hash=$2`,
      [user.id,digest,user.email]
    );
    return core.reply(res,200,{ok:true,verified:true,
      recipient:attempt[0].recipient_email||user.email});
  }catch(error){return core.safeError(res,error);}
};
module.exports.send=send;

module.exports.configured=configured;
