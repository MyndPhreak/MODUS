/**
 * GET /api/admin/logs
 *
 * Returns the most recent 200 log entries across all guilds. Used by the
 * admin logs page for the initial page-load snapshot before the SSE
 * stream takes over.
 *
 * Postgres path runs an indexed `ORDER BY timestamp DESC LIMIT 200`.
 * Appwrite fallback mirrors the shape used by the previous client-side
 * Appwrite query.
 *
 * Auth: requires an authenticated session. The endpoint doesn't enforce
 * admin-specifically — the page is gated client-side. Tighten here if the
 * policy changes.
 */
import { Client, Databases, Query } from "node-appwrite";
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

const LIMIT = 200;

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  const repos = getRepos();
  if (repos) {
    try {
      return await repos.logs.listAll(LIMIT);
    } catch (error: any) {
      console.error(
        "[Admin Logs API] Postgres listAll failed:",
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to fetch logs.",
      });
    }
  }

  const config = useRuntimeConfig();
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    const res = await databases.listDocuments("discord_bot", "logs", [
      Query.orderDesc("timestamp"),
      Query.limit(LIMIT),
    ]);
    return res.documents;
  } catch (error: any) {
    console.error(
      "[Admin Logs API] Appwrite list failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to fetch logs.",
    });
  }
});
