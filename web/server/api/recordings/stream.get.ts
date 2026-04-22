/**
 * Stream a recording file.
 *
 * 302 redirect to a short-lived presigned R2 URL so the browser pulls
 * bytes directly from R2 and no egress flows through Nitro.
 *
 * Query: file_id (R2 object key).
 */
import { getR2, looksLikeR2Key, presignGet } from "../../utils/r2";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const fileId = query.file_id as string;
  if (!fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing file_id query parameter.",
    });
  }

  if (!looksLikeR2Key(fileId)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "file_id is not an R2 object key. Legacy Appwrite file IDs are no longer served by this endpoint.",
    });
  }

  if (!getR2()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Object storage unavailable (R2 not configured).",
    });
  }

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
});
