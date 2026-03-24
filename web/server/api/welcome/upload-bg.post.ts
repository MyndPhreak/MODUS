/**
 * Server-side endpoint to upload a welcome image background.
 * Accepts multipart/form-data with a single "file" field (image).
 *
 * Validates:
 *   - File size ≤ 8 MB
 *   - MIME type is image/*
 *
 * Stores in Appwrite Storage bucket "welcome_assets" and returns
 * the public download URL that the bot can fetch at render time.
 *
 * Returns: { url: string, fileId: string }
 */
import { Client, Storage, ID } from "node-appwrite";
// @ts-ignore — subpath export resolves at runtime
import { InputFile } from "node-appwrite/file";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const BUCKET_ID = "welcome_assets";

const ALLOWED_MIME_PREFIXES = ["image/"];

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // Parse multipart form data
  const formData = await readMultipartFormData(event);
  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "No file uploaded.",
    });
  }

  const filePart = formData.find((part) => part.name === "file");
  if (!filePart || !filePart.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing 'file' field in form data.",
    });
  }

  // Validate file size
  if (filePart.data.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
    });
  }

  // Validate MIME type
  const mimeType = filePart.type || "";
  const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
    mimeType.startsWith(prefix),
  );
  if (!isAllowed) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid file type: ${mimeType}. Only image files are accepted.`,
    });
  }

  // Upload to Appwrite Storage
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const storage = new Storage(client);

  try {
    const fileId = ID.unique();
    const ext = mimeType.split("/")[1] || "png";
    const fileName =
      filePart.filename || `welcome_bg_${Date.now()}.${ext}`;

    await storage.createFile(
      BUCKET_ID,
      fileId,
      InputFile.fromBuffer(filePart.data, fileName),
    );

    // Build the public download URL
    const endpoint = config.public.appwriteEndpoint as string;
    const projectId = config.public.appwriteProjectId as string;
    const url = `${endpoint}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${projectId}`;

    return { url, fileId };
  } catch (error: any) {
    console.error(
      "[Welcome API] Error uploading background image:",
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage:
        error?.message || "Failed to upload background image.",
    });
  }
});
