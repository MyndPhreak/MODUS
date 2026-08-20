/**
 * End (expire) a running poll early from the dashboard — mirrors the bot's
 * `/poll end` command via Discord's expire-poll endpoint. Manager-only.
 *
 * Body: { guild_id, channel_id, message_id }
 */
import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const guildId = body?.guild_id;
  const channelId = String(body?.channel_id || "").trim();
  const messageId = String(body?.message_id || "").trim();

  if (!guildId || !channelId || !messageId) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Missing required fields: guild_id, channel_id, message_id.",
    });
  }

  await requireModuleAccess(event, guildId, "polls");

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  // Verify the channel belongs to the authorized guild — same check every
  // other poll-writing route in this feature performs (requireModuleAccess
  // only proves the caller manages guild_id, not that channel_id lives
  // inside it).
  let channelGuildId: string | undefined;
  try {
    const channel = (await $fetch(
      `https://discord.com/api/v10/channels/${channelId}`,
      { headers: { Authorization: `Bot ${botToken}` } },
    )) as { guild_id?: string };
    channelGuildId = channel.guild_id;
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Channel not found or the bot cannot access it.",
    });
  }
  if (channelGuildId !== guildId) {
    throw createError({
      statusCode: 403,
      statusMessage: "Channel does not belong to this server.",
    });
  }

  try {
    await $fetch(
      `https://discord.com/api/v10/channels/${channelId}/polls/${messageId}/expire`,
      {
        method: "POST",
        headers: { Authorization: `Bot ${botToken}` },
      },
    );
  } catch (error: any) {
    const discordError = error?.data || error?.response?._data;
    console.error(
      `[Poll End API] Discord rejected expire for message ${messageId}:`,
      JSON.stringify(discordError, null, 2),
    );

    let message = "Failed to end poll.";
    if (discordError?.message) {
      message = discordError.message;
      if (discordError.errors) {
        try {
          const fieldErrors = flattenDiscordErrors(discordError.errors);
          if (fieldErrors.length > 0) {
            message += ": " + fieldErrors.join(", ");
          }
        } catch {
          // Ignore error flattening failures
        }
      }
    }

    throw createError({
      statusCode: error?.status || error?.statusCode || 500,
      statusMessage: message,
    });
  }

  // Best-effort DB finalize — same pattern as the bot's own /poll end
  // handler (bot/modules/polls.ts). The poll already ended successfully on
  // Discord; a persistence hiccup here shouldn't be surfaced as a failure.
  const repos = getRepos();
  if (repos) {
    try {
      await repos.polls.finalizeByMessageId(messageId);
    } catch (error: any) {
      console.error(
        "[Poll End API] Poll ended but failed to finalize row:",
        error?.message || error,
      );
    }
  }

  return { success: true };
});

/**
 * Recursively flatten Discord's nested error structure into readable
 * messages. Duplicated locally from ../send.post.ts / ../discord/send-embed.post.ts
 * — this codebase's convention is one-file-per-route with local helpers
 * rather than a shared utils extraction.
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
