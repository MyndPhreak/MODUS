/**
 * Fully delete a recording and every file referenced by it.
 * Deletes: all per-user track files, track documents, mixed file, and
 * the recording document itself. Files are removed from whichever backend
 * owns them (R2 or Appwrite) based on the shape of the stored file IDs.
 *
 * Body:
 *   - recording_id: The recording document ID (required)
 *   - guild_id: The guild ID for validation (required)
 */
import { Client, Databases, Storage, Query } from "node-appwrite";
import { deleteR2Object, getR2, looksLikeR2Key } from "../../utils/r2";

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

  const databases = new Databases(client);
  const storage = new Storage(client);

  try {
    // 1. Verify ownership
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

    // 2. Delete tracks (files + documents)
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

    // 3. Delete the mixed file
    if (recording.mixed_file_id) {
      await removeFile(storage, recording.mixed_file_id);
    }

    // 4. Delete the recording document
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
