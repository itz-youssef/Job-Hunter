-- Secret J multi-user foundation for private Vercel serverless APIs.
-- This migration creates NEW prefixed tables only. No existing scanner state,
-- company list, SQLite baseline, notifications or CV backup is touched.
-- Auth/session logic is server-side (see api/_secretj); the browser NEVER
-- receives DATABASE_URL. Do not enable public Neon Data API access to tables.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sj_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  CHECK (length(password_hash) BETWEEN 50 AND 512)
);

CREATE TABLE IF NOT EXISTS public.sj_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.sj_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sj_sessions_user_id_idx
  ON public.sj_sessions (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS sj_sessions_expires_idx
  ON public.sj_sessions (expires_at);

-- Authentication attempts are throttled by server-side hashed IP/email keys.
CREATE TABLE IF NOT EXISTS public.sj_auth_attempts (
  key_hash CHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (attempts >= 0)
);

CREATE TABLE IF NOT EXISTS public.sj_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.sj_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  education TEXT NOT NULL DEFAULT '',
  linkedin TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  portfolio TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    length(display_name) <= 120 AND length(headline) <= 220
    AND length(location) <= 180 AND length(summary) <= 9000
    AND length(skills) <= 5000 AND length(experience) <= 12000
    AND length(education) <= 12000 AND length(linkedin) <= 500
    AND length(github) <= 500 AND length(portfolio) <= 500
  )
);

CREATE TABLE IF NOT EXISTS public.sj_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.sj_users(id) ON DELETE CASCADE,
  egypt_only BOOLEAN NOT NULL DEFAULT true,
  internships BOOLEAN NOT NULL DEFAULT true,
  max_experience_years SMALLINT NOT NULL DEFAULT 2
    CHECK (max_experience_years BETWEEN 0 AND 10),
  role_families TEXT[] NOT NULL DEFAULT ARRAY['software','ai_ml','cv','mlops'],
  email_alerts BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sj_saved_jobs (
  user_id UUID NOT NULL REFERENCES public.sj_users(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL,
  job_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,job_key),
  CHECK (length(job_key) BETWEEN 1 AND 500),
  CHECK (jsonb_typeof(job_snapshot) = 'object'),
  CHECK (octet_length(job_snapshot::text) <= 12000)
);
CREATE INDEX IF NOT EXISTS sj_saved_jobs_user_recent_idx
  ON public.sj_saved_jobs(user_id,saved_at DESC);

CREATE TABLE IF NOT EXISTS public.sj_applications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.sj_users(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'interested'
    CHECK (stage IN ('interested','applied','assessment','interview','offer','rejected','withdrawn')),
  notes TEXT NOT NULL DEFAULT '',
  applied_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,job_key),
  CHECK (length(job_key) BETWEEN 1 AND 500),
  CHECK (length(company) <= 180 AND length(title) <= 220 AND length(notes) <= 6000)
);
CREATE INDEX IF NOT EXISTS sj_applications_user_recent_idx
  ON public.sj_applications(user_id,updated_at DESC);

-- Small private CV and avatar blobs are temporary free-tier-friendly storage.
-- They are NEVER served publicly and require the owner's server-side session.
-- Larger files will need Neon Object Storage (future migration).
CREATE TABLE IF NOT EXISTS public.sj_cv_files (
  user_id UUID PRIMARY KEY REFERENCES public.sj_users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  content BYTEA NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 786432),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (length(original_name) <= 200),
  CHECK (octet_length(content) = size_bytes)
);
CREATE TABLE IF NOT EXISTS public.sj_avatars (
  user_id UUID PRIMARY KEY REFERENCES public.sj_users(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  content BYTEA NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 102400),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (octet_length(content) = size_bytes)
);

CREATE TABLE IF NOT EXISTS public.sj_admin_audit (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES public.sj_users(id),
  action TEXT NOT NULL,
  target_user_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sj_admin_audit_recent_idx
  ON public.sj_admin_audit (created_at DESC);

-- RLS denies any accidental access from non-owner DB roles: NO public
-- read/write policies are granted. The trusted Vercel server uses the Neon
-- owner connection and enforces user_id filters in EVERY private query.
-- RLS alone does not restrict the connection owner; ownership checks in API
-- code and session tests are mandatory. Never ship owner credentials to JS.
ALTER TABLE public.sj_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_cv_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_admin_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sj_users, public.sj_sessions, public.sj_auth_attempts,
  public.sj_profiles, public.sj_preferences, public.sj_saved_jobs,
  public.sj_applications, public.sj_cv_files, public.sj_avatars,
  public.sj_admin_audit FROM PUBLIC;
COMMIT;
