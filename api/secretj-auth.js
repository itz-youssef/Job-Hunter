'use strict';

/** Cookie-based member auth. Admin roles can NEVER be set by this endpoint. */
const core = require('./_secretj/core');

module.exports = async function handler(req,res) {
  try {
    core.allowedMethod(req,['GET','POST']);
    const action = req.query?.action || (req.method==='GET' ? 'session' : '');
    if (req.method==='GET') {
      if (action !== 'session') throw core.fail(404,'Unknown action');
      const user = await core.userForRequest(req);
      return core.reply(res,200,{ok:true,user:user?core.publicUser(user):null});
    }
    if (action==='logout') {
      const token = core.cookies(req).sj_session;
      if (token && /^[A-Za-z0-9_-]{40,60}$/.test(token)) {
        await core.query('DELETE FROM public.sj_sessions WHERE token_hash=$1',[core.hash(token)]);
      }
      res.setHeader('Set-Cookie',core.sessionCookie('',true));
      return core.reply(res,200,{ok:true});
    }

    if (!['register','login'].includes(action)) throw core.fail(404,'Unknown action');
    const body=core.parseBody(req);
    const email=core.cleanEmail(body.email);
    const password=body.password;
    if (typeof password!=='string' || password.length < 12 || password.length > 128) {
      throw core.fail(400,'Password must be between 12 and 128 characters');
    }
    if (action==='register' && process.env.SECRETJ_REGISTRATION_ENABLED !== 'true') {
      throw core.fail(503,'Registration is not enabled yet');
    }
    await core.allowAuthAttempt(req,email);

    if (action==='register') {
      const name=core.validateText(body.name||'',120,'Name');
      const id=core.randomUUID();
      const passhash=await core.hashPassword(password);
      // Atomic CTE: an account cannot exist without its initial profile.
      const rows=await core.query(
        `WITH created AS (
           INSERT INTO public.sj_users(id,email,password_hash)
           VALUES($1,$2,$3)
           RETURNING id,email,role
         ), profile AS (
           INSERT INTO public.sj_profiles(user_id,display_name)
           SELECT id,$4 FROM created RETURNING user_id
         )
         SELECT created.id,created.email,created.role FROM created
         JOIN profile ON profile.user_id=created.id`,
        [id,email,passhash,name]
      );
      await core.issueSession(res,id);
      return core.reply(res,201,{ok:true,user:core.publicUser(rows[0])});
    }

    const rows=await core.query(
      'SELECT id,email,role,password_hash,is_active FROM public.sj_users WHERE email=$1 LIMIT 1',
      [email]
    );
    const user=rows[0];
    const valid=await core.checkPassword(password,user?.password_hash||'');
    if (!user || !valid || !user.is_active) {
      throw core.fail(401,'Incorrect email or password');
    }
    await core.issueSession(res,user.id);
    return core.reply(res,200,{ok:true,user:core.publicUser(user)});
  } catch(error) {
    return core.safeError(res,error);
  }
};
