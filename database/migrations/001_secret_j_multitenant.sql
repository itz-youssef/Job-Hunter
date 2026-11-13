-- Secret J / Job Hunter multi-user foundation.
-- Apply ONLY after enabling Neon Managed Better Auth AND the Data API.
-- Managed auth accounts/sessions live in Neon-managed neon_auth.* tables.
-- Never store passwords here, or expose a privileged Postgres connection to JS.
--
-- This migration intentionally DOES NOT modify existing Job Hunter jobs, SQLite
-- history, scanning adapters, notification state, or GitHub Actions workflows.
-- Run once on a Neon development branch, verify RLS, then apply to production.
BEGIN;

-- Fail loudly rather than silently creating tables with broken authorization.
DO $$
BEGIN
  IF to_regprocedure('auth.user_id()') IS NULL THEN
    RAISE EXCEPTION
      'Enable Neon Managed Better Auth and Neon Data API before applying this migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Missing Neon Data API authenticated role';
  END IF;
END;
$$;

-- Only the member may create/edit their own personal profile.
-- User id is Better Auth's opaque TEXT subject, not assumed to be a UUID.
CREATE TABLE public.secret_j_profiles (
  user_id TEXT PRIMARY KEY DEFAULT (auth.user_id()),
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  headline VARCHAR(220) NOT NULL DEFAULT '',
  location VARCHAR(160) NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience JSONB NOT NULL DEFAULT '[]'::jsonb,
  education JSONB NOT NULL DEFAULT '[]'::jsonb,
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  avatar_object_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT secret_j_profile_skills_array CHECK (jsonb_typeof(skills) = 'array'),
  CONSTRAINT secret_j_profile_experience_array CHECK (jsonb_typeof(experience) = 'array'),
  CONSTRAINT secret_j_profile_education_array CHECK (jsonb_typeof(education) = 'array'),
  CONSTRAINT secret_j_profile_text_limit CHECK (
    octet_length(summary) <= 20000
    AND octet_length(skills::text) <= 30000
    AND octet_length(experience::text) <= 60000
    AND octet_length(education::text) <= 30000
  )
);

-- DO NOT permit browser clients to promote themselves to admin.
-- Admin assignment/removal uses a privileged, separately authenticated
-- management process, with a recorded audit event.
CREATE TABLE public.secret_j_user_roles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'admin')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by TEXT,
  CONSTRAINT secret_j_role_nonempty_user CHECK (length(user_id) > 0)
);

CREATE TABLE public.secret_j_job_preferences (
  user_id TEXT PRIMARY KEY DEFAULT (auth.user_id()),
  egypt_only BOOLEAN NOT NULL DEFAULT true,
  include_internships BOOLEAN NOT NULL DEFAULT true,
  max_experience_years SMALLINT NOT NULL DEFAULT 2
    CHECK (max_experience_years BETWEEN 0 AND 10),
  role_families TEXT[] NOT NULL DEFAULT ARRAY[
    'software', 'ai_ml', 'computer_vision', 'mlops'
  ]::TEXT[],
  keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  email_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Use the job identity from the current job snapshot for now; no scanner changes.
-- A later migration can reference a canonical Neon jobs table after a safe
-- verified history import. Browser MUST escape job_snapshot when rendering.
CREATE TABLE public.secret_j_saved_jobs (
  user_id TEXT NOT NULL DEFAULT (auth.user_id()),
  job_key TEXT NOT NULL,
  job_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_key),
  CONSTRAINT secret_j_saved_job_key_limit CHECK (length(job_key) BETWEEN 1 AND 2048),
  CONSTRAINT secret_j_saved_job_snapshot_object CHECK (jsonb_typeof(job_snapshot) = 'object'),
  CONSTRAINT secret_j_saved_job_snapshot_limit CHECK (octet_length(job_snapshot::text) <= 16000)
);
CREATE INDEX secret_j_saved_jobs_recent_idx
  ON public.secret_j_saved_jobs (user_id, saved_at DESC);

CREATE TABLE public.secret_j_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT (auth.user_id()),
  job_key TEXT NOT NULL,
  employer_name VARCHAR(180) NOT NULL DEFAULT '',
  job_title VARCHAR(220) NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'interested'
    CHECK (stage IN ('interested','applied','assessment','interview','offer','rejected','withdrawn')),
  applied_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_key),
  CONSTRAINT secret_j_application_job_key_limit CHECK (length(job_key) BETWEEN 1 AND 2048),
  CONSTRAINT secret_j_application_notes_limit CHECK (octet_length(notes) <= 16000)
);
CREATE INDEX secret_j_applications_recent_idx
  ON public.secret_j_applications (user_id, updated_at DESC);

-- Files are NEVER stored in PostgreSQL public rows. Only metadata is here;
-- original PDFs/DOCX/photos must live in a PRIVATE Object Storage bucket.
-- Signing, MIME verification, size checks and per-user object-key enforcement
-- must be performed server-side before any private upload/download URL is issued.
CREATE TABLE public.secret_j_cv_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT (auth.user_id()),
  original_name VARCHAR(255) NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  object_key TEXT NOT NULL UNIQUE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT secret_j_cv_object_key_limit CHECK (length(object_key) BETWEEN 8 AND 1024)
);
CREATE INDEX secret_j_cv_documents_user_idx
  ON public.secret_j_cv_documents (user_id, uploaded_at DESC);
CREATE UNIQUE INDEX secret_j_cv_one_primary_per_user
  ON public.secret_j_cv_documents (user_id) WHERE is_primary;

-- A privileged backend owns the administrative audit log; browser users
-- must have NO direct select/insert/update/delete access.
CREATE TABLE public.secret_j_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT secret_j_admin_audit_detail_limit CHECK (octet_length(detail::text) <= 16000)
);
CREATE INDEX secret_j_admin_audit_recent_idx
  ON public.secret_j_admin_audit (happened_at DESC);

-- Defense in depth when queries are made through the Neon Data API.
-- A privileged DATABASE_URL connection may bypass RLS: server handlers MUST
-- always verify sessions and enforce ownership/authorization independently.
ALTER TABLE public.secret_j_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_j_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_j_job_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_j_saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_j_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_j_cv_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_j_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY secret_j_profiles_owner
  ON public.secret_j_profiles FOR ALL TO authenticated
  USING (user_id = (SELECT auth.user_id()))
  WITH CHECK (user_id = (SELECT auth.user_id()));

CREATE POLICY secret_j_preferences_owner
  ON public.secret_j_job_preferences FOR ALL TO authenticated
  USING (user_id = (SELECT auth.user_id()))
  WITH CHECK (user_id = (SELECT auth.user_id()));

CREATE POLICY secret_j_saved_jobs_owner
  ON public.secret_j_saved_jobs FOR ALL TO authenticated
  USING (user_id = (SELECT auth.user_id()))
  WITH CHECK (user_id = (SELECT auth.user_id()));

CREATE POLICY secret_j_applications_owner
  ON public.secret_j_applications FOR ALL TO authenticated
  USING (user_id = (SELECT auth.user_id()))
  WITH CHECK (user_id = (SELECT auth.user_id()));

CREATE POLICY secret_j_cv_documents_owner
  ON public.secret_j_cv_documents FOR ALL TO authenticated
  USING (user_id = (SELECT auth.user_id()))
  WITH CHECK (user_id = (SELECT auth.user_id()));

-- A signed-in user can read their own role, but never write it.
CREATE POLICY secret_j_roles_read_self
  ON public.secret_j_user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.user_id()));

-- Explicitly revoke any broad automatic grants before allowing data access.
REVOKE ALL ON TABLE public.secret_j_profiles,
  public.secret_j_user_roles, public.secret_j_job_preferences,
  public.secret_j_saved_jobs, public.secret_j_applications,
  public.secret_j_cv_documents, public.secret_j_admin_audit
  FROM PUBLIC, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.secret_j_profiles, public.secret_j_job_preferences,
  public.secret_j_saved_jobs, public.secret_j_applications,
  public.secret_j_cv_documents
  TO authenticated;
GRANT SELECT ON TABLE public.secret_j_user_roles TO authenticated;
-- No grants on secret_j_admin_audit. No browser mutation grants on user_roles.

COMMIT;
