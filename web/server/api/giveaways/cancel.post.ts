/**
 * Cancel a giveaway from the dashboard. Sets status = 'cancelled' and edits
 * the live message to reflect it (Enter button disabled) rather than
 * deleting — the message stays as a visible record for entrants, and the
 * draw worker's `status = 'active'` sweep query naturally skips it.
 *
 * Body: { guild_id, id }
 */
import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";
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

  await requireModuleAccess(event, guildId, "giveaways");

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable (NUXT_DATABASE_URL not set)." });
  }

  const giveaway = await repos.giveaways.getById(id);
  if (!giveaway || giveaway.guildId !== guildId) {
    throw createError({ statusCode: 404, statusMessage: "Giveaway not found for this server." });
  }
  if (giveaway.status !== "active") {
    throw createError({ statusCode: 400, statusMessage: "Only an active giveaway can be cancelled." });
  }

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({ statusCode: 500, statusMessage: "Bot token not configured on server." });
  }

  const entrantCount = await repos.giveawayEntries.countEntries(id);
  const embed = buildGiveawayEmbedJson({
    id,
    title: giveaway.title,
    description: giveaway.description,
    prizeKind: giveaway.prizeKind as PrizeKind,
    prizeValue: giveaway.prizeValue,
    imageUrl: giveaway.imageUrl,
    winnerCount: giveaway.winnerCount,
    entrantCount,
    endsAt: giveaway.endsAt,
    status: "cancelled",
    requirements: giveaway.requirements,
  });
  const components = buildGiveawayComponentsJson(id, "cancelled");

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
    console.error("[Giveaway Cancel API] Discord rejected the edit:", JSON.stringify(discordError, null, 2));
    // The message edit failing (e.g. it was deleted) shouldn't block
    // cancelling the row — the giveaway must stop accepting entries either way.
  }

  await repos.giveaways.setCancelled(id);

  return { success: true };
});
