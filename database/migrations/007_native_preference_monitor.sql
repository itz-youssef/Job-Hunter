-- Independent subscriber-monitoring state and idempotent job notification queue.
-- Does NOT modify discovery history or the public jobs catalog.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sj_native_watch_state (
  user_id UUID PRIMARY KEY REFERENCES public.sj_users(id) ON DELETE CASCADE,
  preference_signature CHAR(64) NOT NULL,
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sj_native_watch_jobs (
  user_id UUID NOT NULL REFERENCES public.sj_users(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL CHECK(length(job_key) BETWEEN 1 AND 500),
  job_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK(status IN ('baseline','pending','sent','failed')),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  PRIMARY KEY(user_id,job_key),
  CHECK (octet_length(job_snapshot::text) <= 16000)
);
CREATE INDEX IF NOT EXISTS sj_native_watch_jobs_pending_idx
  ON public.sj_native_watch_jobs(user_id,status,discovered_at)
  WHERE status IN ('pending','failed');
ALTER TABLE public.sj_native_watch_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_native_watch_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sj_native_watch_state,public.sj_native_watch_jobs FROM PUBLIC;
COMMIT;
