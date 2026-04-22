/** List recordings for a guild. */
import { getRecordingRepo } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const guildId = query.guild_id as string;
  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id query parameter.",
    });
  }

  const repo = getRecordingRepo();
  if (!repo) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    return await repo.listByGuild(guildId, 100);
  } catch (error: any) {
    console.error(
      `[Recordings API] Postgres list failed for ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch recordings.",
    });
  }
});
