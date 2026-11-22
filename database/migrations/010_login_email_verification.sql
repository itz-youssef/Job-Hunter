-- Pre-session, single-use login email verification challenges.
-- No raw codes or challenge tokens are persisted; independent from alert-email verification.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sj_login_challenges (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.sj_users(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  code_salt CHAR(32) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  send_count INTEGER NOT NULL DEFAULT 1 CHECK(send_count BETWEEN 1 AND 3),
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sj_login_challenges_user_idx
  ON public.sj_login_challenges(user_id,created_at DESC);
ALTER TABLE public.sj_login_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sj_login_challenges FROM PUBLIC;
COMMIT;
