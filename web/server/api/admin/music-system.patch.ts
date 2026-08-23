/**
 * PATCH /api/admin/music-system
 *
 * Admin-only. Manually toggles the fleet-wide music playback switch — the
 * only way to re-enable it after the Lavalink health check auto-disables
 * it. Body: { enabled: boolean }
 */
import { getRepos } from "../../utils/db";
import { requireBotAdmin } from "../../utils/session";
import { CHANNEL_MUSIC_HEALTH, publish } from "../../utils/eventbus";

export default defineEventHandler(async (event) => {
  await requireBotAdmin(event);

  const body = await readBody(event);
  if (typeof body?.enabled !== "boolean") {
    throw createError({
      statusCode: 400,
      statusMessage: "Body must include { enabled: boolean }.",
    });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    await repos.systemFlags.setFlag("music", body.enabled, "manual");
    // Notify the running bot fleet so every shard's cached flag refreshes
    // immediately instead of waiting out the 60s TTL. No-op when Redis is
    // unconfigured.
    await publish(CHANNEL_MUSIC_HEALTH, { kind: "changed" });
    return { success: true };
  } catch (error: any) {
    console.error(
      "[Music System API] setFlag(music) failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update the music system switch.",
    });
  }
});
