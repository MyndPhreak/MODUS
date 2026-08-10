/**
 * Delete a Discord scheduled event. No announcement is posted (see spec).
 * Query params: guild_id
 */
import { requireGuildManager } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const eventId = getRouterParam(event, "event_id");
  const query = getQuery(event);
  const guildId = query.guild_id as string;

  if (!eventId || !guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing event_id or guild_id.",
    });
  }

  await requireGuildManager(event, guildId);

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  try {
    await $fetch(
      `https://discord.com/api/v10/guilds/${guildId}/scheduled-events/${eventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bot ${botToken}` },
      },
    );
    return { success: true };
  } catch (error: any) {
    const discordError = error?.data || error?.response?._data;
    console.error(
      `[Scheduled Events API] Discord rejected event deletion for ${eventId}:`,
      JSON.stringify(discordError, null, 2),
    );
    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage: discordError?.message || "Failed to delete scheduled event.",
    });
  }
});
