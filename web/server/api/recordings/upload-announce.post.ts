/**
 * Upload an announcement sound clip to R2.
 *
 * Accepts multipart/form-data with a single "file" field.
 * Validates:
 *   - File size ≤ 5 MB
 *   - Audio MIME (audio/*, ogg variants)
 *   - Duration ≤ 10 seconds (via ffprobe)
 *
 * Returns: { fileId: <R2 object key> }
 */
import { randomBytes } from "crypto";
import { getR2, putR2Object } from "../../utils/r2";
import { requireAuthedUserId } from "../../utils/session";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DURATION_SECONDS = 10;

const ALLOWED_MIME_PREFIXES = [
  "audio/",
  "video/ogg", // .ogg files sometimes have video/ogg MIME
  "application/ogg",
];

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  if (!getR2()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Object storage unavailable (R2 not configured).",
    });
  }

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

  // Upload to R2 under announce/<rand>.<ext>. A random suffix avoids
  // collisions without needing a metadata store for these short clips.
  const extFromName = filePart.filename?.split(".").pop()?.toLowerCase();
  const ext = (extFromName && /^[a-z0-9]{2,5}$/.test(extFromName))
    ? extFromName
    : (mimeType.split("/")[1] || "audio").replace(/[^a-z0-9]/gi, "") || "audio";
  const key = `announce/${randomBytes(8).toString("hex")}.${ext}`;

  try {
    await putR2Object({
      key,
      body: filePart.data,
      contentType: mimeType || "audio/ogg",
    });
    return { fileId: key };
  } catch (error: any) {
    console.error(
      "[Recordings API] R2 announce upload failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to upload announce file.",
    });
  }
});
