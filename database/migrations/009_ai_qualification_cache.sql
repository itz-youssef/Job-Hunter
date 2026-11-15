-- AI conclusions are cached per hash of posting text and preference signature.
-- Do not store a user's identity, CV, email, or other account fields here.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sj_ai_qualification_cache (
  fingerprint CHAR(64) PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('accepted','rejected')),
  confidence NUMERIC(4,3),
  reason TEXT NOT NULL DEFAULT '',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(confidence IS NULL OR (confidence BETWEEN 0 AND 1))
);
CREATE INDEX IF NOT EXISTS sj_ai_qualification_cache_evaluated_idx
 ON public.sj_ai_qualification_cache(evaluated_at);
ALTER TABLE public.sj_ai_qualification_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sj_ai_qualification_cache FROM PUBLIC;
COMMIT;
