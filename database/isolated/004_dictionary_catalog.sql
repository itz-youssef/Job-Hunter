-- Shared, derived catalog on the Job Hunter isolated Neon database only.
-- No account records, notification history or authoritative watch tables change.
BEGIN;
CREATE TABLE IF NOT EXISTS secretj_migration_sync.dictionary_catalog_manifest (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 matcher_fingerprint text NOT NULL,
 scan_started timestamptz NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 job_count integer NOT NULL CHECK(job_count>0),
 snapshot_fresh boolean NOT NULL,
 failed_sources integer NOT NULL,
 native_boards integer NOT NULL
);
CREATE TABLE IF NOT EXISTS secretj_migration_sync.dictionary_catalog_jobs (
 job_key text PRIMARY KEY CHECK(length(job_key) BETWEEN 1 AND 500),
 evidence_digest text NOT NULL,
 matcher_fingerprint text NOT NULL,
 job jsonb NOT NULL,
 facts jsonb NOT NULL,
 role_families text[] NOT NULL,
 career_level text,
 in_egypt boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS dictionary_catalog_roles_idx ON secretj_migration_sync.dictionary_catalog_jobs USING gin(role_families);
CREATE INDEX IF NOT EXISTS dictionary_catalog_level_idx ON secretj_migration_sync.dictionary_catalog_jobs(career_level);
CREATE INDEX IF NOT EXISTS dictionary_catalog_egypt_idx ON secretj_migration_sync.dictionary_catalog_jobs(in_egypt);
ALTER TABLE secretj_migration_sync.dictionary_catalog_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE secretj_migration_sync.dictionary_catalog_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE secretj_migration_sync.dictionary_catalog_manifest,secretj_migration_sync.dictionary_catalog_jobs FROM PUBLIC;

-- Serialize publication. Readers see either the previous complete catalog
-- or the new complete catalog, never partial results. Only derived rows are
-- replaced/pruned; no subscriber or notification data is modified.
CREATE OR REPLACE FUNCTION secretj_migration_sync.publish_dictionary_catalog(
 p_rows jsonb,p_fingerprint text,p_started timestamptz,p_fresh boolean,p_failed integer,p_boards integer
) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE previous_started timestamptz;
BEGIN
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)=0 OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Invalid dictionary catalog';
 END IF;
 PERFORM pg_advisory_xact_lock(721170281);
 SELECT scan_started INTO previous_started FROM secretj_migration_sync.dictionary_catalog_manifest WHERE singleton;
 IF previous_started IS NOT NULL AND previous_started>p_started THEN RETURN false; END IF;
 INSERT INTO secretj_migration_sync.dictionary_catalog_jobs AS existing
 (job_key,evidence_digest,matcher_fingerprint,job,facts,role_families,career_level,in_egypt)
 SELECT x.job_key,x.evidence_digest,p_fingerprint,x.job,x.facts,x.role_families,x.career_level,x.in_egypt
 FROM jsonb_to_recordset(p_rows) AS x(job_key text,evidence_digest text,job jsonb,facts jsonb,role_families text[],career_level text,in_egypt boolean)
 ON CONFLICT(job_key) DO UPDATE SET
 evidence_digest=EXCLUDED.evidence_digest,matcher_fingerprint=EXCLUDED.matcher_fingerprint,
 job=EXCLUDED.job,facts=EXCLUDED.facts,role_families=EXCLUDED.role_families,
 career_level=EXCLUDED.career_level,in_egypt=EXCLUDED.in_egypt
 WHERE (existing.evidence_digest,existing.matcher_fingerprint,existing.job,existing.facts,existing.role_families,existing.career_level,existing.in_egypt)
 IS DISTINCT FROM (EXCLUDED.evidence_digest,EXCLUDED.matcher_fingerprint,EXCLUDED.job,EXCLUDED.facts,EXCLUDED.role_families,EXCLUDED.career_level,EXCLUDED.in_egypt);
 DELETE FROM secretj_migration_sync.dictionary_catalog_jobs c
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE x->>'job_key'=c.job_key);
 INSERT INTO secretj_migration_sync.dictionary_catalog_manifest(singleton,matcher_fingerprint,scan_started,published_at,job_count,snapshot_fresh,failed_sources,native_boards)
 VALUES(true,p_fingerprint,p_started,now(),jsonb_array_length(p_rows),p_fresh,p_failed,p_boards)
 ON CONFLICT(singleton) DO UPDATE SET matcher_fingerprint=EXCLUDED.matcher_fingerprint,scan_started=EXCLUDED.scan_started,published_at=EXCLUDED.published_at,job_count=EXCLUDED.job_count,snapshot_fresh=EXCLUDED.snapshot_fresh,failed_sources=EXCLUDED.failed_sources,native_boards=EXCLUDED.native_boards;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION secretj_migration_sync.publish_dictionary_catalog(jsonb,text,timestamptz,boolean,integer,integer) FROM PUBLIC;
COMMIT;
