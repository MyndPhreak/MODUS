/**
 * Create a giveaway from the dashboard — posts the embed + Enter button
 * directly to Discord via REST (bot token stays server-side, same approach
 * as ../polls/send.post.ts), then persists the row with source: "dashboard".
 *
 * Body: { guild_id, channel_id, title, duration_minutes, winner_count,
 *         prize_kind, prize_value, description?, image_url?,
 *         required_role_ids?, blocked_role_ids?, min_account_age_days?,
 *         min_server_age_days? }
 */
import { getRepos } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";
import { buildGiveawayComponentsJson, buildGiveawayEmbedJson } from "./_embed";
import type { PrizeKind } from "./_embed";

const VALID_PRIZE_KINDS: PrizeKind[] = ["key", "gift", "physical", "other"];
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 30 * 24 * 60;

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const guildId = body?.guild_id;
  const channelId = String(body?.channel_id || "").trim();
  const title = String(body?.title || "").trim();
  const prizeKind = body?.prize_kind as PrizeKind;
  const prizeValue = String(body?.prize_value || "").trim();
  const durationMinutes = Number(body?.duration_minutes);
  const winnerCount = Number(body?.winner_count ?? 1);

  if (!guildId || !channelId || !title || !prizeValue) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: guild_id, channel_id, title, prize_value.",
    });
  }
  if (!VALID_PRIZE_KINDS.includes(prizeKind)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid prize_kind." });
  }
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes < MIN_DURATION_MINUTES ||
    durationMinutes > MAX_DURATION_MINUTES
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: `duration_minutes must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES}.`,
    });
  }
  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 50) {
    throw createError({ statusCode: 400, statusMessage: "winner_count must be an integer between 1 and 50." });
  }

  const identity = await requireGuildManager(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable (NUXT_DATABASE_URL not set)." });
  }

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({ statusCode: 500, statusMessage: "Bot token not configured on server." });
  }

  // Verify the channel belongs to the authorized guild — same check every
  // other write route in this codebase performs (requireGuildManager only
  // proves the caller manages guild_id, not that channel_id lives inside it).
  let channelGuildId: string | undefined;
  try {
    const channel = (await $fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    })) as { guild_id?: string };
    channelGuildId = channel.guild_id;
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Channel not found or the bot cannot access it." });
  }
  if (channelGuildId !== guildId) {
    throw createError({ statusCode: 403, statusMessage: "Channel does not belong to this server." });
  }

  const id = crypto.randomUUID();
  const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const requirements = {
    requiredRoleIds: Array.isArray(body.required_role_ids) ? body.required_role_ids : [],
    blockedRoleIds: Array.isArray(body.blocked_role_ids) ? body.blocked_role_ids : [],
    minAccountAgeDays: body.min_account_age_days ? Number(body.min_account_age_days) : undefined,
    minServerAgeDays: body.min_server_age_days ? Number(body.min_server_age_days) : undefined,
  };

  const embed = buildGiveawayEmbedJson({
    id,
    title,
    description: body.description || undefined,
    prizeKind,
    prizeValue,
    imageUrl: body.image_url || undefined,
    winnerCount,
    entrantCount: 0,
    endsAt,
    status: "active",
    requirements,
  });
  const components = buildGiveawayComponentsJson(id, "active");

  let messageId: string;
  try {
    const result = (await $fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: { embeds: [embed], components },
    })) as { id: string };
    messageId = result.id;
  } catch (error: any) {
    const discordError = error?.data || error?.response?._data;
    console.error("[Giveaway Create API] Discord rejected the post:", JSON.stringify(discordError, null, 2));
    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage: discordError?.message || "Failed to post the giveaway to Discord.",
    });
  }

  await repos.giveaways.create({
    id,
    guildId,
    channelId,
    messageId,
    hostId: identity.userId,
    title,
    description: body.description || undefined,
    prizeKind,
    prizeValue,
    imageUrl: body.image_url || undefined,
    winnerCount,
    requirements,
    endsAt,
    source: "dashboard",
  });

  return { success: true, id, messageId };
});
