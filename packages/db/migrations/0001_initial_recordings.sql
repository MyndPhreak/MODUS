-- MODUS DB migration 0001 — initial recordings tables.
--
-- Keep migrations idempotent (IF NOT EXISTS) so re-running in dev doesn't
-- error out. A dedicated migration table tracks which files have been
-- applied; see scripts/run-migrations.ts.

-- gen_random_uuid() for TEXT primary keys generated server-side.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS recordings (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id        TEXT        NOT NULL,
    channel_name    TEXT        NOT NULL,
    recorded_by     TEXT        NOT NULL,
    title           TEXT,
    mixed_file_id   TEXT,
    duration        INTEGER,
    bitrate         INTEGER,
    multitrack      BOOLEAN     NOT NULL DEFAULT FALSE,
    participants    TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recordings_guild_started_at_idx
    ON recordings (guild_id, started_at DESC);

CREATE INDEX IF NOT EXISTS recordings_started_at_idx
    ON recordings (started_at);

CREATE TABLE IF NOT EXISTS recording_tracks (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    recording_id    TEXT        NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    guild_id        TEXT        NOT NULL,
    user_id         TEXT        NOT NULL,
    username        TEXT        NOT NULL,
    file_id         TEXT        NOT NULL,
    file_size       INTEGER,
    start_offset    INTEGER     NOT NULL DEFAULT 0,
    segments        JSONB       NOT NULL DEFAULT '[]'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recording_tracks_recording_id_idx
    ON recording_tracks (recording_id);
