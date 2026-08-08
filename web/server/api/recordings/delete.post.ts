/**
 * Fully delete a recording and every file referenced by it.
 *
 * Deletes R2 objects first, DB row second. If any R2 delete fails, the row
 * is left in place (and a 502 returned) so the recording stays a candidate
 * for retry instead of the DB losing track of files that are still sitting
 * in R2, orphaned with no reference left anywhere.
 */
import { deleteR2Object, getR2, looksLikeR2Key } from "../../utils/r2";
import { getRecordingRepo } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";

async function removeFile(fileId: string) {
  if (getR2() && looksLikeR2Key(fileId)) {
    await deleteR2Object(fileId);
  }
  // Non-R2 file IDs are legacy Appwrite Storage references; the Appwrite
  // cleanup has been removed as part of the decommission. Operators with
  // remaining legacy files can remove them from the Appwrite console or
  // run a one-shot copy script before flipping the bot to R2.
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const recordingId = body?.recording_id as string;
  const guildId = body?.guild_id as string;

  if (!recordingId || !guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing recording_id or guild_id in request body.",
    });
  }

  const repo = getRecordingRepo();
  if (!repo) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  try {
    const existing = await repo.getById(recordingId);
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: "Recording not found." });
    }
    if (existing.guild_id !== guildId) {
      throw createError({
        statusCode: 403,
        statusMessage: "Recording does not belong to this guild.",
      });
    }

    // Authorize against the recording's true owning guild — never trust the
    // guild_id from the body alone for the permission decision.
    await requireGuildManager(event, existing.guild_id);

    const tracks = await repo.listTracks(recordingId);

    try {
      for (const track of tracks) {
        await removeFile(track.file_id);
      }
      if (existing.mixed_file_id) {
        await removeFile(existing.mixed_file_id);
      }
    } catch (error: any) {
      console.error(
        `[Recordings API] R2 delete failed for ${recordingId}, DB row kept for retry:`,
        error?.message || error,
      );
      throw createError({
        statusCode: 502,
        statusMessage:
          "Failed to delete recording files from storage. The recording was not removed — try again.",
      });
    }

    const { tracks: deletedTracks } = await repo.deleteWithTracks(recordingId);

    return { success: true, deletedTracks: deletedTracks.length };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error(
      `[Recordings API] Postgres delete failed for ${recordingId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete recording.",
    });
  }
});
