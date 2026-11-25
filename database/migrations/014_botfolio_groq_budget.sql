BEGIN;
-- Botfolio-only rolling Groq token reservations. No existing tables changed.
CREATE TABLE IF NOT EXISTS public.sj_botfolio_groq_budget (
 id SMALLINT PRIMARY KEY CHECK(id=1),
 reservations JSONB NOT NULL CHECK(jsonb_typeof(reservations)='array')
);
ALTER TABLE public.sj_botfolio_groq_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sj_botfolio_groq_budget FROM PUBLIC;
COMMIT;
