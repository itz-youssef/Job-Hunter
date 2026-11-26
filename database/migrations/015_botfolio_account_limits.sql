BEGIN;
-- Expand the existing per-owner slot range; preserve every bot and its ID.
-- Application authorization and UNIQUE(user_id,slot) enforce member capacity.
ALTER TABLE public.sj_botfolio_bots DROP CONSTRAINT IF EXISTS sj_botfolio_bots_slot_check;
ALTER TABLE public.sj_botfolio_bots ALTER COLUMN slot TYPE integer;
ALTER TABLE public.sj_botfolio_bots ADD CONSTRAINT sj_botfolio_bots_slot_check CHECK(slot >= 1);
COMMIT;
