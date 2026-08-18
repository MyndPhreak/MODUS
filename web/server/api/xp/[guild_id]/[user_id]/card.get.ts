/**
 * GET /api/xp/[guild_id]/[user_id]/card
 *
 * Renders the member's visual rank card as a PNG image.
 */
import { getRepos } from "../../../../utils/db";
import { ensureTemplateFonts } from "../../../../utils/font-manager";
import {
  DEFAULT_RANK_CARD_TEMPLATE,
  type RankCardTemplate,
} from "@modus/db/rank-cards";
import { renderRankCardImage, type RankCardRenderRequest } from "../../render.post";

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id");
  const userId = getRouterParam(event, "user_id");

  if (!guildId || !userId) {
    throw createError({ statusCode: 400, statusMessage: "Missing guild_id or user_id" });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  }

  try {
    const [server, xpSettings, user, stats] = await Promise.all([
      repos.servers.getByGuildId(guildId),
      repos.guildConfigs.getModuleSettings(guildId, "xp"),
      repos.xp.getByGuildAndUser(guildId, userId),
      repos.xp.getGuildStats(guildId),
    ]);

    if (!user) {
      throw createError({ statusCode: 404, statusMessage: "User not found" });
    }

    const rank = await repos.xp.getRank(guildId, user.xp);

    // Resolve avatar if missing
    let avatarUrl = user.avatar;
    if (!avatarUrl) {
      const config = useRuntimeConfig();
      const botToken = (config.discordBotToken || process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN) as string;
      if (botToken) {
        try {
          const u: any = await $fetch(`https://discord.com/api/v10/users/${userId}`, {
            headers: { Authorization: `Bot ${botToken}` },
          });
          if (u?.avatar) {
            const ext = u.avatar.startsWith("a_") ? "gif" : "webp";
            avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${u.avatar}.${ext}?size=256`;
          }
        } catch {}
      }
    }
    if (!avatarUrl) {
      const num = Number((BigInt(userId) >> 22n) % 6n);
      avatarUrl = `https://cdn.discordapp.com/embed/avatars/${num}.png`;
    }

    let template: RankCardTemplate = DEFAULT_RANK_CARD_TEMPLATE;
    if (xpSettings?.cardTemplate?.elements && xpSettings.cardTemplate.elements.length > 0) {
      template = xpSettings.cardTemplate;
    }

    try {
      await ensureTemplateFonts(template.elements as any);
    } catch {}

    const renderPayload: RankCardRenderRequest = {
      guildId,
      avatarUrl,
      username: user.username,
      displayName: user.username,
      tag: user.username,
      serverName: server?.name || "Discord Server",
      level: user.level,
      xp: user.xp,
      rank,
      totalMembers: server?.memberCount || stats.totalUsers || 1,
      messageCount: user.message_count,
    };

    const imageBuffer = await renderRankCardImage(template, renderPayload);

    setResponseHeader(event, "Content-Type", "image/png");
    setResponseHeader(event, "Content-Length", imageBuffer.length);
    setResponseHeader(event, "Cache-Control", "public, max-age=60, s-maxage=120");

    return imageBuffer;
  } catch (err: any) {
    if (err?.statusCode) throw err;
    console.error(`[XP Card Render] Failed to render card for ${userId} in ${guildId}:`, err);
    throw createError({ statusCode: 500, statusMessage: "Failed to render rank card" });
  }
});
