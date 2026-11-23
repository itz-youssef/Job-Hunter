-- Pending registrations have no usable account or session until email ownership is proven.
-- Existing accounts and login OTP challenges are unaffected.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sj_registration_challenges (
  token_hash CHAR(64) PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  code_hash CHAR(64) NOT NULL,
  code_salt CHAR(32) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  send_count INTEGER NOT NULL DEFAULT 1 CHECK (send_count BETWEEN 1 AND 3),
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(email=lower(email) AND length(email) BETWEEN 3 AND 254),
  CHECK(length(password_hash) BETWEEN 50 AND 512)
);
CREATE INDEX IF NOT EXISTS sj_registration_challenges_expiry_idx
  ON public.sj_registration_challenges(expires_at);
ALTER TABLE public.sj_registration_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sj_registration_challenges FROM PUBLIC;
COMMIT;
