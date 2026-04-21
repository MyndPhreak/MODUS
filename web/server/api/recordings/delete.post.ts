/**
 * Fully delete a recording and every file referenced by it.
 *
 * Two DB backends:
 *   - **Postgres** (NUXT_USE_POSTGRES_RECORDINGS=true): delete rows in a
 *     transaction via FK cascade, then remove files from object storage.
 *     Atomic — either all rows are gone or none are.
 *   - **Appwrite** fallback: iterate tracks, delete each row + file, then
 *     the recording document. Best-effort (non-transactional).
 *
 * File deletion routes per `file_id` shape: slash → R2, else Appwrite.
 *
 * Body:
 *   - recording_id: The recording document ID (required)
 *   - guild_id: The guild ID for validation (required)
 */
import { Client, Databases, Storage, Query } from "node-appwrite";
import { deleteR2Object, getR2, looksLikeR2Key } from "../../utils/r2";
import { getRecordingRepo } from "../../utils/db";

async function removeFile(storage: Storage, fileId: string) {
  if (getR2() && looksLikeR2Key(fileId)) {
    try {
      await deleteR2Object(fileId);
    } catch {
      // best-effort — already gone is fine
    }
    return;
  }
  try {
    await storage.deleteFile("recordings", fileId);
  } catch {
    // best-effort
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const recordingId = body?.recording_id as string;
  const guildId = body?.guild_id as string;

  if (!recordingId || !guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing recording_id or guild_id in request body.",
    });
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const storage = new Storage(client);

  // Postgres path: single transaction, then file cleanup.
  const repo = getRecordingRepo();
  if (repo) {
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
        await removeFile(storage, track.file_id);
      }
      if (recording?.mixed_file_id) {
        await removeFile(storage, recording.mixed_file_id);
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
  }

  // Appwrite fallback.
  const databases = new Databases(client);

  try {
    const recording = await databases.getDocument(
      "discord_bot",
      "recordings",
      recordingId,
    );

    if (recording.guild_id !== guildId) {
      throw createError({
        statusCode: 403,
        statusMessage: "Recording does not belong to this guild.",
      });
    }

    const tracksRes = await databases.listDocuments(
      "discord_bot",
      "recording_tracks",
      [Query.equal("recording_id", recordingId), Query.limit(100)],
    );

    for (const track of tracksRes.documents) {
      await removeFile(storage, track.file_id);
      await databases.deleteDocument(
        "discord_bot",
        "recording_tracks",
        track.$id,
      );
    }

    if (recording.mixed_file_id) {
      await removeFile(storage, recording.mixed_file_id);
    }

    await databases.deleteDocument("discord_bot", "recordings", recordingId);

    return { success: true, deletedTracks: tracksRes.documents.length };
  } catch (error: any) {
    if (error.statusCode) throw error;

    console.error(
      `[Recordings API] Error deleting recording ${recordingId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to delete recording.",
    });
  }
});
