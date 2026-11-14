'use strict';

/** Admin-only operations. Never accept role assignment from registration. */
const core=require('../lib/secretj/core');

module.exports=async function handler(req,res){
  try {
    core.allowedMethod(req,['GET','PATCH']);
    const admin=await core.requireAdmin(req);
    const action=req.query?.action || 'summary';

    if(req.method==='GET' && action==='summary'){
      const [stats,latest]=await Promise.all([
        core.query(`SELECT
          (SELECT count(*)::int FROM public.sj_users) AS users,
          (SELECT count(*)::int FROM public.sj_users WHERE is_active) AS active_users,
          (SELECT count(*)::int FROM public.sj_saved_jobs) AS saved_jobs,
          (SELECT count(*)::int FROM public.sj_applications) AS applications,
          (SELECT count(*)::int FROM public.sj_cv_files) AS cvs`),
        core.query(`SELECT a.action,a.detail,a.created_at,u.email AS actor_email
          FROM public.sj_admin_audit a
          LEFT JOIN public.sj_users u ON u.id=a.actor_id
          ORDER BY a.created_at DESC LIMIT 20`)
      ]);
      return core.reply(res,200,{ok:true,summary:stats[0],activity:latest});
    }
    if(req.method==='GET' && action==='users'){
      const rows=await core.query(
        `SELECT u.id,u.email,u.role,u.is_active,u.created_at,
                 p.display_name,p.headline
          FROM public.sj_users u
          LEFT JOIN public.sj_profiles p ON p.user_id=u.id
          ORDER BY u.created_at DESC LIMIT 150`
      );
      return core.reply(res,200,{ok:true,users:rows});
    }
    if(req.method==='GET' && action==='insights'){
      // Aggregate operational insights only. Never return CV bytes, passwords,
      // hashed sessions, profile notes, or private job snapshots.
      const [accounts,alerts,pipeline,signups,activity]=await Promise.all([
        core.query(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE is_active)::int AS active,
          count(*) FILTER (WHERE role='admin')::int AS admins,
          count(*) FILTER (WHERE created_at>=now()-interval '7 days')::int AS joined_week
          FROM public.sj_users`),
        core.query(`SELECT
          (SELECT count(*)::int FROM public.sj_preferences WHERE email_alerts=true) AS opted_in,
          (SELECT count(*)::int FROM public.sj_email_verifications WHERE verified_at IS NOT NULL
            AND verified_email IS NOT NULL) AS verified,
          (SELECT count(*)::int FROM public.sj_email_alert_log WHERE status='sent') AS sent,
          (SELECT count(*)::int FROM public.sj_email_alert_log WHERE status='failed') AS failed,
          (SELECT count(*)::int FROM public.sj_email_alert_log WHERE status='pending') AS pending`),
        core.query(`SELECT stage,count(*)::int AS count FROM public.sj_applications
          GROUP BY stage ORDER BY count DESC`),
        core.query(`SELECT to_char(date_trunc('day',created_at AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS day,
          count(*)::int AS count FROM public.sj_users
          WHERE created_at>=now()-interval '14 days'
          GROUP BY 1 ORDER BY 1`),
        core.query(`SELECT a.action,a.created_at,u.email AS actor_email,
          a.detail FROM public.sj_admin_audit a
          LEFT JOIN public.sj_users u ON u.id=a.actor_id
          ORDER BY a.created_at DESC LIMIT 30`)
      ]);
      return core.reply(res,200,{ok:true,
        accounts:accounts[0],alerts:alerts[0],pipeline,signups,activity});
    }
    if(req.method==='GET' && action==='user-detail'){
      const id=String(req.query?.id||'');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        throw core.fail(400,'Invalid user');
      const rows=await core.query(`SELECT u.id,u.email,u.role,u.is_active,u.created_at,
          p.display_name,p.headline,p.location,
          COALESCE(pref.email_alerts,false) AS email_alerts,
          pref.role_families,COALESCE(v.verified_at IS NOT NULL,false) AS email_verified,
          (SELECT count(*)::int FROM public.sj_saved_jobs WHERE user_id=u.id) AS saved_jobs,
          (SELECT count(*)::int FROM public.sj_applications WHERE user_id=u.id) AS applications,
          EXISTS(SELECT 1 FROM public.sj_cv_files WHERE user_id=u.id) AS has_cv,
          EXISTS(SELECT 1 FROM public.sj_avatars WHERE user_id=u.id) AS has_photo,
          (SELECT count(*)::int FROM public.sj_sessions
            WHERE user_id=u.id AND expires_at>now()) AS active_sessions,
          (SELECT count(*)::int FROM public.sj_email_alert_log
            WHERE user_id=u.id AND status='sent') AS alerts_sent
          FROM public.sj_users u
          LEFT JOIN public.sj_profiles p ON p.user_id=u.id
          LEFT JOIN public.sj_preferences pref ON pref.user_id=u.id
          LEFT JOIN public.sj_email_verifications v ON v.user_id=u.id
          WHERE u.id=$1 LIMIT 1`,[id]);
      if(!rows[0])throw core.fail(404,'User not found');
      return core.reply(res,200,{ok:true,user:rows[0]});
    }
    if(req.method==='PATCH' && action==='revoke-sessions'){
      const body=core.parseBody(req);
      if(typeof body.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id))
        throw core.fail(400,'Invalid user');
      if(body.id===admin.id)throw core.fail(403,'Do not revoke your own session here');
      const rows=await core.query(`WITH target AS (
          SELECT id FROM public.sj_users WHERE id=$1 AND id<>$2
        ), deleted AS (
          DELETE FROM public.sj_sessions WHERE user_id IN (SELECT id FROM target)
          RETURNING user_id
        ), audited AS (
          INSERT INTO public.sj_admin_audit(id,actor_id,action,target_user_id,detail)
          SELECT $3,$2,'revoke_sessions',id,
                 jsonb_build_object('revoked', (SELECT count(*) FROM deleted))
          FROM target RETURNING target_user_id
        )
        SELECT target_user_id FROM audited`,
        [body.id,admin.id,core.randomUUID()]);
      if(!rows[0])throw core.fail(404,'User not found');
      return core.reply(res,200,{ok:true,revoked:true});
    }
    if(req.method==='PATCH' && action==='user'){
      const body=core.parseBody(req);
      if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))
        throw core.fail(400,'Invalid user');
      if(body.id===admin.id)throw core.fail(403,'You cannot change your own administrative access');
      if(!['role','is_active'].includes(body.field))throw core.fail(400,'Invalid account field');
      const role=body.field==='role';
      if((role&&!['member','admin'].includes(body.value))||
         (!role&&typeof body.value!=='boolean'))
        throw core.fail(400,'Invalid update value');
      const actionName=role?'change_role':'change_active';
      // A modifying CTE ensures every admin change writes its audit event.
      const rows=role?await core.query(
        `WITH changed AS (
          UPDATE public.sj_users SET role=$1 WHERE id=$2 AND id<>$3 AND\n            ($1<>'member' OR (SELECT count(*) FROM public.sj_users WHERE role='admin' AND is_active)>1)
          RETURNING id,email,role,is_active
        ), audited AS (
          INSERT INTO public.sj_admin_audit(id,actor_id,action,target_user_id,detail)
          SELECT $4,$3,$5,id,jsonb_build_object('role',role) FROM changed
          RETURNING id
        )
        SELECT changed.* FROM changed JOIN audited ON true`,
        [body.value,body.id,admin.id,core.randomUUID(),actionName]
      ):await core.query(
        `WITH changed AS (
          UPDATE public.sj_users SET is_active=$1 WHERE id=$2 AND id<>$3 AND\n            ($1=true OR role<>'admin' OR (SELECT count(*) FROM public.sj_users WHERE role='admin' AND is_active)>1)
          RETURNING id,email,role,is_active
        ), audited AS (
          INSERT INTO public.sj_admin_audit(id,actor_id,action,target_user_id,detail)
          SELECT $4,$3,$5,id,jsonb_build_object('is_active',is_active) FROM changed
          RETURNING id
        )
        SELECT changed.* FROM changed JOIN audited ON true`,
        [body.value,body.id,admin.id,core.randomUUID(),actionName]
      );
      if(!rows[0])throw core.fail(404,'User not found');
      return core.reply(res,200,{ok:true,user:rows[0]});
    }
    throw core.fail(404,'Unknown admin action');
  }catch(error){return core.safeError(res,error);}
};
