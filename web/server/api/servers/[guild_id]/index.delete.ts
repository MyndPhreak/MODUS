/**
 * DELETE /api/servers/:guild_id
 *
 * Un-registers a server. Wipes the servers row and every guild_configs
 * row for the guild. Caller must be the owner or a listed admin (or a
 * bot admin).
 *
 * Note: does NOT delete automod_rules, logs, recordings, etc. Those are
 * guild-partitioned but may be referenced outside the dashboard (e.g.
 * the bot keeps writing logs even for un-registered guilds until it
 * leaves). Run `pnpm --filter bot run sweep:orphans` for a full purge of
 * anything this misses.
 *
 * The identity avatar and welcome background R2 objects *are* cleaned up
 * here, best-effort, since they're only ever referenced from the
 * guild_configs rows this endpoint is about to delete — once that happens
 * they'd otherwise be unrecoverable orphans with nothing left pointing at
 * them until the next manual sweep.
 */
import { getRepos } from "../../../utils/db";
import { requireGuildManager } from "../../../utils/session";
import {
  deleteR2Object,
  extractIdentityAvatarKey,
  extractWelcomeBgKey,
} from "../../../utils/r2";

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id");
  if (!guildId) {
    throw createError({ statusCode: 400, statusMessage: "Missing guild_id" });
  }

  await requireGuildManager(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const [identitySettings, welcomeSettings] = await Promise.all([
      repos.guildConfigs.getModuleSettings(guildId, "identity"),
      repos.guildConfigs.getModuleSettings(guildId, "welcome"),
    ]);

    await repos.guildConfigs.deleteAllForGuild(guildId);
    await repos.servers.deleteByGuildId(guildId);

    const avatarKey = extractIdentityAvatarKey(
      identitySettings?.avatarImage,
      guildId,
    );
    const bgKey = extractWelcomeBgKey(welcomeSettings?.backgroundImage, guildId);
    for (const key of [avatarKey, bgKey]) {
      if (!key) continue;
      try {
        await deleteR2Object(key);
      } catch (error: any) {
        console.error(
          `[Servers API] Failed to delete R2 object ${key} for un-registered guild ${guildId}:`,
          error?.message || error,
        );
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error(
      `[Servers API] remove(${guildId}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to remove server.",
    });
  }
});
