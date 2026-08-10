/**
 * List a guild's Discord scheduled events, with subscriber counts, for the
 * dashboard calendar. Always live from Discord — no local caching.
 *
 * Query params: guild_id
 */
import { requireGuildManager } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);
  const guildId = query.guild_id as string;

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id parameter.",
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
    const events: any[] = await $fetch(
      `https://discord.com/api/v10/guilds/${guildId}/scheduled-events`,
      {
        query: { with_user_count: true },
        headers: { Authorization: `Bot ${botToken}` },
      },
    );

    return {
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description ?? null,
        scheduledStartTime: e.scheduled_start_time,
        scheduledEndTime: e.scheduled_end_time ?? null,
        status: e.status,
        entityType: e.entity_type,
        location: e.entity_metadata?.location ?? null,
        userCount: e.user_count ?? 0,
      })),
    };
  } catch (error: any) {
    console.error(
      `[Scheduled Events API] Error fetching events for guild ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage:
        error?.message ||
        "Failed to fetch scheduled events. Is the bot in this server?",
    });
  }
});
