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
import { Client, Databases, IndexType } from "node-appwrite";

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

const DATABASE_ID = "discord_bot";
const DATABASE_NAME = "Discord Bot";

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
    ],
    indexes: [
      { key: "idx_guild_id", type: "unique", attributes: ["guild_id"] },
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
];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

async function exists(fn: () => Promise<any>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e: any) {
    if (e.code === 404) return false;
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

  console.log("\n🎉 Schema setup complete!\n");
}

main().catch((err) => {
  console.error("❌ Setup failed:", err);
  process.exit(1);
});
