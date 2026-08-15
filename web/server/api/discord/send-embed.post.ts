/**
 * Server-side endpoint to send an embed to a specific channel.
 * Uses the Discord bot token to send messages directly.
 */
import { requireGuildManager } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const { guild_id, embed, content } = body || {};
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

  // Sending with the bot token is a privileged action — restrict to managers
  // of the target guild.
  await requireGuildManager(event, guild_id);

  // Validate embed has at least title or description or fields or components
  const hasContent =
    embed.title ||
    embed.description ||
    (embed.fields && embed.fields.length > 0) ||
    (embed.buttons && embed.buttons.length > 0) ||
    (embed.select_menus && embed.select_menus.length > 0);

  if (!hasContent) {
    throw createError({
      statusCode: 400,
      statusMessage: "Embed must have at least title, description, fields, buttons, or select menus.",
    });
  }

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  // Confirm the target channel actually belongs to the authorized guild.
  // requireGuildManager only proves the caller manages `guild_id`; without
  // this check a manager of one guild could still address a channel in a
  // different guild the bot happens to be in.
  let channelGuildId: string | undefined;
  try {
    const channel = (await $fetch(
      `https://discord.com/api/v10/channels/${channel_id}`,
      { headers: { Authorization: `Bot ${botToken}` } },
    )) as { guild_id?: string };
    channelGuildId = channel.guild_id;
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Channel not found or the bot cannot access it.",
    });
  }
  if (channelGuildId !== guild_id) {
    throw createError({
      statusCode: 403,
      statusMessage: "Channel does not belong to this server.",
    });
  }

  const messageBody = buildDiscordMessageBody(embed, content);

  console.log(
    `[Send Embed API] Sending to channel ${channel_id}:`,
    JSON.stringify(messageBody, null, 2),
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
        body: messageBody,
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
      JSON.stringify(messageBody, null, 2),
    );

    const statusCode = error?.status || error?.statusCode || 500;

    let message = "Failed to send embed to Discord.";
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
      statusCode,
      statusMessage: message,
    });
  }
});

/**
 * Builds valid Discord Components V2 REST API message payload (flags: 32768).
 */
function buildDiscordMessageBody(embed: any, content?: string): Record<string, any> {
  const innerComponents: any[] = [];

  // Title Header (TextDisplay type 10)
  if (embed.title && String(embed.title).trim()) {
    let titleText = `# ${embed.title.trim()}`;
    if (embed.url && String(embed.url).trim()) {
      titleText = `# [${embed.title.trim()}](${embed.url.trim()})`;
    }
    innerComponents.push({
      type: 10, // TextDisplay
      content: titleText,
    });
  }

  // Author Header (TextDisplay type 10)
  if (embed.author?.name && String(embed.author.name).trim()) {
    let authorText = `*${embed.author.name.trim()}*`;
    if (embed.author.url && String(embed.author.url).trim()) {
      authorText = `* [${embed.author.name.trim()}](${embed.author.url.trim()})*`;
    }
    innerComponents.push({
      type: 10, // TextDisplay
      content: authorText,
    });
  }

  // Description with Separator (Type 14) splitting
  if (embed.description && String(embed.description).trim()) {
    const rawDesc = String(embed.description).trim();
    const parts = rawDesc.split(/(?:\r?\n){2,}(?:---|[*]{3})(?:\r?\n){2,}|(?:\r?\n)(?:---|[*]{3})(?:\r?\n)/);
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i]?.trim();
      if (chunk) {
        innerComponents.push({
          type: 10, // TextDisplay
          content: chunk,
        });
      }
      if (i < parts.length - 1) {
        innerComponents.push({
          type: 14, // Separator
          divider: true,
          spacing: 1,
        });
      }
    }
  }

  // Section (Type 9) with Thumbnail (Type 11) accessory if thumbnail provided
  if (embed.thumbnail?.url && String(embed.thumbnail.url).trim()) {
    const thumbUrl = String(embed.thumbnail.url).trim();
    if (innerComponents.length > 0) {
      const lastText = innerComponents.pop();
      innerComponents.push({
        type: 9, // Section
        components: [lastText],
        accessory: {
          type: 11, // Thumbnail
          media: { url: thumbUrl },
        },
      });
    } else {
      innerComponents.push({
        type: 9, // Section
        components: [{ type: 10, content: " " }],
        accessory: {
          type: 11, // Thumbnail
          media: { url: thumbUrl },
        },
      });
    }
  }

  // Fields (TextDisplay type 10)
  if (embed.fields && Array.isArray(embed.fields) && embed.fields.length > 0) {
    for (const f of embed.fields) {
      if (f.name || f.value) {
        innerComponents.push({
          type: 10, // TextDisplay
          content: `**${f.name || "​"}**\n${f.value || "​"}`,
        });
      }
    }
  }

  // Media Gallery (Type 12)
  const mediaGalleryUrls: string[] = [];
  if (embed.media_gallery && Array.isArray(embed.media_gallery)) {
    for (const u of embed.media_gallery) {
      if (typeof u === "string" && u.trim()) mediaGalleryUrls.push(u.trim());
    }
  } else if (embed.image?.url && String(embed.image.url).trim()) {
    mediaGalleryUrls.push(embed.image.url.trim());
  }

  if (mediaGalleryUrls.length > 0) {
    innerComponents.push({
      type: 12, // MediaGallery
      items: mediaGalleryUrls.slice(0, 4).map((url) => ({
        media: { url },
      })),
    });
  }

  // Buttons Row (Type 2 inside ActionRow Type 1)
  if (embed.buttons && Array.isArray(embed.buttons) && embed.buttons.length > 0) {
    const styleMap: Record<string, number> = {
      primary: 1,
      secondary: 2,
      success: 3,
      danger: 4,
      link: 5,
    };

    const actionRowButtons: any[] = [];
    embed.buttons.slice(0, 5).forEach((b: any, idx: number) => {
      const label = String(b.label || "Button").trim().slice(0, 80) || "Button";
      const rawUrl = b.url && String(b.url).trim();

      if (rawUrl && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))) {
        actionRowButtons.push({
          type: 2, // Button
          style: 5, // Link
          label,
          url: rawUrl,
        });
      } else {
        const styleNum = styleMap[b.style?.toLowerCase()] || 1;
        actionRowButtons.push({
          type: 2, // Button
          style: styleNum === 5 ? 1 : styleNum,
          label,
          custom_id: b.custom_id && String(b.custom_id).trim() ? String(b.custom_id).trim() : `btn_${idx}`,
        });
      }
    });

    if (actionRowButtons.length > 0) {
      innerComponents.push({
        type: 1, // ActionRow
        components: actionRowButtons,
      });
    }
  }

  // Footer (TextDisplay type 10)
  if (embed.footer?.text && String(embed.footer.text).trim()) {
    innerComponents.push({
      type: 10, // TextDisplay
      content: `-# *${embed.footer.text.trim()}*`,
    });
  }

  const messageBody: Record<string, any> = {
    flags: 32768, // IS_COMPONENTS_V2
  };

  if (content && String(content).trim()) {
    messageBody.content = String(content).trim().slice(0, 2000);
  }

  const useContainer = embed.use_container !== false;
  const color =
    typeof embed.color === "number"
      ? embed.color
      : colorHexToInt(embed.color || "#5865f2");

  if (useContainer) {
    messageBody.components = [
      {
        type: 17, // Container
        accent_color: color,
        components: innerComponents,
      },
    ];
  } else {
    messageBody.components = innerComponents;
  }

  return messageBody;
}

/**
 * Convert a `#rrggbb` hex string to Discord's integer color form.
 * Defined locally because the shared `app/utils` helper is a client-side
 * auto-import and is not in scope inside Nitro server routes.
 */
function colorHexToInt(hex: string): number {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return isNaN(n) ? 0x5865f2 : n;
}

/**
 * Recursively flatten Discord's nested error structure into readable messages.
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
