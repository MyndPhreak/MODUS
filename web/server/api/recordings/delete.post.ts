/**
 * Server-side endpoint to fully delete a recording and all associated data.
 * Deletes: all per-user track files, track documents, mixed file, and recording document.
 *
 * Body:
 *   - recording_id: The recording document ID (required)
 *   - guild_id: The guild ID for validation (required)
 */
import { Client, Databases, Storage, Query } from "node-appwrite";

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
    // 1. Fetch the recording to verify it belongs to this guild
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

    // 2. Delete all tracks and their files
    const tracksRes = await databases.listDocuments(
      "discord_bot",
      "recording_tracks",
      [Query.equal("recording_id", recordingId), Query.limit(100)],
    );

    for (const track of tracksRes.documents) {
      // Delete the audio file from storage
      try {
        await storage.deleteFile("recordings", track.file_id);
      } catch {
        // File may already be deleted — continue
      }
      // Delete the track document
      await databases.deleteDocument(
        "discord_bot",
        "recording_tracks",
        track.$id,
      );
    }

    // 3. Delete the mixed file if present
    if (recording.mixed_file_id) {
      try {
        await storage.deleteFile("recordings", recording.mixed_file_id);
      } catch {
        // File may already be deleted
      }
    }

    // 4. Delete the recording document
    await databases.deleteDocument("discord_bot", "recordings", recordingId);

    return { success: true, deletedTracks: tracksRes.documents.length };
  } catch (error: any) {
    // Re-throw if it's already a createError
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
