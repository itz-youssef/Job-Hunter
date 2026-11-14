-- Record explicit acceptance at registration. Existing accounts remain NULL (no implied consent).
BEGIN;
ALTER TABLE public.sj_users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_version TEXT;
COMMIT;
