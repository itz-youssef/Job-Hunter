-- Additive career level subscriptions. Existing preferences retain legacy behavior.
BEGIN;
ALTER TABLE public.sj_preferences
  ADD COLUMN IF NOT EXISTS career_levels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
COMMIT;
