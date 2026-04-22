/**
 * Delete a single file from R2 recording storage.
 *
 * Body: { fileId: <R2 object key> }
 */
import { deleteR2Object, getR2, looksLikeR2Key } from "../../utils/r2";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const fileId = body?.fileId as string;
  if (!fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing fileId in request body.",
    });
  }

  if (!looksLikeR2Key(fileId)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "fileId is not an R2 object key. Legacy Appwrite file IDs must be deleted from the Appwrite console.",
    });
  }

  if (!getR2()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Object storage unavailable (R2 not configured).",
    });
  }

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
});
