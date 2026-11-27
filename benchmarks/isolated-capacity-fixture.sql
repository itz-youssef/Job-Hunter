-- Synthetic-only benchmark. Never run this script against a production database.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'secretj_benchmark' THEN RAISE EXCEPTION 'Synthetic benchmark database required'; END IF; END $$;
CREATE SCHEMA bench;
CREATE TABLE bench.users(id uuid PRIMARY KEY,active boolean NOT NULL DEFAULT true);
CREATE TABLE bench.jobs(id int PRIMARY KEY,payload jsonb NOT NULL);
CREATE TABLE bench.original(user_id uuid NOT NULL REFERENCES bench.users(id),job_key text NOT NULL,job_snapshot jsonb NOT NULL,status text NOT NULL,discovered_at timestamptz NOT NULL,attempted_at timestamptz,sent_at timestamptz,PRIMARY KEY(user_id,job_key));
INSERT INTO bench.users SELECT md5('synthetic-user-'||i)::uuid,true FROM generate_series(1,5000) i;
INSERT INTO bench.jobs SELECT i,jsonb_build_object('title','Engineer '||i,'company','Example '||i%50,'url','https://example.invalid/jobs/'||i,'location','Cairo, Egypt','description',(SELECT string_agg(md5(i::text||':'||k::text),' ') FROM generate_series(1,12) k),'requirements',(SELECT string_agg(md5(i::text||':req:'||k::text),' ') FROM generate_series(1,24) k),'source_catalog_stale',false,'source_filter_proof','catalog-fallback') FROM generate_series(1,1000) i;
INSERT INTO bench.original SELECT md5('synthetic-user-'||u)::uuid,j.payload->>'url',j.payload||jsonb_build_object('qualification_status','accepted','qualification_mode','dictionary-title-v1','qualification_reason','Synthetic matched preference','qualification_preference_signature',md5('preference-'||u)||md5('preference2-'||u),'qualification_matcher_fingerprint',repeat('f',64)),CASE WHEN k%9=0 THEN 'sent' ELSE 'baseline' END,'2026-11-27 00:00:00+00'::timestamptz-k*interval '1 second',NULL,NULL
FROM generate_series(1,5000) u CROSS JOIN generate_series(1,20) k JOIN bench.jobs j ON j.id=(u%50)*20+k;
CREATE INDEX ON bench.original(user_id,status,discovered_at) WHERE status IN ('pending','failed');
CREATE TABLE bench.normalized(user_id uuid NOT NULL REFERENCES bench.users(id),job_key text NOT NULL,payload_id int NOT NULL REFERENCES bench.jobs(id),qualification jsonb NOT NULL,status text NOT NULL,discovered_at timestamptz NOT NULL,attempted_at timestamptz,sent_at timestamptz,PRIMARY KEY(user_id,job_key));
INSERT INTO bench.normalized SELECT o.user_id,o.job_key,j.id,o.job_snapshot-ARRAY['title','company','url','location','description','requirements','source_catalog_stale','source_filter_proof'],o.status,o.discovered_at,o.attempted_at,o.sent_at FROM bench.original o JOIN bench.jobs j ON j.payload->>'url'=o.job_key;
CREATE INDEX ON bench.normalized(user_id,status,discovered_at) WHERE status IN ('pending','failed');
ANALYZE bench.original; ANALYZE bench.normalized; ANALYZE bench.users; ANALYZE bench.jobs;
DO $$ BEGIN
 IF (SELECT count(*) FROM bench.users)<>5000 OR (SELECT count(*) FROM bench.original)<>100000 OR (SELECT count(*) FROM bench.normalized)<>100000 THEN RAISE EXCEPTION 'Invalid fixture'; END IF;
 IF EXISTS(SELECT 1 FROM bench.original o FULL JOIN (SELECT n.user_id,n.job_key,j.payload||n.qualification AS job_snapshot,n.status,n.discovered_at,n.attempted_at,n.sent_at FROM bench.normalized n JOIN bench.jobs j ON j.id=n.payload_id) n USING(user_id,job_key) WHERE o.user_id IS NULL OR n.user_id IS NULL OR (o.job_snapshot,o.status,o.discovered_at,o.attempted_at,o.sent_at) IS DISTINCT FROM (n.job_snapshot,n.status,n.discovered_at,n.attempted_at,n.sent_at)) THEN RAISE EXCEPTION 'Normalization changed data'; END IF;
END $$;
SELECT (SELECT count(*) FROM bench.users) AS users,(SELECT count(*) FROM bench.original) AS rows,pg_total_relation_size('bench.original') AS original_bytes,pg_total_relation_size('bench.normalized')+pg_total_relation_size('bench.jobs') AS normalized_bytes,0 AS mismatches;
