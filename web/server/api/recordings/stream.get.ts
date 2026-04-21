/**
 * Stream/proxy a recording file.
 *
 * Two backends:
 *   - **R2** (when NUXT_USE_R2_STORAGE=true and the file_id looks like an R2
 *     object key): issue a 302 redirect to a short-lived presigned URL so the
 *     browser pulls bytes straight from R2 and no egress flows through Nitro.
 *   - **Appwrite** (legacy / fallback): proxy the file through the dashboard
 *     using the server-side API key.
 *
 * Query params:
 *   - file_id: Appwrite file ID or R2 object key (required)
 */
import { Client, Storage } from "node-appwrite";
import { getR2, looksLikeR2Key, presignGet } from "../../utils/r2";

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

  // R2 path: redirect the browser to a presigned URL.
  const r2 = getR2();
  if (r2 && looksLikeR2Key(fileId)) {
    try {
      const url = await presignGet(fileId);
      return sendRedirect(event, url, 302);
    } catch (error: any) {
      console.error(
        `[Recordings API] Error presigning R2 key ${fileId}:`,
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to generate playback URL.",
      });
    }
  }

  // Appwrite fallback: proxy bytes through Nitro.
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const storage = new Storage(client);

  try {
    const fileBuffer = await storage.getFileView("recordings", fileId);

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
