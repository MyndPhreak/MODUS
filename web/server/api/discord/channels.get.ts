/**
 * Server-side endpoint to fetch text channels for a given guild.
 * Uses the bot token to access guild channels directly.
 *
 * Query params:
 *   - guild_id: The Discord guild ID
 */
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

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  try {
    const channels: any[] = await $fetch(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      },
    );

    // Filter to text-based channels only and sort by position
    const textChannels = channels
      .filter((c) => [0, 5].includes(c.type)) // 0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
        parentId: c.parent_id || null,
      }));

    // Also get category channels for grouping
    const categories = channels
      .filter((c) => c.type === 4) // 4 = GUILD_CATEGORY
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        name: c.name,
        position: c.position,
      }));

    return {
      channels: textChannels,
      categories,
    };
  } catch (error: any) {
    console.error(
      `[Channels API] Error fetching channels for guild ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage:
        error?.message ||
        "Failed to fetch channels. Is the bot in this server?",
    });
  }
});
