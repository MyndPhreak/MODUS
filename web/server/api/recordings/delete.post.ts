/**
 * Fully delete a recording and every file referenced by it.
 *
 * Transactional: FK-cascades the tracks, then issues best-effort deletes
 * against object storage (R2 for slash-shaped keys, leaves Appwrite
 * Storage cleanup to the caller for legacy fileIds).
 */
import { deleteR2Object, getR2, looksLikeR2Key } from "../../utils/r2";
import { getRecordingRepo } from "../../utils/db";

async function removeFile(fileId: string) {
  if (getR2() && looksLikeR2Key(fileId)) {
    try {
      await deleteR2Object(fileId);
    } catch {
      // best-effort — already gone is fine
    }
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

    const { recording, tracks } = await repo.deleteWithTracks(recordingId);

    for (const track of tracks) {
      await removeFile(track.file_id);
    }
    if (recording?.mixed_file_id) {
      await removeFile(recording.mixed_file_id);
    }

    return { success: true, deletedTracks: tracks.length };
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
