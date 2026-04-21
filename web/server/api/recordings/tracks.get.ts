/**
 * List tracks for a recording.
 *
 * Routes to Postgres when NUXT_USE_POSTGRES_RECORDINGS=true, otherwise reads
 * from Appwrite. Shape matches Appwrite's document model on both paths.
 *
 * Query params:
 *   - recording_id: The recording document ID (required)
 */
import { Client, Databases, Query } from "node-appwrite";
import { getRecordingRepo } from "../../utils/db";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);

  const recordingId = query.recording_id as string;
  if (!recordingId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing recording_id query parameter.",
    });
  }

  const repo = getRecordingRepo();
  if (repo) {
    try {
      return await repo.listTracks(recordingId);
    } catch (error: any) {
      console.error(
        `[Recordings API] Postgres track list failed for ${recordingId}:`,
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to fetch recording tracks.",
      });
    }
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const databases = new Databases(client);

  try {
    const response = await databases.listDocuments(
      "discord_bot",
      "recording_tracks",
      [Query.equal("recording_id", recordingId), Query.limit(100)],
    );
    return response.documents;
  } catch (error: any) {
    console.error(
      `[Recordings API] Error listing tracks for recording ${recordingId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to fetch recording tracks.",
    });
  }
});
