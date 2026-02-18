/**
 * Server-side endpoint to delete a file from the recordings storage bucket.
 * Uses the Appwrite API key (server-side only) since client SDK lacks
 * storage file deletion permissions.
 *
 * Body:
 *   - fileId: The Appwrite storage file ID to delete
 */
import { Client, Storage } from "node-appwrite";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const body = await readBody(event);

  const fileId = body?.fileId as string;
  if (!fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing fileId in request body.",
    });
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const storage = new Storage(client);

  try {
    await storage.deleteFile("recordings", fileId);
    return { success: true };
  } catch (error: any) {
    console.error(
      `[Recordings API] Error deleting file ${fileId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to delete recording file.",
    });
  }
});
