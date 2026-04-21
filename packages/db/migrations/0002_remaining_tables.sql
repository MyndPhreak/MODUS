-- MODUS DB migration 0002 — remaining Appwrite collections.
--
-- Brings the 11 non-recording collections across. Everything is idempotent
-- (IF NOT EXISTS) so a partial run followed by another invocation finishes
-- the work without errors.

-- ── modules ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name        TEXT        NOT NULL,
    description TEXT,
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS modules_name_idx ON modules (name);

-- ── servers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servers (
    id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id            TEXT        NOT NULL,
    name                TEXT        NOT NULL,
    icon                TEXT,
    owner_id            TEXT,
    member_count        INTEGER,
    status              BOOLEAN     NOT NULL DEFAULT FALSE,
    ping                INTEGER,
    shard_id            INTEGER,
    last_checked        TIMESTAMPTZ,
    is_public           BOOLEAN     NOT NULL DEFAULT FALSE,
    description         TEXT,
    invite_link         TEXT,
    premium             BOOLEAN     NOT NULL DEFAULT FALSE,
    admin_user_ids      TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    dashboard_role_ids  TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS servers_guild_id_idx ON servers (guild_id);
CREATE INDEX IF NOT EXISTS servers_owner_id_idx ON servers (owner_id);

-- ── guild_configs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guild_configs (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id    TEXT        NOT NULL,
    module_name TEXT        NOT NULL,
    enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    settings    JSONB       NOT NULL DEFAULT '{}'::JSONB,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS guild_configs_guild_module_idx
    ON guild_configs (guild_id, module_name);
CREATE INDEX IF NOT EXISTS guild_configs_guild_id_idx ON guild_configs (guild_id);
CREATE INDEX IF NOT EXISTS guild_configs_module_enabled_idx
    ON guild_configs (module_name, enabled);

-- ── bot_status ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_status (
    id           TEXT        PRIMARY KEY,
    bot_id       TEXT        NOT NULL,
    last_seen    TIMESTAMPTZ NOT NULL,
    version      TEXT,
    shard_id     INTEGER     NOT NULL,
    total_shards INTEGER     NOT NULL
);

-- ── logs ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id    TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    level       TEXT        NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL,
    shard_id    INTEGER,
    source      TEXT
);

CREATE INDEX IF NOT EXISTS logs_guild_timestamp_idx ON logs (guild_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS logs_timestamp_idx ON logs (timestamp DESC);

-- ── milestone_users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestone_users (
    id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id          TEXT        NOT NULL,
    user_id           TEXT        NOT NULL,
    username          TEXT        NOT NULL,
    char_count        INTEGER     NOT NULL DEFAULT 0,
    last_milestone    INTEGER     NOT NULL DEFAULT 0,
    notification_pref TEXT        NOT NULL DEFAULT 'public',
    opted_in          BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS milestone_users_guild_user_idx
    ON milestone_users (guild_id, user_id);
CREATE INDEX IF NOT EXISTS milestone_users_guild_chars_idx
    ON milestone_users (guild_id, char_count DESC);

-- ── automod_rules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automod_rules (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id        TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
    priority        INTEGER     NOT NULL DEFAULT 0,
    trigger         TEXT        NOT NULL,
    conditions      JSONB       NOT NULL DEFAULT '{}'::JSONB,
    actions         JSONB       NOT NULL DEFAULT '[]'::JSONB,
    exempt_roles    TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    exempt_channels TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    cooldown        INTEGER,
    created_by      TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automod_rules_guild_idx ON automod_rules (guild_id);
CREATE INDEX IF NOT EXISTS automod_rules_guild_enabled_idx
    ON automod_rules (guild_id, enabled);
CREATE INDEX IF NOT EXISTS automod_rules_guild_trigger_idx
    ON automod_rules (guild_id, trigger);

-- ── ai_usage_log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id              TEXT              PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id        TEXT              NOT NULL,
    user_id         TEXT              NOT NULL,
    provider        TEXT              NOT NULL,
    model           TEXT              NOT NULL,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    total_tokens    INTEGER,
    estimated_cost  DOUBLE PRECISION,
    action          TEXT              NOT NULL DEFAULT 'chat',
    key_source      TEXT,
    timestamp       TIMESTAMPTZ       NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_usage_log_guild_timestamp_idx
    ON ai_usage_log (guild_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_user_timestamp_idx
    ON ai_usage_log (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS ai_usage_log_timestamp_idx
    ON ai_usage_log (timestamp DESC);

-- ── tags ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
    id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id       TEXT        NOT NULL,
    name           TEXT        NOT NULL,
    content        TEXT,
    embed_data     JSONB,
    allowed_roles  TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_by     TEXT,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_guild_name_idx ON tags (guild_id, name);
CREATE INDEX IF NOT EXISTS tags_guild_idx ON tags (guild_id);

-- ── temp_voice_channels ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS temp_voice_channels (
    id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id          TEXT        NOT NULL,
    channel_id        TEXT        NOT NULL,
    owner_id          TEXT        NOT NULL,
    lobby_channel_id  TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS temp_voice_channels_channel_id_idx
    ON temp_voice_channels (channel_id);
CREATE INDEX IF NOT EXISTS temp_voice_channels_guild_idx
    ON temp_voice_channels (guild_id);
CREATE INDEX IF NOT EXISTS temp_voice_channels_guild_owner_idx
    ON temp_voice_channels (guild_id, owner_id);

-- ── triggers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS triggers (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    guild_id        TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    secret          TEXT        NOT NULL,
    provider        TEXT        NOT NULL,
    channel_id      TEXT        NOT NULL,
    embed_template  JSONB,
    filters         JSONB,
    created_by      TEXT,
    enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS triggers_secret_idx ON triggers (secret);
CREATE UNIQUE INDEX IF NOT EXISTS triggers_guild_name_idx ON triggers (guild_id, name);
CREATE INDEX IF NOT EXISTS triggers_guild_idx ON triggers (guild_id);
CREATE INDEX IF NOT EXISTS triggers_guild_enabled_idx ON triggers (guild_id, enabled);
