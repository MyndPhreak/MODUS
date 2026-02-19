/**
 * Server-side endpoint to upload an announcement sound clip
 * to the recordings storage bucket in Appwrite.
 *
 * Accepts multipart/form-data with a single "file" field.
 * Validates:
 *   - File size ≤ 5 MB
 *   - Audio format decodable by FFmpeg (common formats)
 *   - Duration ≤ 10 seconds (via ffprobe)
 *
 * Returns: { fileId: string }
 */
import { Client, Storage, ID } from "node-appwrite";
// @ts-ignore — subpath export resolves at runtime
import { InputFile } from "node-appwrite/file";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DURATION_SECONDS = 10;

const ALLOWED_MIME_PREFIXES = [
  "audio/",
  "video/ogg", // .ogg files sometimes have video/ogg MIME
  "application/ogg",
];

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
      statusMessage: `Invalid file type: ${mimeType}. Only audio files are accepted.`,
    });
  }

  // Validate duration via ffprobe
  try {
    // @ts-ignore — Node built-ins available in Nitro server context
    const { execSync } = await import("node:child_process");
    // @ts-ignore
    const { writeFileSync, unlinkSync } = await import("node:fs");
    // @ts-ignore
    const { tmpdir } = await import("node:os");
    // @ts-ignore
    const { join } = await import("node:path");

    const tmpFile = join(tmpdir(), `announce_validate_${Date.now()}.tmp`);
    writeFileSync(tmpFile, filePart.data);

    try {
      const output = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${tmpFile}"`,
        { encoding: "utf-8", timeout: 10_000 },
      ).trim();

      const duration = parseFloat(output);
      if (isNaN(duration)) {
        throw new Error("Could not determine audio duration.");
      }

      if (duration > MAX_DURATION_SECONDS) {
        throw createError({
          statusCode: 400,
          statusMessage: `Audio clip is ${duration.toFixed(1)}s — maximum allowed is ${MAX_DURATION_SECONDS}s.`,
        });
      }
    } finally {
      try {
        unlinkSync(tmpFile);
      } catch {}
    }
  } catch (err: any) {
    // If it's already a createError, re-throw
    if (err.statusCode) throw err;

    console.error(
      "[Recordings API] ffprobe validation failed:",
      err?.message || err,
    );
    throw createError({
      statusCode: 400,
      statusMessage:
        "Could not validate audio file. Ensure it is a valid audio format (mp3, ogg, wav, m4a, flac, etc.).",
    });
  }

  // Upload to Appwrite
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const storage = new Storage(client);

  try {
    const fileName = filePart.filename || `announce_${Date.now()}.audio`;
    const file = await storage.createFile(
      "recordings",
      ID.unique(),
      InputFile.fromBuffer(filePart.data, fileName),
    );

    return { fileId: file.$id };
  } catch (error: any) {
    console.error(
      "[Recordings API] Error uploading announce file:",
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to upload announce file.",
    });
  }
});
