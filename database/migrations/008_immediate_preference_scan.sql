-- Debounce authenticated immediate preference scans per member.
-- Isolated from the periodic scanner, public catalog, and email alert queue.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sj_native_scan_requests (
 user_id UUID PRIMARY KEY REFERENCES public.sj_users(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK (status IN ('running','complete','failed')),
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 completed_at TIMESTAMPTZ,
 last_error TEXT,
 CHECK (last_error IS NULL OR length(last_error) <= 180)
);
ALTER TABLE public.sj_native_scan_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sj_native_scan_requests FROM PUBLIC;
COMMIT;
