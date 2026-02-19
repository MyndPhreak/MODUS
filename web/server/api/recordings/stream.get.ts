/**
 * Server-side endpoint to stream/proxy a recording file from Appwrite storage.
 * Bypasses file-level security by using the API key server-side, so the browser
 * can play audio files that were uploaded by the bot (with no client permissions).
 *
 * Query params:
 *   - file_id: The Appwrite storage file ID to stream (required)
 */
import { Client, Storage } from "node-appwrite";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);

  const fileId = query.file_id as string;
  if (!fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing file_id query parameter.",
    });
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const storage = new Storage(client);

  try {
    const fileBuffer = await storage.getFileView("recordings", fileId);

    // Set appropriate headers for audio streaming
    setHeader(event, "Content-Type", "audio/ogg");
    setHeader(event, "Accept-Ranges", "bytes");
    setHeader(event, "Content-Disposition", `inline; filename="${fileId}.ogg"`);

    return Buffer.from(fileBuffer);
  } catch (error: any) {
    console.error(
      `[Recordings API] Error streaming file ${fileId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to stream recording file.",
    });
  }
});
