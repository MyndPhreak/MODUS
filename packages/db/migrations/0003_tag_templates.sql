-- MODUS DB migration 0003 — tag templates (aka embed presets).
--
-- Adds two columns so a "saved embed" can coexist with a regular /tag:
--   is_template   — true for embeds saved from the builder as reusable presets
--                   (they are not invocable via /tag, but share the CRUD path).
--   description   — optional short note the author writes for themselves, e.g.
--                   "welcome message v2".
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so the file re-applies safely on a
-- partial run.

ALTER TABLE tags
    ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tags
    ADD COLUMN IF NOT EXISTS description TEXT;

-- Helpful for the presets UI that queries by template status.
CREATE INDEX IF NOT EXISTS tags_guild_template_idx
    ON tags (guild_id, is_template);
