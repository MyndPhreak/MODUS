/**
 * Appwrite → Postgres migration for every MODUS collection.
 *
 * Each collection is a `Migrator` that:
 *   1. Pages through the Appwrite collection with cursor pagination.
 *   2. Transforms each document to the repository's `upsertMigrated` shape.
 *   3. Writes with ON CONFLICT DO NOTHING on the preserved $id.
 *
 * Idempotent — re-run as many times as you want; already-migrated rows get
 * skipped. Resumable — if the script crashes, rerun and it picks up from
 * where it left off.
 *
 * Usage:
 *   pnpm --filter @modus/db run migrate:all [options]
 *
 * Options:
 *   --dry-run           Preview; no writes.
 *   --limit N           Cap total rows copied per collection.
 *   --only <name[,..]>  Restrict to specific collections (comma-separated).
 *   --skip <name[,..]>  Exclude specific collections.
 */
import { Client, Databases, Query } from "node-appwrite";

// Appwrite's Models.Document is strictly typed to $-prefixed fields only,
// so we relax to `any` for collection-specific fields. These are scripts,
// not library code — the shape validation happens at write time inside
// each repository's upsertMigrated.
type AppwriteDoc = Record<string, any>;
import { createDb } from "../src/client";
import { RecordingRepository } from "../src/repositories/recordings";
import { GuildConfigRepository } from "../src/repositories/guild-configs";
import { ServerRepository } from "../src/repositories/servers";
import { ModuleRepository } from "../src/repositories/modules";
import { BotStatusRepository } from "../src/repositories/bot-status";
import { LogRepository } from "../src/repositories/logs";
import { MilestoneUserRepository } from "../src/repositories/milestones";
import { AutomodRuleRepository } from "../src/repositories/automod";
import { AIUsageLogRepository } from "../src/repositories/ai-usage";
import { TagRepository } from "../src/repositories/tags";
import { TempVoiceChannelRepository } from "../src/repositories/temp-voice";
import { TriggerRepository } from "../src/repositories/triggers";

const DATABASE_ID = "discord_bot";
const PAGE_SIZE = 100;

interface Flags {
  dryRun: boolean;
  limit: number | null;
  only: Set<string> | null;
  skip: Set<string>;
}

function parseFlags(): Flags {
  const args = process.argv.slice(2);
  const flags: Flags = { dryRun: false, limit: null, only: null, skip: new Set() };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") flags.dryRun = true;
    else if (args[i] === "--limit") flags.limit = parseInt(args[++i], 10);
    else if (args[i] === "--only")
      flags.only = new Set(args[++i].split(",").map((s) => s.trim()));
    else if (args[i] === "--skip")
      flags.skip = new Set(args[++i].split(",").map((s) => s.trim()));
  }
  return flags;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function* paginate(
  databases: Databases,
  collectionId: string,
  flags: Flags,
): AsyncGenerator<AppwriteDoc> {
  let lastId: string | null = null;
  let produced = 0;

  while (true) {
    const queries = [Query.limit(PAGE_SIZE), Query.orderAsc("$id")];
    if (lastId) queries.push(Query.cursorAfter(lastId));

    const response = await databases.listDocuments(
      DATABASE_ID,
      collectionId,
      queries,
    );

    if (response.documents.length === 0) return;

    for (const doc of response.documents) {
      yield doc;
      produced++;
      if (flags.limit && produced >= flags.limit) return;
    }

    lastId = response.documents[response.documents.length - 1].$id;
    if (response.documents.length < PAGE_SIZE) return;
  }
}

interface Migrator {
  name: string;
  collectionId: string;
  /** Ordering rank — lower numbers run first (for FK ordering). */
  order: number;
  /** Returns a short description of what would be written (for dry run). */
  describe: (doc: AppwriteDoc) => string;
  /** Writes one document; idempotent via ON CONFLICT DO NOTHING. */
  write: (doc: AppwriteDoc) => Promise<void>;
}

function buildMigrators(repos: {
  recordings: RecordingRepository;
  guildConfigs: GuildConfigRepository;
  servers: ServerRepository;
  modules: ModuleRepository;
  botStatus: BotStatusRepository;
  logs: LogRepository;
  milestones: MilestoneUserRepository;
  automod: AutomodRuleRepository;
  aiUsage: AIUsageLogRepository;
  tags: TagRepository;
  tempVoice: TempVoiceChannelRepository;
  triggers: TriggerRepository;
}): Migrator[] {
  // Ordering rationale:
  //  1. Independent roots first (modules, servers, bot_status).
  //  2. Owner-dependent sets next (guild_configs depends on servers
  //     conceptually; logs, milestones, ai_usage depend on guild_id).
  //  3. recordings before recording_tracks (true FK).
  return [
    {
      name: "modules",
      collectionId: "modules",
      order: 10,
      describe: (d) => `${d.name}`,
      write: async (d) =>
        repos.modules.upsertMigrated({
          id: d.$id,
          name: d.name,
          description: d.description ?? null,
          enabled: Boolean(d.enabled),
          createdAt: d.$createdAt,
        }),
    },
    {
      name: "servers",
      collectionId: "servers",
      order: 20,
      describe: (d) => `${d.guild_id} (${d.name})`,
      write: async (d) =>
        repos.servers.upsertMigrated({
          id: d.$id,
          guild_id: d.guild_id,
          name: d.name,
          icon: d.icon ?? null,
          owner_id: d.owner_id ?? null,
          member_count:
            typeof d.member_count === "number" ? d.member_count : null,
          status: Boolean(d.status),
          ping: typeof d.ping === "number" ? d.ping : null,
          shard_id: typeof d.shard_id === "number" ? d.shard_id : null,
          last_checked: d.last_checked ?? null,
          is_public: Boolean(d.is_public),
          description: d.description ?? null,
          invite_link: d.invite_link ?? null,
          premium: Boolean(d.premium),
          admin_user_ids: Array.isArray(d.admin_user_ids)
            ? d.admin_user_ids
            : [],
          dashboard_role_ids: Array.isArray(d.dashboard_role_ids)
            ? d.dashboard_role_ids
            : [],
          createdAt: d.$createdAt,
        }),
    },
    {
      name: "bot_status",
      collectionId: "bot_status",
      order: 30,
      describe: (d) => `${d.$id} (shard ${d.shard_id})`,
      write: async (d) =>
        repos.botStatus.upsertMigrated({
          id: d.$id,
          botId: d.bot_id,
          lastSeen: d.last_seen,
          version: d.version ?? null,
          shardId: typeof d.shard_id === "number" ? d.shard_id : 0,
          totalShards:
            typeof d.total_shards === "number" ? d.total_shards : 1,
        }),
    },
    {
      name: "guild_configs",
      collectionId: "guild_configs",
      order: 40,
      describe: (d) => `${d.guildId}/${d.moduleName}`,
      write: async (d) => {
        let settings: Record<string, any> = {};
        if (d.settings) {
          try {
            settings =
              typeof d.settings === "string"
                ? JSON.parse(d.settings)
                : d.settings;
          } catch {
            // leave as empty
          }
        }
        await repos.guildConfigs.upsertMigrated({
          id: d.$id,
          guildId: d.guildId,
          moduleName: d.moduleName,
          enabled: d.enabled !== false,
          settings,
          createdAt: d.$createdAt,
        });
      },
    },
    {
      name: "logs",
      collectionId: "logs",
      order: 50,
      describe: (d) => `${d.level} ${d.guildId} @ ${d.timestamp}`,
      write: async (d) =>
        repos.logs.upsertMigrated({
          id: d.$id,
          guildId: d.guildId,
          message: d.message,
          level: d.level,
          timestamp: d.timestamp,
          shardId: typeof d.shardId === "number" ? d.shardId : null,
          source: d.source ?? null,
        }),
    },
    {
      name: "recordings",
      collectionId: "recordings",
      order: 60,
      describe: (d) => `${d.$id} (${d.guild_id})`,
      write: async (d) =>
        repos.recordings.upsertMigratedRecording(
          {
            id: d.$id,
            guild_id: d.guild_id,
            channel_name: d.channel_name,
            recorded_by: d.recorded_by,
            title: d.title ?? null,
            mixed_file_id: d.mixed_file_id || null,
            duration: typeof d.duration === "number" ? d.duration : null,
            bitrate: typeof d.bitrate === "number" ? d.bitrate : null,
            multitrack: Boolean(d.multitrack),
            participants: d.participants || "[]",
            started_at: d.started_at,
            ended_at: d.ended_at || null,
          },
          d.$createdAt,
        ),
    },
    {
      name: "recording_tracks",
      collectionId: "recording_tracks",
      order: 61, // must follow recordings
      describe: (d) => `${d.$id} → ${d.recording_id}`,
      write: async (d) =>
        repos.recordings.upsertMigratedTrack(
          {
            id: d.$id,
            recording_id: d.recording_id,
            guild_id: d.guild_id,
            user_id: d.user_id,
            username: d.username,
            file_id: d.file_id,
            file_size: typeof d.file_size === "number" ? d.file_size : null,
            start_offset:
              typeof d.start_offset === "number" ? d.start_offset : 0,
            segments: d.segments || "[]",
          },
          d.$createdAt,
        ),
    },
    {
      name: "milestone_users",
      collectionId: "milestone_users",
      order: 70,
      describe: (d) => `${d.guild_id}/${d.user_id}`,
      write: async (d) =>
        repos.milestones.upsertMigrated({
          id: d.$id,
          guild_id: d.guild_id,
          user_id: d.user_id,
          username: d.username,
          char_count: typeof d.char_count === "number" ? d.char_count : 0,
          last_milestone:
            typeof d.last_milestone === "number" ? d.last_milestone : 0,
          notification_pref: d.notification_pref || "public",
          opted_in: Boolean(d.opted_in),
          createdAt: d.$createdAt,
        }),
    },
    {
      name: "automod_rules",
      collectionId: "automod_rules",
      order: 80,
      describe: (d) => `${d.guild_id}/${d.name}`,
      write: async (d) =>
        repos.automod.upsertMigrated({
          id: d.$id,
          guild_id: d.guild_id,
          name: d.name,
          enabled: d.enabled !== false,
          priority: typeof d.priority === "number" ? d.priority : 0,
          trigger: d.trigger,
          conditions: d.conditions,
          actions: d.actions,
          exempt_roles: d.exempt_roles ?? "",
          exempt_channels: d.exempt_channels ?? "",
          cooldown: typeof d.cooldown === "number" ? d.cooldown : null,
          created_by: d.created_by ?? null,
          updated_at: d.updated_at ?? null,
          createdAt: d.$createdAt,
        }),
    },
    {
      name: "ai_usage_log",
      collectionId: "ai_usage_log",
      order: 90,
      describe: (d) => `${d.guildId} ${d.provider}/${d.model}`,
      write: async (d) =>
        repos.aiUsage.upsertMigrated({
          id: d.$id,
          guildId: d.guildId,
          userId: d.userId,
          provider: d.provider,
          model: d.model,
          input_tokens:
            typeof d.input_tokens === "number" ? d.input_tokens : null,
          output_tokens:
            typeof d.output_tokens === "number" ? d.output_tokens : null,
          total_tokens:
            typeof d.total_tokens === "number" ? d.total_tokens : null,
          estimated_cost:
            typeof d.estimated_cost === "number" ? d.estimated_cost : null,
          action: d.action || "chat",
          key_source: d.key_source ?? null,
          timestamp: d.timestamp,
        }),
    },
    {
      name: "tags",
      collectionId: "tags",
      order: 100,
      describe: (d) => `${d.guild_id}/${d.name}`,
      write: async (d) =>
        repos.tags.upsertMigrated({
          id: d.$id,
          guild_id: d.guild_id,
          name: d.name,
          content: d.content ?? null,
          embed_data: d.embed_data ?? null,
          allowed_roles: d.allowed_roles ?? "",
          created_by: d.created_by ?? null,
          updated_at: d.updated_at ?? null,
          createdAt: d.$createdAt,
        }),
    },
    {
      name: "temp_voice_channels",
      collectionId: "temp_voice_channels",
      order: 110,
      describe: (d) => `${d.guild_id}/${d.channel_id}`,
      write: async (d) =>
        repos.tempVoice.upsertMigrated({
          id: d.$id,
          guild_id: d.guild_id,
          channel_id: d.channel_id,
          owner_id: d.owner_id,
          lobby_channel_id: d.lobby_channel_id,
          createdAt: d.$createdAt,
        }),
    },
    {
      name: "triggers",
      collectionId: "triggers",
      order: 120,
      describe: (d) => `${d.guild_id}/${d.name}`,
      write: async (d) =>
        repos.triggers.upsertMigrated({
          id: d.$id,
          guild_id: d.guild_id,
          name: d.name,
          secret: d.secret,
          provider: d.provider,
          channel_id: d.channel_id,
          embed_template: d.embed_template ?? null,
          filters: d.filters ?? null,
          created_by: d.created_by ?? null,
          enabled: d.enabled !== false,
          createdAt: d.$createdAt,
        }),
    },
  ];
}

async function runMigrator(
  databases: Databases,
  migrator: Migrator,
  flags: Flags,
) {
  console.log(`\n── ${migrator.name} ──────────────────────────────────────`);
  let count = 0;
  let skipped = 0;

  for await (const doc of paginate(databases, migrator.collectionId, flags)) {
    if (flags.dryRun) {
      console.log(`  [dry-run] ${migrator.describe(doc)}`);
      count++;
      continue;
    }
    try {
      await migrator.write(doc);
      count++;
      if (count % 100 === 0) console.log(`  migrated ${count}…`);
    } catch (err) {
      skipped++;
      console.warn(
        `  skip ${doc.$id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`  done: ${count} migrated, ${skipped} skipped`);
  return { count, skipped };
}

async function main() {
  const flags = parseFlags();
  console.log(
    `Appwrite → Postgres migration${flags.dryRun ? " (dry run)" : ""}`,
  );
  if (flags.only) console.log(`  only: ${[...flags.only].join(", ")}`);
  if (flags.skip.size > 0) console.log(`  skip: ${[...flags.skip].join(", ")}`);

  const appwriteClient = new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT_ID"))
    .setKey(requireEnv("APPWRITE_API_KEY"));
  const databases = new Databases(appwriteClient);

  requireEnv("DATABASE_URL");
  const { db, pool } = createDb();

  const repos = {
    recordings: new RecordingRepository(db),
    guildConfigs: new GuildConfigRepository(db),
    servers: new ServerRepository(db),
    modules: new ModuleRepository(db),
    botStatus: new BotStatusRepository(db),
    logs: new LogRepository(db),
    milestones: new MilestoneUserRepository(db),
    automod: new AutomodRuleRepository(db),
    aiUsage: new AIUsageLogRepository(db),
    tags: new TagRepository(db),
    tempVoice: new TempVoiceChannelRepository(db),
    triggers: new TriggerRepository(db),
  };

  const migrators = buildMigrators(repos)
    .filter((m) => !flags.only || flags.only.has(m.name))
    .filter((m) => !flags.skip.has(m.name))
    .sort((a, b) => a.order - b.order);

  const summary: Array<{ name: string; count: number; skipped: number }> = [];
  try {
    for (const migrator of migrators) {
      const { count, skipped } = await runMigrator(databases, migrator, flags);
      summary.push({ name: migrator.name, count, skipped });
    }

    console.log("\n── summary ────────────────────────────────────────────────");
    for (const row of summary) {
      console.log(
        `  ${row.name.padEnd(22)} ${String(row.count).padStart(8)} migrated  ${String(row.skipped).padStart(4)} skipped`,
      );
    }
    if (flags.dryRun) console.log("  (dry-run — no writes performed)");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
