/**
 * Delete a single file from recording storage.
 *
 * Routes by key shape: "/"-containing keys go to R2 (when enabled), plain IDs
 * go to Appwrite Storage. Keeps the same request contract so the dashboard
 * doesn't need to know which backend a file lives on.
 *
 * Body:
 *   - fileId: Appwrite file ID or R2 object key
 */
import { Client, Storage } from "node-appwrite";
import { deleteR2Object, getR2, looksLikeR2Key } from "../../utils/r2";

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

  // R2 path.
  if (getR2() && looksLikeR2Key(fileId)) {
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
  }

  // Appwrite fallback.
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
