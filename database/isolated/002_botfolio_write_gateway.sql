-- Botfolio destination only. Narrow write gateway for the existing server-only
-- Vercel connection; never grant direct table writes or PUBLIC execution.
BEGIN;
CREATE OR REPLACE FUNCTION secretj_migration_sync.apply_botfolio_write(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>2 THEN
  RAISE EXCEPTION 'Invalid portfolio write batch';
 END IF;
 RETURN secretj_migration_sync.apply_batch('botfolio',p_rows);
END $$;
REVOKE ALL ON FUNCTION secretj_migration_sync.apply_botfolio_write(jsonb) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='secretj_vercel_reader') THEN
  GRANT EXECUTE ON FUNCTION secretj_migration_sync.apply_botfolio_write(jsonb) TO secretj_vercel_reader;
 END IF;
END $$;
COMMIT;
