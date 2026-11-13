-- Optional LinkedIn OIDC profile connection. Apply after
-- 001_secret_j_multitenant.sql has completed successfully.
-- LinkedIn access tokens are never persisted in this database.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sj_linkedin_oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.sj_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sj_linkedin_oauth_states_expiry_idx
  ON public.sj_linkedin_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS public.sj_linkedin_connections (
  user_id UUID PRIMARY KEY REFERENCES public.sj_users(id) ON DELETE CASCADE,
  provider_subject TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  provider_email TEXT,
  picture_url TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(provider_subject) BETWEEN 1 AND 300),
  CHECK (length(full_name) <= 200),
  CHECK (provider_email IS NULL OR length(provider_email) <= 254),
  CHECK (picture_url IS NULL OR length(picture_url) <= 2000)
);
ALTER TABLE public.sj_linkedin_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_linkedin_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sj_linkedin_oauth_states,
  public.sj_linkedin_connections FROM PUBLIC;
COMMIT;
