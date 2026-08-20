/**
 * Delete a single file from R2 recording storage.
 *
 * Body: { fileId: <R2 object key> }
 *
 * Handles two key shapes:
 *   - `recordings/<guild_id>/...` — guild-owned track/mix files. Caller
 *     must manage that guild.
 *   - `announce/...` — announce clips (upload-announce.post.ts) aren't
 *     guild-scoped in the key, matching that endpoint's auth: any authed
 *     user, not a per-guild manager check.
 */
import {
  deleteR2Object,
  getR2,
  guildIdFromRecordingKey,
  looksLikeR2Key,
} from "../../utils/r2";
import { requireAuthedUserId, requireModuleAccess } from "../../utils/session";

const ANNOUNCE_PREFIX = "announce/";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const fileId = body?.fileId as string;
  if (!fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing fileId in request body.",
    });
  }

  if (!looksLikeR2Key(fileId)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "fileId is not an R2 object key. Legacy Appwrite file IDs must be deleted from the Appwrite console.",
    });
  }

  if (fileId.startsWith(ANNOUNCE_PREFIX)) {
    await requireAuthedUserId(event);
  } else {
    // Only recording objects can be deleted here, and only by a manager of
    // the guild that owns them (the guild id is encoded in the key).
    const ownerGuildId = guildIdFromRecordingKey(fileId);
    if (!ownerGuildId) {
      throw createError({
        statusCode: 400,
        statusMessage: "fileId is not a recording object key.",
      });
    }
    await requireModuleAccess(event, ownerGuildId, "recording");
  }

  if (!getR2()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Object storage unavailable (R2 not configured).",
    });
  }

  try {
    await deleteR2Object(fileId);
    return { success: true };
  } catch (error: any) {
    console.error(
      `[Recordings API] Error deleting R2 object ${fileId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete recording file.",
    });
  }
});
