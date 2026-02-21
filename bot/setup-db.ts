/**
 * Appwrite Database Schema Setup
 *
 * Idempotent script — safe to run multiple times.
 * Creates the database, collections, attributes, and indexes
 * required by the bot and dashboard.
 *
 * Usage:  pnpm run setup-db
 */

import "dotenv/config";
import { Client, Databases, IndexType, Storage } from "node-appwrite";

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

const DATABASE_ID = "discord_bot";
const DATABASE_NAME = "Discord Bot";
const RECORDINGS_BUCKET_ID = "recordings";

interface AttributeDef {
  key: string;
  type: "string" | "integer" | "boolean" | "float" | "enum";
  size?: number; // for string/enum
  required: boolean;
  default?: any;
  array?: boolean;
  enumValues?: string[];
}

interface IndexDef {
  key: string;
  type: "key" | "fulltext" | "unique";
  attributes: string[];
  orders?: ("ASC" | "DESC")[];
}

interface CollectionDef {
  id: string;
  name: string;
  attributes: AttributeDef[];
  indexes: IndexDef[];
  permissions?: string[];
}

// ──────────────────────────────────────────────
// Schema definitions — add new collections here
// ──────────────────────────────────────────────

const collections: CollectionDef[] = [
  {
    id: "modules",
    name: "Modules",
    attributes: [
      { key: "name", type: "string", size: 128, required: true },
      { key: "description", type: "string", size: 1024, required: false },
      { key: "enabled", type: "boolean", required: true, default: true },
    ],
    indexes: [{ key: "idx_name", type: "unique", attributes: ["name"] }],
  },
  {
    id: "servers",
    name: "Servers",
    attributes: [
      { key: "guild_id", type: "string", size: 64, required: true },
      { key: "name", type: "string", size: 256, required: true },
      { key: "icon", type: "string", size: 512, required: false },
      { key: "owner_id", type: "string", size: 64, required: false },
      { key: "member_count", type: "integer", required: false },
      { key: "status", type: "boolean", required: false, default: false },
      { key: "ping", type: "integer", required: false },
      { key: "shard_id", type: "integer", required: false },
      { key: "last_checked", type: "string", size: 64, required: false },
      { key: "is_public", type: "boolean", required: false, default: false },
      { key: "description", type: "string", size: 1024, required: false },
      { key: "invite_link", type: "string", size: 512, required: false },
      { key: "premium", type: "boolean", required: false, default: false },
      {
        key: "admin_user_ids",
        type: "string",
        size: 64,
        required: false,
        array: true,
      },
    ],
    indexes: [
      { key: "idx_guild_id", type: "unique", attributes: ["guild_id"] },
      { key: "idx_owner_id", type: "key", attributes: ["owner_id"] },
      {
        key: "idx_admin_user_ids",
        type: "key",
        attributes: ["admin_user_ids"],
      },
    ],
  },
  {
    id: "guild_configs",
    name: "Guild Configs",
    attributes: [
      { key: "guildId", type: "string", size: 64, required: true },
      { key: "moduleName", type: "string", size: 128, required: true },
      { key: "enabled", type: "boolean", required: true, default: true },
      { key: "settings", type: "string", size: 16384, required: false },
    ],
    indexes: [
      {
        key: "idx_guild_module",
        type: "unique",
        attributes: ["guildId", "moduleName"],
      },
      { key: "idx_guildId", type: "key", attributes: ["guildId"] },
    ],
  },
  {
    id: "bot_status",
    name: "Bot Status",
    attributes: [
      { key: "bot_id", type: "string", size: 64, required: true },
      { key: "last_seen", type: "string", size: 64, required: true },
      { key: "version", type: "string", size: 32, required: false },
      { key: "shard_id", type: "integer", required: false },
      { key: "total_shards", type: "integer", required: false },
    ],
    indexes: [],
  },
  {
    id: "logs",
    name: "Logs",
    attributes: [
      { key: "guildId", type: "string", size: 64, required: true },
      { key: "message", type: "string", size: 2048, required: true },
      { key: "level", type: "string", size: 16, required: true },
      { key: "timestamp", type: "string", size: 64, required: true },
      { key: "shardId", type: "integer", required: false },
      { key: "source", type: "string", size: 128, required: false },
    ],
    indexes: [
      { key: "idx_guildId", type: "key", attributes: ["guildId"] },
      {
        key: "idx_timestamp",
        type: "key",
        attributes: ["timestamp"],
        orders: ["DESC"],
      },
      {
        key: "idx_guild_timestamp",
        type: "key",
        attributes: ["guildId", "timestamp"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: "recordings",
    name: "Recordings",
    attributes: [
      { key: "guild_id", type: "string", size: 64, required: true },
      { key: "channel_name", type: "string", size: 256, required: true },
      { key: "recorded_by", type: "string", size: 64, required: true },
      { key: "mixed_file_id", type: "string", size: 128, required: false },
      { key: "duration", type: "integer", required: false },
      { key: "started_at", type: "string", size: 64, required: true },
      { key: "ended_at", type: "string", size: 64, required: false },
      { key: "title", type: "string", size: 256, required: false },
      { key: "participants", type: "string", size: 4096, required: false },
      { key: "bitrate", type: "integer", required: false },
    ],
    indexes: [
      { key: "idx_guild_id", type: "key", attributes: ["guild_id"] },
      {
        key: "idx_guild_started",
        type: "key",
        attributes: ["guild_id", "started_at"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: "recording_tracks",
    name: "Recording Tracks",
    attributes: [
      { key: "recording_id", type: "string", size: 128, required: true },
      { key: "guild_id", type: "string", size: 64, required: true },
      { key: "user_id", type: "string", size: 64, required: true },
      { key: "username", type: "string", size: 256, required: true },
      { key: "file_id", type: "string", size: 128, required: true },
      { key: "file_size", type: "integer", required: false },
      { key: "start_offset", type: "integer", required: false },
      { key: "segments", type: "string", size: 16384, required: false },
    ],
    indexes: [
      {
        key: "idx_recording_id",
        type: "key",
        attributes: ["recording_id"],
      },
      { key: "idx_guild_id", type: "key", attributes: ["guild_id"] },
    ],
  },
  {
    id: "milestone_users",
    name: "Milestone Users",
    attributes: [
      { key: "guild_id", type: "string", size: 64, required: true },
      { key: "user_id", type: "string", size: 64, required: true },
      { key: "username", type: "string", size: 256, required: true },
      { key: "char_count", type: "integer", required: true },
      { key: "last_milestone", type: "integer", required: true },
      {
        key: "notification_pref",
        type: "enum",
        enumValues: ["public", "private", "silent"],
        required: true,
      },
      { key: "opted_in", type: "boolean", required: true },
    ],
    indexes: [
      {
        key: "idx_guild_user",
        type: "unique",
        attributes: ["guild_id", "user_id"],
      },
      {
        key: "idx_guild_chars",
        type: "key",
        attributes: ["guild_id", "char_count"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: "automod_rules",
    name: "AutoMod Rules",
    attributes: [
      { key: "guild_id", type: "string", size: 64, required: true },
      { key: "name", type: "string", size: 256, required: true },
      { key: "enabled", type: "boolean", required: false, default: true },
      { key: "priority", type: "integer", required: false },
      { key: "trigger", type: "string", size: 64, required: true },
      // JSON-serialised condition tree and actions array
      { key: "conditions", type: "string", size: 16384, required: true },
      { key: "actions", type: "string", size: 8192, required: true },
      // Optional filters
      { key: "exempt_roles", type: "string", size: 2048, required: false },
      { key: "exempt_channels", type: "string", size: 2048, required: false },
      { key: "cooldown", type: "integer", required: false },
      // Metadata
      { key: "created_by", type: "string", size: 64, required: false },
      { key: "updated_at", type: "string", size: 64, required: false },
    ],
    indexes: [
      { key: "idx_guild_id", type: "key", attributes: ["guild_id"] },
      {
        key: "idx_guild_enabled",
        type: "key",
        attributes: ["guild_id", "enabled"],
      },
      {
        key: "idx_guild_trigger",
        type: "key",
        attributes: ["guild_id", "trigger"],
      },
    ],
  },
  {
    id: "ai_usage_log",
    name: "AI Usage Log",
    attributes: [
      { key: "guildId", type: "string", size: 64, required: true },
      { key: "userId", type: "string", size: 64, required: true },
      { key: "provider", type: "string", size: 64, required: true },
      { key: "model", type: "string", size: 128, required: true },
      { key: "input_tokens", type: "integer", required: false },
      { key: "output_tokens", type: "integer", required: false },
      { key: "total_tokens", type: "integer", required: false },
      { key: "estimated_cost", type: "float", required: false },
      {
        key: "action",
        type: "string",
        size: 32,
        required: false,
        default: "chat",
      },
      { key: "key_source", type: "string", size: 16, required: false },
      { key: "timestamp", type: "string", size: 64, required: true },
    ],
    indexes: [
      { key: "idx_guildId", type: "key", attributes: ["guildId"] },
      { key: "idx_userId", type: "key", attributes: ["userId"] },
      {
        key: "idx_timestamp",
        type: "key",
        attributes: ["timestamp"],
        orders: ["DESC"],
      },
      {
        key: "idx_guild_timestamp",
        type: "key",
        attributes: ["guildId", "timestamp"],
        orders: ["ASC", "DESC"],
      },
    ],
  },
  {
    id: "tags",
    name: "Tags",
    attributes: [
      { key: "guild_id", type: "string", size: 64, required: true },
      { key: "name", type: "string", size: 128, required: true },
      { key: "content", type: "string", size: 4096, required: false },
      { key: "embed_data", type: "string", size: 16384, required: false },
      { key: "allowed_roles", type: "string", size: 2048, required: false },
      { key: "created_by", type: "string", size: 64, required: false },
      { key: "updated_at", type: "string", size: 64, required: false },
    ],
    indexes: [
      { key: "idx_guild_id", type: "key", attributes: ["guild_id"] },
      {
        key: "idx_guild_name",
        type: "unique",
        attributes: ["guild_id", "name"],
      },
    ],
  },
];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);
const storage = new Storage(client);

async function exists(fn: () => Promise<any>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e: any) {
    if (e.code === 404 || e?.response?.statusCode === 404) return false;
    // If Appwrite returned an HTML error page, the SDK might throw
    // without a .code — treat that as "not found" for idempotent setup
    if (!e.code && !e.response) {
      console.warn(
        `  ⚠  Could not determine existence (treating as not found):`,
        e?.message || e,
      );
      return false;
    }
    throw e;
  }
}

/** Wait for attribute to move from "processing" to "available" */
async function waitForAttribute(
  collectionId: string,
  key: string,
  maxWait = 30_000,
) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const attr = await databases.getAttribute(DATABASE_ID, collectionId, key);
    if ((attr as any).status === "available") return;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn(`  ⚠ Attribute "${key}" still processing after ${maxWait}ms`);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  console.log("🚀 Appwrite Schema Setup\n");

  // 1. Ensure database exists
  const dbExists = await exists(() => databases.get(DATABASE_ID));
  if (!dbExists) {
    await databases.create(DATABASE_ID, DATABASE_NAME);
    console.log(`✅ Created database: ${DATABASE_NAME}`);
  } else {
    console.log(`✔  Database "${DATABASE_NAME}" already exists`);
  }

  // 2. Process each collection
  for (const col of collections) {
    console.log(`\n── Collection: ${col.name} (${col.id}) ──`);

    const colExists = await exists(() =>
      databases.getCollection(DATABASE_ID, col.id),
    );

    if (!colExists) {
      await databases.createCollection(
        DATABASE_ID,
        col.id,
        col.name,
        undefined, // permissions — defaults are fine for server-side API key access
      );
      console.log(`  ✅ Created collection`);
    } else {
      console.log(`  ✔  Collection already exists`);
    }

    // 3. Create attributes
    for (const attr of col.attributes) {
      const attrExists = await exists(() =>
        databases.getAttribute(DATABASE_ID, col.id, attr.key),
      );

      if (attrExists) {
        console.log(`  ✔  Attribute "${attr.key}" exists`);
        continue;
      }

      switch (attr.type) {
        case "string":
          await databases.createStringAttribute(
            DATABASE_ID,
            col.id,
            attr.key,
            attr.size || 256,
            attr.required,
            attr.default ?? undefined,
            attr.array ?? false,
          );
          break;
        case "integer":
          await databases.createIntegerAttribute(
            DATABASE_ID,
            col.id,
            attr.key,
            attr.required,
            undefined, // min
            undefined, // max
            attr.default ?? undefined,
            attr.array ?? false,
          );
          break;
        case "boolean":
          await databases.createBooleanAttribute(
            DATABASE_ID,
            col.id,
            attr.key,
            attr.required,
            attr.default ?? undefined,
            attr.array ?? false,
          );
          break;
        case "float":
          await databases.createFloatAttribute(
            DATABASE_ID,
            col.id,
            attr.key,
            attr.required,
            undefined,
            undefined,
            attr.default ?? undefined,
            attr.array ?? false,
          );
          break;
        case "enum":
          await databases.createEnumAttribute(
            DATABASE_ID,
            col.id,
            attr.key,
            attr.enumValues || [],
            attr.required,
            attr.default ?? undefined,
            attr.array ?? false,
          );
          break;
      }

      console.log(`  ✅ Created attribute "${attr.key}" (${attr.type})`);

      // Wait for it to be ready before creating the next
      await waitForAttribute(col.id, attr.key);
    }

    // 4. Create indexes
    for (const idx of col.indexes) {
      const idxExists = await exists(() =>
        databases.getIndex(DATABASE_ID, col.id, idx.key),
      );

      if (idxExists) {
        console.log(`  ✔  Index "${idx.key}" exists`);
        continue;
      }

      const indexType =
        idx.type === "unique"
          ? IndexType.Unique
          : idx.type === "fulltext"
            ? IndexType.Fulltext
            : IndexType.Key;

      await databases.createIndex(
        DATABASE_ID,
        col.id,
        idx.key,
        indexType,
        idx.attributes,
        idx.orders,
      );
      console.log(
        `  ✅ Created index "${idx.key}" (${idx.type}) on [${idx.attributes.join(", ")}]`,
      );
    }
  }

  // ── Bucket provisioning ──
  console.log(`\n── Storage Bucket: recordings ──`);
  const bucketExists = await exists(() =>
    storage.getBucket(RECORDINGS_BUCKET_ID),
  );
  if (!bucketExists) {
    try {
      await storage.createBucket(
        RECORDINGS_BUCKET_ID,
        "Recordings",
        undefined, // permissions
        false, // fileSecurity
        true, // enabled
        536870912, // maxFileSize = 512 MB (requires _APP_STORAGE_LIMIT ≥ this in Appwrite config)
      );
      console.log(`  ✅ Created bucket "recordings"`);
    } catch (bucketErr: any) {
      console.error(
        `  ❌ Failed to create bucket:`,
        bucketErr?.message || bucketErr,
      );
      console.error(
        `     (You may need to create it manually in the Appwrite Console)`,
      );
    }
  } else {
    console.log(`  ✔  Bucket "recordings" already exists`);
  }

  console.log("\n🎉 Schema setup complete!\n");
}

main().catch((err) => {
  console.error("❌ Setup failed:", err);
  process.exit(1);
});
