/**
 * PUT /api/guild-configs/:guild_id/:module
 *
 * Update a single module's settings and/or enabled flag on a guild.
 * Caller must be the server owner or a listed admin (or a bot admin).
 *
 * Body: { enabled?: boolean, settings?: object }
 *   - Either field is optional; omit what you don't want to change.
 *   - Unknown fields are ignored.
 */
import { validateWelcomeImageElements } from "@modus/db/welcome-images";
import { getRepos } from "../../../utils/db";
import { requireGuildManager } from "../../../utils/session";
import { deleteR2Object, extractWelcomeBgKey } from "../../../utils/r2";

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id");
  const moduleName = getRouterParam(event, "module");
  if (!guildId || !moduleName) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id or module route param.",
    });
  }

  // Identity settings must go through PUT /api/identity/:guild_id, which
  // applies the change to Discord before persisting. Writing module_name =
  // "identity" here would silently corrupt the diff baseline that endpoint
  // relies on, without ever touching Discord.
  if (moduleName.toLowerCase() === "identity") {
    throw createError({
      statusCode: 400,
      statusMessage: "Use PUT /api/identity/:guild_id to change bot identity settings.",
    });
  }

  await requireGuildManager(event, guildId);

  const body = await readBody<{
    enabled?: boolean;
    settings?: Record<string, any>;
  }>(event);

  const isWelcome = moduleName.toLowerCase() === "welcome";
  if (isWelcome && body?.settings?.elements !== undefined) {
    const validationError = validateWelcomeImageElements(
      body.settings.elements,
    );
    if (validationError) {
      throw createError({ statusCode: 400, statusMessage: validationError });
    }
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  let previousBackgroundImage: string | undefined;
  if (isWelcome && body?.settings !== undefined) {
    const current = await repos.guildConfigs.getModuleSettings(guildId, "welcome");
    previousBackgroundImage = current?.backgroundImage;
  }

  try {
    if (body?.settings !== undefined) {
      await repos.guildConfigs.setModuleSettings(
        guildId,
        moduleName,
        body.settings ?? {},
      );
    }
    if (typeof body?.enabled === "boolean") {
      await repos.guildConfigs.setModuleStatus(
        guildId,
        moduleName,
        body.enabled,
      );
    }

    // Best-effort housekeeping: settings replace the whole `welcome` blob,
    // so if backgroundImage changed (or was dropped), the previous R2
    // object is no longer referenced from anywhere. Delete it so re-uploads
    // don't accumulate orphaned images.
    if (isWelcome && previousBackgroundImage) {
      const newBackgroundImage = body?.settings?.backgroundImage;
      if (previousBackgroundImage !== newBackgroundImage) {
        const oldKey = extractWelcomeBgKey(previousBackgroundImage, guildId);
        if (oldKey) {
          try {
            await deleteR2Object(oldKey);
          } catch (error: any) {
            console.error(
              `[GuildConfigs API] Failed to delete old welcome background ${oldKey}:`,
              error?.message || error,
            );
          }
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error(
      `[GuildConfigs API] put(${guildId}/${moduleName}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update guild config.",
    });
  }
});
