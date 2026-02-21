/**
 * One-time backfill: populate owner_id and admin_user_ids for existing
 * server documents that used the legacy "ownerId" field name.
 *
 * Usage: npx tsx backfill-admin-ids.ts
 */

import "dotenv/config";
import { Client, Databases, Query } from "node-appwrite";

const DATABASE_ID = "discord_bot";

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

async function main() {
  console.log(
    "🔄 Backfilling owner_id + admin_user_ids for existing server documents...\n",
  );

  const response = await databases.listDocuments(DATABASE_ID, "servers", [
    Query.limit(500),
  ]);

  let updated = 0;
  let skipped = 0;

  for (const doc of response.documents) {
    const raw = doc as any;
    // Legacy field is "ownerId" (camelCase), new field is "owner_id" (snake_case)
    const legacyOwnerId: string | null = raw.ownerId || null;
    const currentOwnerId: string | null = raw.owner_id || null;
    const existingAdmins: string[] = raw.admin_user_ids || [];

    const effectiveOwner = currentOwnerId || legacyOwnerId;

    if (!effectiveOwner) {
      console.log(
        `  ⚠  ${doc.$id} (${raw.name}) — no ownerId or owner_id found, skipping`,
      );
      skipped++;
      continue;
    }

    const needsOwnerIdFix = !currentOwnerId && legacyOwnerId;
    const needsAdminIds = !existingAdmins.includes(effectiveOwner);

    if (!needsOwnerIdFix && !needsAdminIds) {
      console.log(`  ✔  ${doc.$id} (${raw.name}) — already up to date`);
      skipped++;
      continue;
    }

    const update: Record<string, any> = {};
    if (needsOwnerIdFix) {
      update.owner_id = effectiveOwner;
    }
    if (needsAdminIds) {
      update.admin_user_ids = [
        effectiveOwner,
        ...existingAdmins.filter((id) => id !== effectiveOwner),
      ];
    }

    try {
      await databases.updateDocument(DATABASE_ID, "servers", doc.$id, update);
      console.log(
        `  ✅ ${doc.$id} (${raw.name}) — updated: ${JSON.stringify(update)}`,
      );
      updated++;
    } catch (err: any) {
      console.error(
        `  ❌ ${doc.$id} (${raw.name}) — failed:`,
        err.message || err,
      );
    }
  }

  console.log(
    `\n🎉 Done! Updated: ${updated}, Skipped: ${skipped}, Total: ${response.documents.length}`,
  );
}

main().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
