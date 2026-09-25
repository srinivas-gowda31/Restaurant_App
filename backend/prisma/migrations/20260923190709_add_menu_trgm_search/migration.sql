-- Enable fuzzy/typo-tolerant text matching so guest searches (especially voice
-- transcriptions) can find menu items even without an exact substring match.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "MenuItem_name_trgm_idx" ON "MenuItem" USING gin (name gin_trgm_ops);
