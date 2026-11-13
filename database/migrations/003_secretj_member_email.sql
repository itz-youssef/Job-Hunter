-- Secret J member-only email confirmation and deduplicated job alert delivery.
-- Run AFTER migration 001. Does not alter or access the legacy admin ALERT_EMAIL.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sj_email_verifications (
  user_id UUID PRIMARY KEY REFERENCES public.sj_users(id) ON DELETE CASCADE,
  recipient_email TEXT CHECK(recipient_email IS NULL OR length(recipient_email)<=254),
  verified_email TEXT CHECK(verified_email IS NULL OR length(verified_email)<=254),
  code_hash CHAR(64),
  code_salt CHAR(32),
  expires_at TIMESTAMPTZ,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 6),
  verified_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  CHECK ((code_hash IS NULL AND code_salt IS NULL) OR
         (code_hash IS NOT NULL AND code_salt IS NOT NULL))
);
-- Idempotent when upgrading databases that already ran the earlier 003.
ALTER TABLE public.sj_email_verifications
  ADD COLUMN IF NOT EXISTS recipient_email TEXT;
ALTER TABLE public.sj_email_verifications
  ADD COLUMN IF NOT EXISTS verified_email TEXT;

CREATE INDEX IF NOT EXISTS sj_email_verifications_expiry
  ON public.sj_email_verifications(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sj_email_alert_log (
  user_id UUID NOT NULL REFERENCES public.sj_users(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL CHECK (length(job_key) BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK (status IN ('pending','sent','failed')),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  PRIMARY KEY(user_id,job_key)
);
CREATE INDEX IF NOT EXISTS sj_email_alert_log_pending
  ON public.sj_email_alert_log(status,attempted_at);

ALTER TABLE public.sj_email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_email_alert_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sj_email_verifications,public.sj_email_alert_log FROM PUBLIC;
COMMIT;
