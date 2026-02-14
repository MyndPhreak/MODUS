/**
 * Server-side endpoint to send an embed to a specific channel.
 * Uses the Discord bot token to send messages directly.
 *
 * POST body:
 *   - guild_id: string
 *   - channel_id: string
 *   - embed: {
 *       title?: string
 *       description?: string
 *       color?: number
 *       footer?: { text: string, icon_url?: string }
 *       image?: { url: string }
 *       thumbnail?: { url: string }
 *       author?: { name: string, url?: string, icon_url?: string }
 *       fields?: Array<{ name: string, value: string, inline?: boolean }>
 *       url?: string
 *       timestamp?: string | boolean
 *     }
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const { guild_id, embed } = body || {};
  // channel_id may arrive as an object { label, value } from USelectMenu binding
  let channel_id = body?.channel_id;
  if (typeof channel_id === "object" && channel_id !== null) {
    channel_id = channel_id.value || channel_id.id;
  }
  channel_id = String(channel_id || "").trim();

  if (!guild_id || !channel_id || !embed) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required fields: guild_id, channel_id, embed.",
    });
  }

  // Validate embed has at least title or description
  if (
    !embed.title &&
    !embed.description &&
    (!embed.fields || embed.fields.length === 0)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Embed must have at least a title, description, or fields.",
    });
  }

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  // Sanitize embed object — only include fields that have real values
  const sanitizedEmbed: Record<string, any> = {};

  if (embed.title && String(embed.title).trim()) {
    sanitizedEmbed.title = String(embed.title).trim().slice(0, 256);
  }

  if (embed.description && String(embed.description).trim()) {
    sanitizedEmbed.description = String(embed.description)
      .trim()
      .slice(0, 4096);
  }

  // URL must be a valid http/https URL or omitted entirely
  if (embed.url && String(embed.url).trim()) {
    const urlStr = String(embed.url).trim();
    if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
      sanitizedEmbed.url = urlStr;
    }
  }

  if (embed.color !== undefined && embed.color !== null) {
    const color =
      typeof embed.color === "number" ? embed.color : parseInt(embed.color, 10);
    if (!isNaN(color) && color >= 0 && color <= 0xffffff) {
      sanitizedEmbed.color = color;
    }
  }

  // Footer — only include if text is non-empty
  if (embed.footer && embed.footer.text && String(embed.footer.text).trim()) {
    sanitizedEmbed.footer = {
      text: String(embed.footer.text).trim().slice(0, 2048),
    };
    if (embed.footer.icon_url && String(embed.footer.icon_url).trim()) {
      sanitizedEmbed.footer.icon_url = String(embed.footer.icon_url).trim();
    }
  }

  // Image — only if URL is valid
  if (embed.image?.url && String(embed.image.url).trim()) {
    sanitizedEmbed.image = { url: String(embed.image.url).trim() };
  }

  // Thumbnail — only if URL is valid
  if (embed.thumbnail?.url && String(embed.thumbnail.url).trim()) {
    sanitizedEmbed.thumbnail = { url: String(embed.thumbnail.url).trim() };
  }

  // Author — only if name is non-empty
  if (embed.author?.name && String(embed.author.name).trim()) {
    sanitizedEmbed.author = {
      name: String(embed.author.name).trim().slice(0, 256),
    };
    if (embed.author.url && String(embed.author.url).trim()) {
      const authorUrl = String(embed.author.url).trim();
      if (authorUrl.startsWith("http://") || authorUrl.startsWith("https://")) {
        sanitizedEmbed.author.url = authorUrl;
      }
    }
    if (embed.author.icon_url && String(embed.author.icon_url).trim()) {
      sanitizedEmbed.author.icon_url = String(embed.author.icon_url).trim();
    }
  }

  // Fields — only include valid fields
  if (embed.fields && Array.isArray(embed.fields) && embed.fields.length > 0) {
    sanitizedEmbed.fields = embed.fields.slice(0, 25).map((f: any) => ({
      name:
        String(f.name || "\u200b")
          .trim()
          .slice(0, 256) || "\u200b",
      value:
        String(f.value || "\u200b")
          .trim()
          .slice(0, 1024) || "\u200b",
      inline: Boolean(f.inline),
    }));
  }

  // Timestamp — convert boolean or truthy to ISO string
  if (embed.timestamp) {
    sanitizedEmbed.timestamp = new Date().toISOString();
  }

  console.log(
    `[Send Embed API] Sending to channel ${channel_id}:`,
    JSON.stringify(sanitizedEmbed, null, 2),
  );

  try {
    const result = await $fetch(
      `https://discord.com/api/v10/channels/${channel_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: {
          embeds: [sanitizedEmbed],
        },
      },
    );

    return {
      success: true,
      messageId: (result as any).id,
    };
  } catch (error: any) {
    // Extract full Discord error details
    const discordError = error?.data || error?.response?._data;
    console.error(
      `[Send Embed API] Discord rejected embed for channel ${channel_id}:`,
      JSON.stringify(discordError, null, 2),
    );
    console.error(
      `[Send Embed API] Payload that was sent:`,
      JSON.stringify({ embeds: [sanitizedEmbed] }, null, 2),
    );

    const statusCode = error?.status || error?.statusCode || 500;

    // Build a more descriptive error from Discord's response
    let message = "Failed to send embed to Discord.";
    if (discordError?.message) {
      message = discordError.message;
      // Discord returns field-level errors in .errors
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
      statusCode,
      statusMessage: message,
    });
  }
});

/**
 * Recursively flatten Discord's nested error structure into readable messages.
 * Discord nests errors like: { embeds: { 0: { title: { _errors: [{ message: "..." }] } } } }
 */
function flattenDiscordErrors(obj: any, path = ""): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== "object") return errors;

  if (Array.isArray(obj._errors)) {
    for (const err of obj._errors) {
      errors.push(`${path}: ${err.message}`);
    }
  }

  for (const key of Object.keys(obj)) {
    if (key === "_errors") continue;
    const childPath = path ? `${path}.${key}` : key;
    errors.push(...flattenDiscordErrors(obj[key], childPath));
  }

  return errors;
}
