/**
 * Server-side endpoint to fetch roles for a given guild.
 * Uses the bot token to access guild roles directly.
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
    const roles: any[] = await $fetch(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      },
    );

    // Sort by position (highest first), exclude @everyone (position 0),
    // and exclude managed roles (bot roles, integration roles, etc.)
    const filteredRoles = roles
      .filter((r) => r.id !== guildId) // @everyone role has the same ID as the guild
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        managed: r.managed,
        permissions: r.permissions,
      }));

    return {
      roles: filteredRoles,
    };
  } catch (error: any) {
    console.error(
      `[Roles API] Error fetching roles for guild ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage:
        error?.message || "Failed to fetch roles. Is the bot in this server?",
    });
  }
});
