/**
 * Send a native Discord poll from the dashboard — either from a saved
 * template or an ad-hoc question/options pair. Uses the bot token directly,
 * same approach as ../discord/send-embed.post.ts.
 *
 * Body: { guild_id, channel_id, template_id?, question?, options?,
 *         duration_hours?, allow_multiselect? }
 * When template_id is given, question/options/duration_hours/allow_multiselect
 * fall back to the template's saved values but can still be overridden.
 */
import { getRepos } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const guildId = body?.guild_id;
  let channelId = body?.channel_id;
  if (typeof channelId === "object" && channelId !== null) {
    channelId = channelId.value || channelId.id;
  }
  channelId = String(channelId || "").trim();

  if (!guildId || !channelId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: guild_id, channel_id.",
    });
  }

  const identity = await requireGuildManager(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  // Resolve question/options/duration/multiselect: explicit body fields win,
  // otherwise fall back to the referenced template.
  let question = body.question as string | undefined;
  let options = body.options as string[] | undefined;
  let durationHours = body.duration_hours as number | undefined;
  let allowMultiselect = body.allow_multiselect as boolean | undefined;
  let templateId: string | null = null;

  if (body.template_id) {
    const template = await repos.pollTemplates.getById(body.template_id);
    if (!template || template.guildId !== guildId) {
      throw createError({
        statusCode: 404,
        statusMessage: "Template not found for this guild.",
      });
    }
    templateId = template.id;
    question = question ?? template.question;
    options = options ?? template.options;
    durationHours = durationHours ?? template.durationHours;
    allowMultiselect = allowMultiselect ?? template.allowMultiselect;
  }

  if (!question || !options) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Missing question/options — provide them directly or via template_id.",
    });
  }
  if (options.length < 2 || options.length > 10) {
    throw createError({
      statusCode: 400,
      statusMessage: "options must have between 2 and 10 entries.",
    });
  }
  // Discord caps poll question text at 300 chars and each answer's text at
  // 55 chars — validate locally so a too-long field gets a clean, specific
  // 400 instead of round-tripping to Discord for a generic rejection.
  if (question.length > 300) {
    throw createError({
      statusCode: 400,
      statusMessage: "question must be 300 characters or fewer.",
    });
  }
  const overLongOption = options.find((text) => text.length > 55);
  if (overLongOption) {
    throw createError({
      statusCode: 400,
      statusMessage: `Option "${overLongOption.slice(0, 55)}..." exceeds the 55 character limit.`,
    });
  }
  durationHours = durationHours ?? 24;
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 168) {
    throw createError({
      statusCode: 400,
      statusMessage: "duration_hours must be an integer between 1 and 168.",
    });
  }

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  // Verify the channel belongs to the authorized guild (same check as
  // send-embed.post.ts — requireGuildManager only proves the caller manages
  // guild_id, not that channel_id lives inside it).
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

  let result: any;
  try {
    result = await $fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: {
          poll: {
            question: { text: question },
            answers: options.map((text) => ({ poll_media: { text } })),
            duration: durationHours,
            allow_multiselect: !!allowMultiselect,
            layout_type: 1, // PollLayoutType.Default
          },
        },
      },
    );
  } catch (error: any) {
    const discordError = error?.data || error?.response?._data;
    console.error(
      `[Poll Send API] Discord rejected poll for channel ${channelId}:`,
      JSON.stringify(discordError, null, 2),
    );

    let message = "Failed to send poll to Discord.";
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

  const expiresAt = result?.poll?.expiry
    ? new Date(result.poll.expiry)
    : new Date(Date.now() + durationHours * 60 * 60 * 1000);

  try {
    await repos.polls.create({
      guildId,
      channelId,
      messageId: result.id,
      templateId,
      question,
      options,
      expiresAt,
      createdBy: identity.userId,
      source: "dashboard",
    });
  } catch (error: any) {
    // The poll already sent successfully — a persistence failure here
    // shouldn't be surfaced as a send failure, just logged.
    console.error(
      "[Poll Send API] Poll sent but failed to persist row:",
      error?.message || error,
    );
  }

  return { success: true, messageId: result.id };
});

/**
 * Recursively flatten Discord's nested error structure into readable
 * messages. Duplicated locally from ../discord/send-embed.post.ts — this
 * codebase's convention is one-file-per-route with local helpers rather
 * than a shared utils extraction.
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
