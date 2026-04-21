/**
 * GET /api/servers/my-servers
 *
 * Returns only the servers that the current user owns or is listed as
 * an admin on. Server-side filtering uses the admin API key (Appwrite)
 * or the pg connection (Postgres) so collection-level permissions don't
 * interfere.
 */
import { Client, Databases, Query } from "node-appwrite";
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const projectId = config.public.appwriteProjectId as string;

  // Auth guard: native session first, legacy Appwrite cookie fallback.
  // Data filtering uses whatever userId the active flow provides — see the
  // note in .env.example about the key-space split between the two backends.
  const { userId } = await requireAuthedUserId(event);

  const repos = getRepos();
  if (repos) {
    try {
      return await repos.servers.listOwnedOrAdminBy(userId);
    } catch (error: any) {
      console.error(
        `[My Servers API] Postgres error for ${userId}:`,
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to fetch servers.",
      });
    }
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(projectId)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);
  const DATABASE_ID = "discord_bot";
  const COLLECTION_ID = "servers";

  try {
    const [ownerResult, adminResult] = await Promise.all([
      databases
        .listDocuments(DATABASE_ID, COLLECTION_ID, [
          Query.equal("owner_id", userId),
          Query.limit(200),
        ])
        .catch(() => ({ documents: [] })),
      databases
        .listDocuments(DATABASE_ID, COLLECTION_ID, [
          Query.contains("admin_user_ids", userId),
          Query.limit(200),
        ])
        .catch(() => ({ documents: [] })),
    ]);

    const seen = new Set<string>();
    const servers = [...ownerResult.documents, ...adminResult.documents].filter(
      (doc: any) => {
        if (seen.has(doc.$id)) return false;
        seen.add(doc.$id);
        return true;
      },
    );

    return servers;
  } catch (err: any) {
    console.error("[My Servers API] Error:", err.message || err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch servers.",
    });
  }
});
