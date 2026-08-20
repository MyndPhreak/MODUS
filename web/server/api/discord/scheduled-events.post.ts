/**
 * Create a Discord scheduled event and, if an announcement channel is
 * configured for the events module, post a channel announcement and record
 * which message to keep in sync going forward (see event_announcements).
 *
 * The embed-building logic here is intentionally NOT shared with the bot's
 * equivalent path (bot/modules/events.ts's postEventAnnouncement) — the bot
 * builds it with discord.js's EmbedBuilder against a live Guild object, this
 * route builds a raw REST payload with no bot-process involvement. Nitro
 * server routes don't share a util module with the bot process, and this is
 * a small enough payload that duplicating it (same precedent as
 * send-embed.post.ts's local colorHexToInt/flattenDiscordErrors) is simpler
 * than introducing shared infrastructure for it.
 *
 * Body: { guild_id, name, description?, scheduled_start_time,
 *         scheduled_end_time, location }
 * scheduled_start_time/scheduled_end_time are ISO8601 strings.
 */
import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const {
    guild_id: guildId,
    name,
    description,
    scheduled_start_time: scheduledStartTime,
    scheduled_end_time: scheduledEndTime,
    location,
  } = body || {};

  if (!guildId || !name || !scheduledStartTime || !scheduledEndTime || !location) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Missing required fields: guild_id, name, scheduled_start_time, scheduled_end_time, location.",
    });
  }

  await requireModuleAccess(event, guildId, "events");

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  let created: any;
  try {
    created = await $fetch(
      `https://discord.com/api/v10/guilds/${guildId}/scheduled-events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: {
          name,
          description: description || undefined,
          scheduled_start_time: scheduledStartTime,
          scheduled_end_time: scheduledEndTime,
          privacy_level: 2, // GUILD_ONLY
          entity_type: 3, // EXTERNAL
          entity_metadata: { location },
        },
      },
    );
  } catch (error: any) {
    const discordError = error?.data || error?.response?._data;
    console.error(
      `[Scheduled Events API] Discord rejected event creation for guild ${guildId}:`,
      JSON.stringify(discordError, null, 2),
    );
    let message = discordError?.message || "Failed to create scheduled event.";
    if (discordError?.errors) {
      const fieldErrors = flattenDiscordErrors(discordError.errors);
      if (fieldErrors.length > 0) message += ": " + fieldErrors.join(", ");
    }
    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage: message,
    });
  }

  // Best-effort announcement — event creation already succeeded above, so a
  // failure here is logged, not surfaced as a create failure (per spec).
  let announcementPosted = false;
  try {
    const repos = getRepos();
    if (repos) {
      const settings = await repos.guildConfigs.getModuleSettings(guildId, "events");
      const announcementChannelId = settings?.announcementChannelId as string | undefined;
      if (announcementChannelId) {
        // Confirm the configured channel actually belongs to this guild.
        // `announcementChannelId` comes from unvalidated module settings, so
        // without this check a manager of guildId could point it at a
        // channel in a different guild the bot is in and have this route
        // post an attacker-controlled embed there. Same defense as
        // send-embed.post.ts's channel-ownership check.
        let channelGuildId: string | undefined;
        try {
          const channel = (await $fetch(
            `https://discord.com/api/v10/channels/${announcementChannelId}`,
            { headers: { Authorization: `Bot ${botToken}` } },
          )) as { guild_id?: string };
          channelGuildId = channel.guild_id;
        } catch (error: any) {
          console.error(
            `[Scheduled Events API] Event ${created.id} created but announcement channel ${announcementChannelId} could not be verified:`,
            error?.message || error,
          );
        }

        if (channelGuildId !== guildId) {
          console.error(
            `[Scheduled Events API] Event ${created.id} created but announcement skipped: configured channel ${announcementChannelId} does not belong to guild ${guildId}.`,
          );
        } else {
          const roleMentions = ((settings?.notifyRoleIds as string[]) || [])
            .map((id) => `<@&${id}>`)
            .join(" ");
          const startUnix = Math.floor(new Date(scheduledStartTime).getTime() / 1000);

          const message: any = await $fetch(
            `https://discord.com/api/v10/channels/${announcementChannelId}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bot ${botToken}`,
                "Content-Type": "application/json",
              },
              body: {
                content: roleMentions || undefined,
                embeds: [
                  {
                    title: `📅 ${name}`,
                    description: description || undefined,
                    color: 0x14b8a6,
                    fields: [
                      {
                        name: "Starts",
                        value: `<t:${startUnix}:F> (<t:${startUnix}:R>)`,
                        inline: false,
                      },
                      { name: "Location", value: location, inline: false },
                      { name: "Interested", value: "0", inline: true },
                    ],
                  },
                ],
              },
            },
          );
          await repos.eventAnnouncements.create({
            guildId,
            eventId: created.id,
            channelId: announcementChannelId,
            messageId: message.id,
          });
          announcementPosted = true;
        }
      }
    }
  } catch (error: any) {
    console.error(
      `[Scheduled Events API] Event ${created.id} created but announcement failed:`,
      error?.message || error,
    );
  }

  return { event: created, announcementPosted };
});

/**
 * Recursively flatten Discord's nested error structure into readable
 * messages. Duplicated from send-embed.post.ts (same precedent as that
 * file's colorHexToInt) rather than shared.
 */
function flattenDiscordErrors(obj: any, path: string[] = []): string[] {
  const messages: string[] = [];
  if (!obj || typeof obj !== "object") return messages;

  if (Array.isArray(obj._errors)) {
    for (const err of obj._errors) {
      if (err?.message) {
        const fieldName = path.filter((p) => isNaN(Number(p))).join(".");
        messages.push(fieldName ? `${fieldName}: ${err.message}` : err.message);
      }
    }
  }

  for (const key of Object.keys(obj)) {
    if (key !== "_errors") {
      messages.push(...flattenDiscordErrors(obj[key], [...path, key]));
    }
  }

  return messages;
}
