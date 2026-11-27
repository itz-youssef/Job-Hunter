-- Product databases: primary content writes, separate from the core commit
-- journal. Existing reconstructed mirror and its exact digest remain intact.
BEGIN;
CREATE OR REPLACE FUNCTION secretj_migration_sync.put_job_payloads(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n integer;
BEGIN
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>150
   OR octet_length(p_rows::text)>2500000 THEN RAISE EXCEPTION 'Invalid catalog batch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR octet_length(x::text)>16000
   OR x ?| ARRAY['qualification_status','qualification_mode','qualification_model','qualification_reason','qualification_preference_signature','qualification_matcher_fingerprint'])
 THEN RAISE EXCEPTION 'Invalid shared catalog payload'; END IF;
 INSERT INTO secretj_migration_sync.payloads(digest,content)
 SELECT DISTINCT encode(sha256(convert_to(x::text,'UTF8')),'hex'),x FROM jsonb_array_elements(p_rows) x
 ON CONFLICT DO NOTHING;
 SELECT count(*)::int INTO n FROM jsonb_array_elements(p_rows) x
 JOIN secretj_migration_sync.payloads p ON p.digest=encode(sha256(convert_to(x::text,'UTF8')),'hex') AND p.content=x;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION secretj_migration_sync.put_job_payloads(jsonb) FROM PUBLIC;

CREATE TABLE IF NOT EXISTS secretj_migration_sync.bot_knowledge(
 owner_id uuid NOT NULL,
 bot_id uuid NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 knowledge jsonb NOT NULL CHECK(jsonb_typeof(knowledge)='array' AND jsonb_array_length(knowledge) BETWEEN 1 AND 40),
 prepared_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,bot_id,digest)
);
ALTER TABLE secretj_migration_sync.bot_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON secretj_migration_sync.bot_knowledge FROM PUBLIC;
CREATE OR REPLACE FUNCTION secretj_migration_sync.put_bot_knowledge(p_owner uuid,p_bot uuid,p_knowledge jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h text;
BEGIN
 IF p_owner IS NULL OR p_bot IS NULL OR jsonb_typeof(p_knowledge) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_knowledge) NOT BETWEEN 1 AND 40 OR octet_length(p_knowledge::text)>1500000
 THEN RAISE EXCEPTION 'Invalid knowledge payload'; END IF;
 -- A prior deletion is a durable fence against a delayed preparation.
 IF EXISTS(SELECT 1 FROM secretj_migration_sync.records WHERE service='botfolio'
 AND owner_id=p_owner AND entity_key=p_bot::text AND record IS NULL) THEN
  RAISE EXCEPTION 'Portfolio has been deleted';
 END IF;
 h:=encode(sha256(convert_to(p_knowledge::text,'UTF8')),'hex');
 INSERT INTO secretj_migration_sync.bot_knowledge(owner_id,bot_id,digest,knowledge)
 VALUES(p_owner,p_bot,h,p_knowledge) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM secretj_migration_sync.bot_knowledge WHERE owner_id=p_owner AND bot_id=p_bot AND digest=h AND knowledge=p_knowledge)
 THEN RAISE EXCEPTION 'Knowledge checksum mismatch'; END IF;
 RETURN h;
END $$;
REVOKE ALL ON FUNCTION secretj_migration_sync.put_bot_knowledge(uuid,uuid,jsonb) FROM PUBLIC;

-- Promote confirmed committed knowledge and discard older/uncommitted versions.
-- A tombstone removes all payloads for the deleted bot. Transactional with the
-- existing revision-safe mirror write; no data is exposed by preparation alone.
CREATE OR REPLACE FUNCTION secretj_migration_sync.maintain_bot_knowledge()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE h text; k jsonb;
BEGIN
 IF NEW.service<>'botfolio' THEN RETURN NEW; END IF;
 IF NEW.record IS NULL THEN
  DELETE FROM secretj_migration_sync.bot_knowledge WHERE owner_id=NEW.owner_id AND bot_id=NEW.entity_key::uuid;
 ELSE
  k:=NEW.record->'knowledge';
  IF jsonb_typeof(k)='array' AND jsonb_array_length(k) BETWEEN 1 AND 40 THEN
   h:=encode(sha256(convert_to(k::text,'UTF8')),'hex');
   INSERT INTO secretj_migration_sync.bot_knowledge(owner_id,bot_id,digest,knowledge)
    VALUES(NEW.owner_id,NEW.entity_key::uuid,h,k) ON CONFLICT DO NOTHING;
   DELETE FROM secretj_migration_sync.bot_knowledge WHERE owner_id=NEW.owner_id AND bot_id=NEW.entity_key::uuid AND digest<>h;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION secretj_migration_sync.maintain_bot_knowledge() FROM PUBLIC;
DROP TRIGGER IF EXISTS sj_product_bot_knowledge ON secretj_migration_sync.records;
CREATE TRIGGER sj_product_bot_knowledge AFTER INSERT OR UPDATE ON secretj_migration_sync.records
 FOR EACH ROW EXECUTE FUNCTION secretj_migration_sync.maintain_bot_knowledge();
INSERT INTO secretj_migration_sync.bot_knowledge(owner_id,bot_id,digest,knowledge)
 SELECT owner_id,entity_key::uuid,encode(sha256(convert_to((record->'knowledge')::text,'UTF8')),'hex'),record->'knowledge'
 FROM secretj_migration_sync.records WHERE service='botfolio' AND record IS NOT NULL
 AND jsonb_typeof(record->'knowledge')='array' AND jsonb_array_length(record->'knowledge') BETWEEN 1 AND 40
 ON CONFLICT DO NOTHING;
-- Old prepared content that never committed is disposable; committed mirrors
-- are retained. Core fallback also covers a delayed sync beyond this horizon.
CREATE OR REPLACE FUNCTION secretj_migration_sync.prune_prepared_knowledge()
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE n integer;
BEGIN
 DELETE FROM secretj_migration_sync.bot_knowledge k
 WHERE k.prepared_at<now()-interval '1 day' AND NOT EXISTS(
  SELECT 1 FROM secretj_migration_sync.records r WHERE r.service='botfolio' AND r.owner_id=k.owner_id AND r.entity_key=k.bot_id::text
  AND r.record IS NOT NULL AND encode(sha256(convert_to((r.record->'knowledge')::text,'UTF8')),'hex')=k.digest);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION secretj_migration_sync.prune_prepared_knowledge() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='secretj_vercel_reader') THEN
  GRANT EXECUTE ON FUNCTION secretj_migration_sync.put_job_payloads(jsonb),secretj_migration_sync.put_bot_knowledge(uuid,uuid,jsonb) TO secretj_vercel_reader;
  GRANT SELECT ON secretj_migration_sync.payloads,secretj_migration_sync.bot_knowledge TO secretj_vercel_reader;
 END IF;
END $$;
COMMIT;
