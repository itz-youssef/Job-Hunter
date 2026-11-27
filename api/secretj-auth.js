'use strict';

/**
 * Account login with email verification before creating a session cookie.
 * No plaintext code or bearer challenge is stored in Neon.
 */
const {randomBytes,randomInt,timingSafeEqual}=require('node:crypto');
const core=require('../lib/secretj/core');
const emailService=require('./secretj-email');
const {removeMember}=require('../lib/secretj/account-deletion');
const CODE_LIFETIME_MINUTES=10;
const challengePattern=/^[A-Za-z0-9_-]{42,44}$/;
const codePattern=/^\d{6}$/;
const tokenHash=token=>core.hash('secretj-login-challenge:'+token);
const codeDigest=(token,code,salt)=>core.hash('secretj-login-otp:'+token+':'+code+':'+salt);
const signupTokenHash=token=>core.hash('secretj-signup-challenge:'+token);
const signupCodeDigest=(token,code,salt)=>core.hash('secretj-signup-otp:'+token+':'+code+':'+salt);
async function dispatchSignupCode(to,code){
  await emailService.send(to,'Secret J: Verify your new account',
    'Your Secret J account verification code is: '+code+
    '\\n\\nThis code expires in 10 minutes. Never share it. If you did not create this account, ignore this message.');
}
function equalHash(a,b){
  return /^[a-f0-9]{64}$/.test(String(a||''))&&/^[a-f0-9]{64}$/.test(String(b||''))&&
    timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function requireEmailDelivery(){
  if(!emailService.configured())
    throw core.fail(503,'Email sign-in verification is not configured. Please contact support.');
}
async function dispatchCode(to,code){
  await emailService.send(to,'Secret J: Your sign-in verification code',
    'Your Secret J sign-in code is: '+code+
    '\n\nThis code expires in '+CODE_LIFETIME_MINUTES+
    ' minutes. Never share it with anyone. If you did not try to sign in, ignore this message.');
}
module.exports=async function handler(req,res){
  try{
    core.allowedMethod(req,['GET','POST']);
    const action=req.query?.action||(req.method==='GET'?'session':'');
    if(req.method==='GET'){
      if(action!=='session')throw core.fail(404,'Unknown action');
      const user=await core.userForRequest(req);
      return core.reply(res,200,{ok:true,user:user?core.publicUser(user):null});
    }
    if(action==='logout'){
      const token=core.cookies(req).sj_session;
      if(token&&/^[A-Za-z0-9_-]{40,60}$/.test(token))
        await core.query('DELETE FROM public.sj_sessions WHERE token_hash=$1',[core.hash(token)]);
      res.setHeader('Set-Cookie',core.sessionCookie('',true));
      return core.reply(res,200,{ok:true});
    }
    if(action==='delete-account'){
      const user=await core.requireUser(req);
      if(user.role!=='member')throw core.fail(403,'Administrator accounts cannot self-delete');
      const body=core.parseBody(req);
      if(body.confirm!=='DELETE'||typeof body.password!=='string')
        throw core.fail(400,'Enter DELETE and your current password to confirm');
      await core.allowAuthAttempt(req,user.email);
      const rows=await core.query('SELECT password_hash FROM public.sj_users WHERE id=$1 AND is_active=true LIMIT 1',[user.id]);
      if(!rows[0]||!(await core.checkPassword(body.password,rows[0].password_hash)))
        throw core.fail(401,'Current password is incorrect');
      if(!(await removeMember(user.id)))throw core.fail(409,'Account could not be deleted');
      res.setHeader('Set-Cookie',core.sessionCookie('',true));
      return core.reply(res,200,{ok:true,deleted:true});
    }
    if(action==='verify-signup'){
      const body=core.parseBody(req);
      const challenge=String(body.challenge||'');
      const code=String(body.code||'').trim();
      if(!challengePattern.test(challenge)||!codePattern.test(code))
        throw core.fail(400,'Invalid or expired verification code');
      const rows=await core.query(
        `UPDATE public.sj_registration_challenges SET attempts=attempts+1
         WHERE token_hash=$1 AND expires_at>now() AND attempts<5
         RETURNING code_hash,code_salt`,
        [signupTokenHash(challenge)]);
      if(!rows[0])throw core.fail(400,'Code expired or too many attempts. Sign up again.');
      const digest=signupCodeDigest(challenge,code,rows[0].code_salt);
      if(!equalHash(digest,rows[0].code_hash))throw core.fail(400,'Incorrect verification code');
      // Atomic consume -> account creation -> profile, preventing code replay.
      const created=await core.query(
        `WITH consumed AS (
           DELETE FROM public.sj_registration_challenges
           WHERE token_hash=$1 AND code_hash=$2 AND expires_at>now()
           RETURNING email,password_hash,display_name,terms_version,privacy_version
         ), created AS (
           INSERT INTO public.sj_users(id,email,password_hash,terms_accepted_at,terms_version,privacy_version)
           SELECT $3,email,password_hash,now(),terms_version,privacy_version FROM consumed
           ON CONFLICT(email) DO NOTHING RETURNING id,email,role
         ), profile AS (
           INSERT INTO public.sj_profiles(user_id,display_name)
           SELECT created.id,consumed.display_name FROM created CROSS JOIN consumed
           RETURNING user_id
         )
         SELECT created.id,created.email,created.role
         FROM created JOIN profile ON profile.user_id=created.id`,
        [signupTokenHash(challenge),digest,core.randomUUID()]);
      if(!created[0])throw core.fail(409,'Account verification expired or email already registered');
      await core.issueSession(res,created[0].id);
      return core.reply(res,201,{ok:true,user:core.publicUser(created[0])});
    }
    if(action==='resend-signup'){
      requireEmailDelivery();
      const challenge=String(core.parseBody(req).challenge||'');
      if(!challengePattern.test(challenge))throw core.fail(400,'Invalid registration challenge');
      const code=String(randomInt(100000,1000000)),salt=randomBytes(16).toString('hex');
      const digest=signupCodeDigest(challenge,code,salt);
      const rows=await core.query(
        `UPDATE public.sj_registration_challenges
         SET code_hash=$2,code_salt=$3,send_count=send_count+1,sent_at=now()
         WHERE token_hash=$1 AND expires_at>now() AND attempts<5
           AND send_count<3 AND sent_at<now()-interval '60 seconds'
         RETURNING email`,
        [signupTokenHash(challenge),digest,salt]);
      if(!rows[0])throw core.fail(429,'Please wait before requesting another code, or sign up again.');
      try{await dispatchSignupCode(rows[0].email,code);}
      catch(error){
        await core.query('DELETE FROM public.sj_registration_challenges WHERE token_hash=$1 AND code_hash=$2',
          [signupTokenHash(challenge),digest]).catch(()=>{});
        throw error;
      }
      return core.reply(res,200,{ok:true,message:'Another verification code has been sent.'});
    }
    if(action==='verify-login'){
      const body=core.parseBody(req);
      const challenge=String(body.challenge||'');
      const code=String(body.code||'').trim();
      if(!challengePattern.test(challenge)||!codePattern.test(code))
        throw core.fail(400,'Invalid or expired sign-in code');
      // Atomically count wrong attempts, including concurrent submissions.
      const rows=await core.query(
        `UPDATE public.sj_login_challenges
         SET attempts=attempts+1
         WHERE token_hash=$1 AND expires_at>now() AND attempts<5
         RETURNING user_id,code_hash,code_salt`,
        [tokenHash(challenge)]);
      if(!rows[0])throw core.fail(400,'Code expired or too many attempts. Sign in again.');
      const digest=codeDigest(challenge,code,rows[0].code_salt);
      if(!equalHash(digest,rows[0].code_hash))
        throw core.fail(400,'Incorrect sign-in code');
      // The code may be consumed at most once, even with parallel requests.
      const consumed=await core.query(
        `DELETE FROM public.sj_login_challenges
         WHERE token_hash=$1 AND code_hash=$2 AND expires_at>now()
         RETURNING user_id`,[tokenHash(challenge),digest]);
      if(!consumed[0])throw core.fail(400,'Code already used or expired');
      const active=await core.query(
        'SELECT id,email,role FROM public.sj_users WHERE id=$1 AND is_active=true',
        [consumed[0].user_id]);
      if(!active[0])throw core.fail(401,'Account is not active');
      await core.issueSession(res,active[0].id);
      return core.reply(res,200,{ok:true,user:core.publicUser(active[0])});
    }
    if(action==='resend-login'){
      requireEmailDelivery();
      const challenge=String(core.parseBody(req).challenge||'');
      if(!challengePattern.test(challenge))
        throw core.fail(400,'Invalid sign-in challenge');
      const code=String(randomInt(100000,1000000));
      const salt=randomBytes(16).toString('hex');
      const digest=codeDigest(challenge,code,salt);
      // One resend per minute, 3 deliveries total; attempts never reset.
      const rows=await core.query(
        `WITH updated AS (
           UPDATE public.sj_login_challenges
           SET code_hash=$2,code_salt=$3,sent_at=now(),send_count=send_count+1
           WHERE token_hash=$1 AND expires_at>now() AND attempts<5
             AND send_count<3 AND sent_at<now()-interval '60 seconds'
           RETURNING user_id
         )
         SELECT u.email FROM updated JOIN public.sj_users u ON u.id=updated.user_id
         WHERE u.is_active=true`,
        [tokenHash(challenge),digest,salt]);
      if(!rows[0])throw core.fail(429,'Please wait before requesting another code, or sign in again.');
      try{await dispatchCode(rows[0].email,code);}
      catch(error){
        // A failed email must not leave an unusable pending challenge.
        await core.query('DELETE FROM public.sj_login_challenges WHERE token_hash=$1 AND code_hash=$2',
          [tokenHash(challenge),digest]).catch(()=>{});
        throw error;
      }
      return core.reply(res,200,{ok:true,message:'A new sign-in code has been sent.'});
    }
    if(action==='request-email-login'){
      // Passwordless alternative: code is sent ONLY to the existing account email.
      // Return the same response for unknown/inactive accounts to avoid enumeration.
      requireEmailDelivery();
      const body=core.parseBody(req);
      const address=core.cleanEmail(body.email);
      await core.allowAuthAttempt(req,address);
      const challenge=randomBytes(32).toString('base64url');
      const users=await core.query(
        'SELECT id,email FROM public.sj_users WHERE email=$1 AND is_active=true LIMIT 1',
        [address]);
      if(users[0]){
        const user=users[0];
        const code=String(randomInt(100000,1000000));
        const salt=randomBytes(16).toString('hex');
        const digest=codeDigest(challenge,code,salt);
        // A fresh request invalidates a previously sent code for this account.
        await core.query('DELETE FROM public.sj_login_challenges WHERE user_id=$1',[user.id]);
        await core.query(
          `INSERT INTO public.sj_login_challenges
           (token_hash,user_id,code_hash,code_salt,expires_at)
           VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,
          [tokenHash(challenge),user.id,digest,salt]);
        try{await dispatchCode(user.email,code);}
        catch(error){
          await core.query('DELETE FROM public.sj_login_challenges WHERE token_hash=$1',
            [tokenHash(challenge)]).catch(()=>{});
          throw error;
        }
      }
      return core.reply(res,200,{ok:true,requires_otp:true,otp_purpose:'login',
        challenge,expires_in_seconds:600,
        message:'If this email has an active account, a sign-in code was sent.'});
    }
    if(!['register','login'].includes(action))throw core.fail(404,'Unknown action');
    const body=core.parseBody(req);
    const address=core.cleanEmail(body.email);
    const password=body.password;
    if(typeof password!=='string'||password.length<12||password.length>128)
      throw core.fail(400,'Password must be between 12 and 128 characters');
    if(action==='register'&&process.env.SECRETJ_REGISTRATION_ENABLED!=='true')
      throw core.fail(503,'Registration is not enabled yet');
    await core.allowAuthAttempt(req,address);

    if(action==='register'){
      if(body.accept_terms !== true||body.terms_version !== '2026-11-14'||
        body.privacy_version !== '2026-11-14')
        throw core.fail(400,'Please accept the current Terms and Privacy Policy to create an account');
      const name=core.validateText(body.name||'',120,'Name');
      // New accounts always require verified email ownership.
      {
        requireEmailDelivery();
        const already=await core.query('SELECT id FROM public.sj_users WHERE email=$1 LIMIT 1',[address]);
        if(already.length)throw core.fail(409,'This email is already registered');
        const challenge=randomBytes(32).toString('base64url');
        const code=String(randomInt(100000,1000000));
        const salt=randomBytes(16).toString('hex');
        const digest=signupCodeDigest(challenge,code,salt);
        const passhash=await core.hashPassword(password);
        // Prevent restarting a live challenge to reset guessed-code attempts.
        const pending=await core.query(
          `INSERT INTO public.sj_registration_challenges
            (token_hash,email,password_hash,display_name,code_hash,code_salt,
             expires_at,terms_version,privacy_version)
           VALUES($1,$2,$3,$4,$5,$6,now()+interval '10 minutes',$7,$8)
           ON CONFLICT(email) DO UPDATE SET
             token_hash=EXCLUDED.token_hash,password_hash=EXCLUDED.password_hash,
             display_name=EXCLUDED.display_name,code_hash=EXCLUDED.code_hash,
             code_salt=EXCLUDED.code_salt,expires_at=EXCLUDED.expires_at,
             sent_at=now(),attempts=0,send_count=1,
             terms_version=EXCLUDED.terms_version,privacy_version=EXCLUDED.privacy_version
           WHERE public.sj_registration_challenges.expires_at<now()
           RETURNING token_hash`,
          [signupTokenHash(challenge),address,passhash,name,digest,salt,
            '2026-11-14','2026-11-14']);
        if(!pending[0])throw core.fail(429,'A verification code is already pending for this email. Check your inbox.');
        try{await dispatchSignupCode(address,code);}
        catch(error){
          await core.query('DELETE FROM public.sj_registration_challenges WHERE token_hash=$1',
            [signupTokenHash(challenge)]).catch(()=>{});
          throw error;
        }
        return core.reply(res,200,{ok:true,requires_otp:true,otp_purpose:'signup',
          challenge,expires_in_seconds:600,message:'Check your email to verify your new account.'});
      }
    }
    const users=await core.query(
      'SELECT id,email,role,password_hash,is_active FROM public.sj_users WHERE email=$1 LIMIT 1',
      [address]);
    const user=users[0];
    const valid=await core.checkPassword(password,user?.password_hash||'');
    if(!user||!valid||!user.is_active)throw core.fail(401,'Incorrect email or password');
    // Email verification is mandatory for every fresh password sign-in.
    // Missing mail configuration must fail closed, never issue a session.
    requireEmailDelivery();
    const challenge=randomBytes(32).toString('base64url');
    const code=String(randomInt(100000,1000000));
    const salt=randomBytes(16).toString('hex');
    const digest=codeDigest(challenge,code,salt);
    await core.query('DELETE FROM public.sj_login_challenges WHERE user_id=$1',[user.id]);
    await core.query(
      `INSERT INTO public.sj_login_challenges
       (token_hash,user_id,code_hash,code_salt,expires_at)
       VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,
      [tokenHash(challenge),user.id,digest,salt]);
    try{await dispatchCode(user.email,code);}
    catch(error){
      await core.query('DELETE FROM public.sj_login_challenges WHERE token_hash=$1',
        [tokenHash(challenge)]).catch(()=>{});
      throw error;
    }
    // The initial response contains NO user and creates NO authenticated cookie.
    return core.reply(res,200,{ok:true,requires_otp:true,challenge,
      expires_in_seconds:600,message:'Check your account email for a six-digit sign-in code.'});
  }catch(error){return core.safeError(res,error);}
};
