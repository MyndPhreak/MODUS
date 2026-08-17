/**
 * Edit an active giveaway from the dashboard. Channel is intentionally not
 * editable — moving channels means cancel + recreate, not an in-place edit
 * (see the design spec's Dashboard section).
 *
 * Body: { guild_id, id, title?, description?, prize_kind?, prize_value?,
 *         image_url?, winner_count?, duration_minutes?, required_role_ids?,
 *         blocked_role_ids?, min_account_age_days?, min_server_age_days? }
 * All fields besides guild_id/id are optional — omit what you don't want to
 * change. duration_minutes, if given, replaces endsAt as now() + minutes.
 */
import { getRepos } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";
import { buildGiveawayComponentsJson, buildGiveawayEmbedJson } from "./_embed";
import type { PrizeKind } from "./_embed";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const guildId = body?.guild_id;
  const id = String(body?.id || "").trim();
  if (!guildId || !id) {
    throw createError({ statusCode: 400, statusMessage: "Missing required fields: guild_id, id." });
  }

  await requireGuildManager(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable (NUXT_DATABASE_URL not set)." });
  }

  const giveaway = await repos.giveaways.getById(id);
  if (!giveaway || giveaway.guildId !== guildId) {
    throw createError({ statusCode: 404, statusMessage: "Giveaway not found for this server." });
  }
  if (giveaway.status !== "active") {
    throw createError({ statusCode: 400, statusMessage: "Only an active giveaway can be edited." });
  }

  const title = body.title !== undefined ? String(body.title).trim() : giveaway.title;
  const description = body.description !== undefined ? body.description : giveaway.description;
  const prizeKind = (body.prize_kind ?? giveaway.prizeKind) as PrizeKind;
  const prizeValue = body.prize_value !== undefined ? String(body.prize_value).trim() : giveaway.prizeValue;
  const imageUrl = body.image_url !== undefined ? body.image_url : giveaway.imageUrl;
  const winnerCount = body.winner_count !== undefined ? Number(body.winner_count) : giveaway.winnerCount;
  const endsAt =
    body.duration_minutes !== undefined
      ? new Date(Date.now() + Number(body.duration_minutes) * 60 * 1000)
      : giveaway.endsAt;
  const requirements = {
    requiredRoleIds: body.required_role_ids !== undefined ? body.required_role_ids : giveaway.requirements.requiredRoleIds,
    blockedRoleIds: body.blocked_role_ids !== undefined ? body.blocked_role_ids : giveaway.requirements.blockedRoleIds,
    minAccountAgeDays:
      body.min_account_age_days !== undefined
        ? Number(body.min_account_age_days) || undefined
        : giveaway.requirements.minAccountAgeDays,
    minServerAgeDays:
      body.min_server_age_days !== undefined
        ? Number(body.min_server_age_days) || undefined
        : giveaway.requirements.minServerAgeDays,
  };

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({ statusCode: 500, statusMessage: "Bot token not configured on server." });
  }

  const entrantCount = await repos.giveawayEntries.countEntries(id);
  const embed = buildGiveawayEmbedJson({
    id,
    title,
    description,
    prizeKind,
    prizeValue,
    imageUrl,
    winnerCount,
    entrantCount,
    endsAt,
    status: "active",
    requirements,
  });
  const components = buildGiveawayComponentsJson(id, "active");

  try {
    await $fetch(
      `https://discord.com/api/v10/channels/${giveaway.channelId}/messages/${giveaway.messageId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body: { embeds: [embed], components },
      },
    );
  } catch (error: any) {
    const discordError = error?.data || error?.response?._data;
    console.error("[Giveaway Update API] Discord rejected the edit:", JSON.stringify(discordError, null, 2));
    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage: discordError?.message || "Failed to update the giveaway message.",
    });
  }

  await repos.giveaways.update(id, {
    title,
    description,
    prizeKind,
    prizeValue,
    imageUrl,
    winnerCount,
    endsAt,
    requirements,
  });

  return { success: true };
});
