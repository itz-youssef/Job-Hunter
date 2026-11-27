-- Apply ONLY to the isolated Job Hunter and Botfolio projects.
BEGIN;
CREATE SCHEMA IF NOT EXISTS secretj_migration_sync;
REVOKE ALL ON SCHEMA secretj_migration_sync FROM PUBLIC;
CREATE TABLE IF NOT EXISTS secretj_migration_sync.payloads(
 digest text PRIMARY KEY CHECK(digest ~ '^[0-9a-f]{64}$'),
 content jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS secretj_migration_sync.records(
 service text NOT NULL CHECK(service IN ('jobHunter','botfolio')),
 owner_id uuid NOT NULL,
 entity_key text NOT NULL CHECK(length(entity_key) BETWEEN 1 AND 500),
 revision bigint NOT NULL CHECK(revision>0),
 record_digest text CHECK(record_digest ~ '^[0-9a-f]{64}$'),
 record jsonb,
 payload_digest text REFERENCES secretj_migration_sync.payloads(digest),
 qualifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(service,owner_id,entity_key),
 CHECK((record IS NULL AND record_digest IS NULL AND payload_digest IS NULL) OR
       (record IS NOT NULL AND record_digest IS NOT NULL AND
        ((service='jobHunter' AND payload_digest IS NOT NULL) OR
         (service='botfolio' AND payload_digest IS NULL))))
);
CREATE INDEX IF NOT EXISTS sj_sync_payload_refs ON secretj_migration_sync.records(payload_digest) WHERE payload_digest IS NOT NULL;
ALTER TABLE secretj_migration_sync.payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE secretj_migration_sync.records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE secretj_migration_sync.payloads,secretj_migration_sync.records FROM PUBLIC;
CREATE OR REPLACE FUNCTION secretj_migration_sync.apply_batch(p_service text,p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE x record; source_record jsonb; body jsonb; shared jsonb; qual jsonb;
 payload_hash text; n integer:=0;
 keys text[]:=ARRAY['qualification_status','qualification_mode','qualification_model','qualification_reason','qualification_preference_signature','qualification_matcher_fingerprint'];
BEGIN
 IF p_service NOT IN ('jobHunter','botfolio') OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>100 THEN
  RAISE EXCEPTION 'Invalid isolated sync batch';
 END IF;
 FOR x IN SELECT * FROM jsonb_to_recordset(p_rows) AS t(owner_id uuid,entity_key text,revision bigint,record_text text,record_digest text)
 LOOP
  IF x.owner_id IS NULL OR x.entity_key IS NULL OR x.revision IS NULL OR x.revision<1 THEN RAISE EXCEPTION 'Invalid isolated sync identity'; END IF;
  source_record:=x.record_text::jsonb;
  body:=source_record;payload_hash:=NULL;qual:='{}'::jsonb;
  IF source_record IS NOT NULL THEN
   IF jsonb_typeof(source_record) IS DISTINCT FROM 'object' OR source_record->>'user_id' IS DISTINCT FROM x.owner_id::text
     OR (CASE WHEN p_service='jobHunter' THEN source_record->>'job_key' ELSE source_record->>'id' END) IS DISTINCT FROM x.entity_key
     OR encode(sha256(convert_to(source_record::text,'UTF8')),'hex') IS DISTINCT FROM x.record_digest THEN
    RAISE EXCEPTION 'Isolated record identity or digest mismatch';
   END IF;
  ELSIF x.record_digest IS NOT NULL THEN RAISE EXCEPTION 'Invalid tombstone'; END IF;
  -- Avoid old retries resurrecting a deleted entity or replacing a new version.
  IF EXISTS(SELECT 1 FROM secretj_migration_sync.records r WHERE r.service=p_service AND r.owner_id=x.owner_id AND r.entity_key=x.entity_key AND r.revision>=x.revision) THEN
   n:=n+1;CONTINUE;
  END IF;
  IF source_record IS NOT NULL AND p_service='jobHunter' THEN
   IF jsonb_typeof(source_record->'job_snapshot') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid job payload'; END IF;
   shared:=(source_record->'job_snapshot')-keys;
   SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) INTO qual FROM jsonb_each(source_record->'job_snapshot') WHERE key=ANY(keys);
   payload_hash:=encode(sha256(convert_to(shared::text,'UTF8')),'hex');
   INSERT INTO secretj_migration_sync.payloads(digest,content) VALUES(payload_hash,shared) ON CONFLICT DO NOTHING;
   body:=source_record-'job_snapshot';
  END IF;
  INSERT INTO secretj_migration_sync.records AS target(service,owner_id,entity_key,revision,record_digest,record,payload_digest,qualifiers)
   VALUES(p_service,x.owner_id,x.entity_key,x.revision,x.record_digest,body,payload_hash,qual)
   ON CONFLICT(service,owner_id,entity_key) DO UPDATE SET revision=EXCLUDED.revision,record_digest=EXCLUDED.record_digest,
     record=EXCLUDED.record,payload_digest=EXCLUDED.payload_digest,qualifiers=EXCLUDED.qualifiers
   WHERE target.revision<EXCLUDED.revision;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION secretj_migration_sync.apply_batch(text,jsonb) FROM PUBLIC;
CREATE OR REPLACE VIEW secretj_migration_sync.reconstructed AS
 SELECT r.service,r.owner_id,r.entity_key,r.revision,r.record_digest,
 CASE WHEN r.record IS NULL THEN NULL WHEN r.service='jobHunter'
 THEN r.record||jsonb_build_object('job_snapshot',p.content||r.qualifiers) ELSE r.record END AS full_record
 FROM secretj_migration_sync.records r LEFT JOIN secretj_migration_sync.payloads p ON p.digest=r.payload_digest;
REVOKE ALL ON secretj_migration_sync.reconstructed FROM PUBLIC;
COMMIT;
