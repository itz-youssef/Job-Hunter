-- The experience filter is optional. Null means no experience restriction.
-- Keep all existing preferences and alert subscriptions unchanged.
BEGIN;
ALTER TABLE public.sj_preferences
  ALTER COLUMN max_experience_years DROP NOT NULL,
  ALTER COLUMN max_experience_years DROP DEFAULT;
ALTER TABLE public.sj_preferences
  DROP CONSTRAINT IF EXISTS sj_preferences_max_experience_years_check;
ALTER TABLE public.sj_preferences
  ADD CONSTRAINT sj_preferences_max_experience_years_check
  CHECK (max_experience_years IS NULL OR max_experience_years BETWEEN 0 AND 30);
-- New preference rows, if inserted by other integrations, start unrestricted.
ALTER TABLE public.sj_preferences
  ALTER COLUMN egypt_only SET DEFAULT false,
  ALTER COLUMN internships SET DEFAULT false,
  ALTER COLUMN role_families SET DEFAULT ARRAY[]::text[];
COMMIT;
