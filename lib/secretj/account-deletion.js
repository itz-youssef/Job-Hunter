'use strict';
/* One atomic statement: remove audit references, cascade user-owned data,
 * then write a non-identifying admin deletion event when an admin initiated it.
 * Only member accounts may be removed; admins cannot be deleted by this API.
 */
const core=require('./core');
async function removeMember(userId,actorId=null){
  const admin=Boolean(actorId);
  const sql=`WITH subject AS (
    SELECT id FROM public.sj_users WHERE id=$1 AND role='member'
  ), erased_actor_audit AS (
    DELETE FROM public.sj_admin_audit WHERE actor_id IN (SELECT id FROM subject) RETURNING id
  ), cleared_target_audit AS (
    UPDATE public.sj_admin_audit SET target_user_id=NULL
    WHERE target_user_id IN (SELECT id FROM subject) RETURNING id
  ), removed AS (
    DELETE FROM public.sj_users
    WHERE id IN (SELECT id FROM subject)
      AND (SELECT count(*) FROM erased_actor_audit)>=0
      AND (SELECT count(*) FROM cleared_target_audit)>=0
    RETURNING id
  )${admin?`, event AS (
    INSERT INTO public.sj_admin_audit(id,actor_id,action,target_user_id,detail)
    SELECT $3,$2,'delete_member_account',NULL,'{"account_deleted":true}'::jsonb
    FROM removed RETURNING id
  ) SELECT removed.id FROM removed JOIN event ON true`:
    ' SELECT id FROM removed'}`;
  const values=admin?[userId,actorId,core.randomUUID()]:[userId];
  const rows=await core.query(sql,values);
  return Boolean(rows[0]);
}
module.exports={removeMember};
