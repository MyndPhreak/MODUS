/**
 * PUT /api/identity/:guild_id
 *
 * Apply a per-guild bot nickname/avatar. Unlike the generic
 * guild-configs PUT, this endpoint pushes the change to Discord's
 * `PATCH /guilds/{guild_id}/members/@me` synchronously and only persists
 * to Postgres after Discord confirms success — so `guild_configs` always
 * reflects what's actually live, never a value that failed to apply.
 *
 * Body: { nickname: string | null, avatarImage: string | null }
 *   - avatarImage is the proxy path returned by POST /api/identity/upload-avatar
 *   - null clears that field back to the bot's default identity
 *   - Only fields that differ from the currently stored value are sent to
 *     Discord, so a nickname-only edit never re-sends the avatar bytes.
 */
import { getR2Object, looksLikeR2Key } from "../../utils/r2";
import { getRepos } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";

const AVATAR_URL_PREFIX = "/api/identity/avatar/";
const MAX_NICKNAME_LENGTH = 32;

interface IdentityBody {
  nickname: string | null;
  avatarImage: string | null;
}

function extractAvatarKey(avatarImage: string): string | null {
  if (!avatarImage.startsWith(AVATAR_URL_PREFIX)) return null;
  const key = avatarImage.slice(AVATAR_URL_PREFIX.length);
  return key.startsWith("identity/") && looksLikeR2Key(key) ? key : null;
}

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id");
  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id route param.",
    });
  }

  await requireGuildManager(event, guildId);

  const body = await readBody<IdentityBody>(event);
  if (body?.nickname !== null && typeof body?.nickname !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "nickname must be a string or null.",
    });
  }
  if (body.nickname && body.nickname.length > MAX_NICKNAME_LENGTH) {
    throw createError({
      statusCode: 400,
      statusMessage: `Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer.`,
    });
  }
  if (body?.avatarImage !== null && typeof body?.avatarImage !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "avatarImage must be a string or null.",
    });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  const current = await repos.guildConfigs.getModuleSettings(guildId, "identity");
  const currentNickname: string | null = current.nickname ?? null;
  const currentAvatarImage: string | null = current.avatarImage ?? null;

  const patch: { nick?: string | null; avatar?: string | null } = {};

  if (body.nickname !== currentNickname) {
    patch.nick = body.nickname;
  }

  if (body.avatarImage !== currentAvatarImage) {
    if (body.avatarImage === null) {
      patch.avatar = null;
    } else {
      const key = extractAvatarKey(body.avatarImage);
      if (!key) {
        throw createError({
          statusCode: 400,
          statusMessage: "Invalid avatarImage reference.",
        });
      }
      const object = await getR2Object(key);
      if (!object) {
        throw createError({
          statusCode: 400,
          statusMessage: "Uploaded avatar image not found.",
        });
      }
      patch.avatar = `data:${object.contentType};base64,${object.body.toString("base64")}`;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { success: true, applied: false };
  }

  const config = useRuntimeConfig();
  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  try {
    await $fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${botToken}` },
      body: patch,
    });
  } catch (error: any) {
    const status = error?.status || error?.statusCode || 500;
    if (status === 429) {
      const retryAfter = error?.data?.retry_after;
      throw createError({
        statusCode: 429,
        statusMessage: retryAfter
          ? `Rate limited by Discord. Try again in ${Math.ceil(retryAfter)}s.`
          : "Rate limited by Discord. Try again shortly.",
      });
    }
    console.error(
      `[Identity API] Discord PATCH failed for guild ${guildId}:`,
      error?.data || error?.message || error,
    );
    throw createError({
      statusCode: status,
      statusMessage: error?.data?.message || "Discord rejected the identity update.",
    });
  }

  await repos.guildConfigs.setModuleSettings(guildId, "identity", {
    nickname: body.nickname,
    avatarImage: body.avatarImage,
  });

  return { success: true, applied: true };
});
