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
          UPDATE public.sj_users SET role=$1 WHERE id=$2 AND id<>$3
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
          UPDATE public.sj_users SET is_active=$1 WHERE id=$2 AND id<>$3
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
