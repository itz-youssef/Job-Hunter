-- Email verification and per-account alert delivery ledger.
-- Safe to re-run, never drops or modifies existing data.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sj_email_verifications (
  user_id UUID PRIMARY KEY REFERENCES public.sj_users(id) ON DELETE CASCADE,
  code_hash CHAR(64),
  code_salt CHAR(32),
  expires_at TIMESTAMPTZ,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  verified_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  CHECK (
    (code_hash IS NULL AND code_salt IS NULL)
    OR (code_hash IS NOT NULL AND code_salt IS NOT NULL)
  )
);
CREATE TABLE IF NOT EXISTS public.sj_email_alert_log (
  user_id UUID NOT NULL REFERENCES public.sj_users(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed')),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  PRIMARY KEY (user_id,job_key),
  CHECK (length(job_key) BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS sj_email_alert_log_recent_idx
  ON public.sj_email_alert_log(attempted_at DESC);
ALTER TABLE public.sj_email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_email_alert_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sj_email_verifications,public.sj_email_alert_log FROM PUBLIC;
COMMIT;
