-- Ticket transcript snapshots captured at close time.
-- Slug `id` is the public URL token (24-char nanoid), also the R2 prefix.

CREATE TABLE IF NOT EXISTS ticket_transcripts (
  id                        TEXT        PRIMARY KEY,
  guild_id                  TEXT        NOT NULL,
  ticket_id                 INTEGER     NOT NULL,
  thread_id                 TEXT        NOT NULL UNIQUE,
  thread_name               TEXT        NOT NULL,
  opener_id                 TEXT        NOT NULL,
  claimed_by_id             TEXT,
  closed_by_id              TEXT        NOT NULL,
  type_id                   TEXT,
  priority                  TEXT        NOT NULL,
  participant_ids           TEXT[]      NOT NULL DEFAULT ARRAY[]::text[],
  opened_at                 TIMESTAMPTZ NOT NULL,
  closed_at                 TIMESTAMPTZ NOT NULL,
  expires_at                TIMESTAMPTZ,
  message_count             INTEGER     NOT NULL DEFAULT 0,
  has_skipped_attachments   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_transcripts_guild_closed_idx
  ON ticket_transcripts (guild_id, closed_at DESC);

CREATE INDEX IF NOT EXISTS ticket_transcripts_opener_idx
  ON ticket_transcripts (opener_id);

CREATE INDEX IF NOT EXISTS ticket_transcripts_expires_idx
  ON ticket_transcripts (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS ticket_messages (
  id                  BIGSERIAL   PRIMARY KEY,
  transcript_id       TEXT        NOT NULL REFERENCES ticket_transcripts(id) ON DELETE CASCADE,
  discord_message_id  TEXT        NOT NULL,
  author_id           TEXT        NOT NULL,
  author_tag          TEXT        NOT NULL,
  author_avatar_url   TEXT,
  author_is_bot       BOOLEAN     NOT NULL DEFAULT FALSE,
  content             TEXT        NOT NULL DEFAULT '',
  embeds              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  attachments         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ticket_messages_transcript_created_idx
  ON ticket_messages (transcript_id, created_at ASC);
