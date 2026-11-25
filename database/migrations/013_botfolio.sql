BEGIN;
-- New product tables only; no modification of Job Hunter or account schema.
CREATE TABLE IF NOT EXISTS public.sj_botfolio_bots (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES public.sj_users(id) ON DELETE CASCADE,
 slot SMALLINT NOT NULL CHECK(slot BETWEEN 1 AND 5),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 headline TEXT NOT NULL DEFAULT '' CHECK(length(headline)<=220),
 knowledge JSONB NOT NULL CHECK(jsonb_typeof(knowledge)='array' AND jsonb_array_length(knowledge) BETWEEN 1 AND 40),
 embedding_model TEXT NOT NULL,
 published BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,slot)
);
CREATE TABLE IF NOT EXISTS public.sj_botfolio_limits (
 bucket TEXT NOT NULL,
 day DATE NOT NULL,
 used INTEGER NOT NULL CHECK(used>=0),
 PRIMARY KEY(bucket,day)
);
ALTER TABLE public.sj_botfolio_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sj_botfolio_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sj_botfolio_bots, public.sj_botfolio_limits FROM PUBLIC;
COMMIT;
