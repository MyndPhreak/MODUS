/**
 * Server-side endpoint to list recording tracks for a specific recording.
 * Uses the Appwrite API key to bypass document-level permissions.
 *
 * Query params:
 *   - recording_id: The recording document ID (required)
 */
import { Client, Databases, Query } from "node-appwrite";

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
