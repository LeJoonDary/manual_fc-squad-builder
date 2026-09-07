-- Existing duplicate card_id values cause this statement to fail without deleting data.
CREATE UNIQUE INDEX IF NOT EXISTS player_stats_card_id_seed_unique
ON public.player_stats (card_id);
