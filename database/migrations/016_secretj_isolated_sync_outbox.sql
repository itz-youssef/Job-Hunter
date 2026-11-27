-- Core-only additive migration. Existing tables, data and authorization are
-- authoritative. The queue contains keys/revisions only, never CV contents.
BEGIN;
SET LOCAL lock_timeout='2s';
CREATE SCHEMA IF NOT EXISTS secretj_migration_sync;
REVOKE ALL ON SCHEMA secretj_migration_sync FROM PUBLIC;
CREATE SEQUENCE IF NOT EXISTS secretj_migration_sync.revisions AS bigint;
CREATE TABLE IF NOT EXISTS secretj_migration_sync.outbox (
 service text NOT NULL CHECK(service IN ('jobHunter','botfolio')),
 owner_id uuid NOT NULL,
 entity_key text NOT NULL CHECK(length(entity_key) BETWEEN 1 AND 500),
 revision bigint NOT NULL DEFAULT nextval('secretj_migration_sync.revisions'),
 PRIMARY KEY(service,owner_id,entity_key)
);
CREATE INDEX IF NOT EXISTS sj_sync_outbox_revision ON secretj_migration_sync.outbox(service,revision);
ALTER TABLE secretj_migration_sync.outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE secretj_migration_sync.outbox FROM PUBLIC;
REVOKE ALL ON SEQUENCE secretj_migration_sync.revisions FROM PUBLIC;

CREATE OR REPLACE FUNCTION secretj_migration_sync.enqueue(p_service text,p_owner uuid,p_key text)
RETURNS void LANGUAGE sql SET search_path=pg_catalog AS $$
 INSERT INTO secretj_migration_sync.outbox(service,owner_id,entity_key)
 VALUES(p_service,p_owner,p_key)
 ON CONFLICT(service,owner_id,entity_key) DO UPDATE SET revision=EXCLUDED.revision
$$;
REVOKE ALL ON FUNCTION secretj_migration_sync.enqueue(text,uuid,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION secretj_migration_sync.capture()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE svc text; old_key text; new_key text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='sj_native_watch_jobs' THEN
  svc:='jobHunter';
  IF TG_OP<>'INSERT' THEN old_key:=OLD.job_key; END IF;
  IF TG_OP<>'DELETE' THEN new_key:=NEW.job_key; END IF;
 ELSIF TG_TABLE_NAME='sj_botfolio_bots' THEN
  svc:='botfolio';
  IF TG_OP<>'INSERT' THEN old_key:=OLD.id::text; END IF;
  IF TG_OP<>'DELETE' THEN new_key:=NEW.id::text; END IF;
 ELSE RAISE EXCEPTION 'Unexpected replication source';
 END IF;
 IF TG_OP='DELETE' THEN
  PERFORM secretj_migration_sync.enqueue(svc,OLD.user_id,old_key);
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR old_key IS DISTINCT FROM new_key THEN
   PERFORM secretj_migration_sync.enqueue(svc,OLD.user_id,old_key);
  END IF;
 END IF;
 PERFORM secretj_migration_sync.enqueue(svc,NEW.user_id,new_key);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION secretj_migration_sync.capture() FROM PUBLIC;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.sj_native_watch_jobs'::regclass AND tgname='sj_isolated_sync_capture') THEN
  CREATE TRIGGER sj_isolated_sync_capture AFTER INSERT OR UPDATE OR DELETE ON public.sj_native_watch_jobs FOR EACH ROW EXECUTE FUNCTION secretj_migration_sync.capture();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.sj_botfolio_bots'::regclass AND tgname='sj_isolated_sync_capture') THEN
  CREATE TRIGGER sj_isolated_sync_capture AFTER INSERT OR UPDATE OR DELETE ON public.sj_botfolio_bots FOR EACH ROW EXECUTE FUNCTION secretj_migration_sync.capture();
 END IF;
END $$;
-- Seed after triggers are installed; a concurrent writer cannot lose an event.
INSERT INTO secretj_migration_sync.outbox(service,owner_id,entity_key)
 SELECT 'jobHunter',user_id,job_key FROM public.sj_native_watch_jobs ON CONFLICT DO NOTHING;
INSERT INTO secretj_migration_sync.outbox(service,owner_id,entity_key)
 SELECT 'botfolio',user_id,id::text FROM public.sj_botfolio_bots ON CONFLICT DO NOTHING;
COMMIT;
