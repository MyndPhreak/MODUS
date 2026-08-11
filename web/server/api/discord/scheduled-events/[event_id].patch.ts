/**
 * Edit an existing Discord scheduled event. No announcement is (re-)posted —
 * announcements only fire on creation (see design spec).
 * Body: { guild_id, name?, description?, scheduled_start_time?,
 *         scheduled_end_time?, location? }
 */
import { requireGuildManager } from "../../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const eventId = getRouterParam(event, "event_id");
  const body = await readBody(event);
  const guildId = body?.guild_id;

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

  const patch: Record<string, any> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.scheduled_start_time !== undefined)
    patch.scheduled_start_time = body.scheduled_start_time;
  if (body.scheduled_end_time !== undefined)
    patch.scheduled_end_time = body.scheduled_end_time;
  if (body.location !== undefined) {
    patch.entity_type = 3;
    patch.entity_metadata = { location: body.location };
  }

  try {
    const updated = await $fetch(
      `https://discord.com/api/v10/guilds/${guildId}/scheduled-events/${eventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: patch,
      },
    );
    return { event: updated };
  } catch (error: any) {
    const discordError = error?.data || error?.response?._data;
    console.error(
      `[Scheduled Events API] Discord rejected event update for ${eventId}:`,
      JSON.stringify(discordError, null, 2),
    );
    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage: discordError?.message || "Failed to update scheduled event.",
    });
  }
});
