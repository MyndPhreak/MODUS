/**
 * Upload a welcome image layer to R2.
 *
 * Stores under `welcome/<guild_id>/layers/<rand>.<ext>`. Returns a stable
 * proxy URL `/api/welcome/bg/<key>` that the editor persists into the template.
 *
 * Accepts multipart/form-data:
 *   - file: image payload (required, <= 5 MB, MIME must start with image/)
 *   - guild_id: Discord guild id (required, scopes the key namespace)
 */
import { randomBytes } from "crypto";
import { getR2, putR2Object } from "../../utils/r2";
import { requireAuthedUserId } from "../../utils/session";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_PREFIXES = ["image/"];

function guildIdFromParts(parts: any[] | null): string | null {
  const field = parts?.find((p) => p.name === "guild_id");
  if (!field) return null;
  const value = field.data?.toString("utf8") ?? "";
  return /^[0-9]{10,}$/.test(value) ? value : null;
}

export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);

  if (!getR2()) {
    throw createError({
      statusCode: 503,
      statusMessage: "Object storage unavailable (R2 not configured).",
    });
  }

  const contentLength = Number(getHeader(event, "content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 413,
      statusMessage: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
    });
  }

  const formData = await readMultipartFormData(event);
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "No image uploaded." });
  }

  const filePart = formData.find((part) => part.name === "file");
  if (!filePart || !filePart.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing 'file' field in form data.",
    });
  }

  if (filePart.data.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
    });
  }

  const mimeType = filePart.type || "";
  if (!ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid file type: ${mimeType}. Only image files are accepted.`,
    });
  }

  const guildId = guildIdFromParts(formData);
  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid guild_id in form data.",
    });
  }

  const ext =
    mimeType === "image/svg+xml"
      ? "svg"
      : (mimeType.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
  const rand = randomBytes(8).toString("hex");
  const key = `welcome/${guildId}/layers/${rand}.${ext}`;

  try {
    await putR2Object({
      key,
      body: filePart.data,
      contentType: mimeType,
    });
    const url = `/api/welcome/bg/${key}`;
    return { url, fileId: key };
  } catch (error: any) {
    console.error(
      "[Welcome API] R2 image layer upload failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to upload image layer.",
    });
  }
});
