/**
 * Upload a welcome background image.
 *
 * Stores under `welcome/<guild_id>/<rand>.<ext>` in R2 (primary path).
 * Returns a stable proxy URL (`/api/welcome/bg/welcome/<guild_id>/<rand>.<ext>`)
 * that the editor persists into the template. Legacy templates that store
 * full Appwrite URLs keep working — the renderer's `loadImage` handles any
 * HTTP URL.
 *
 * Accepts multipart/form-data:
 *   - file: image payload (required, ≤ 8 MB, MIME must start with image/)
 *   - guild_id: Discord guild id (required, scopes the key namespace)
 */
import { Client, Storage, ID } from "node-appwrite";
// @ts-ignore — subpath export resolves at runtime
import { InputFile } from "node-appwrite/file";
import { randomBytes } from "crypto";
import { getR2, putR2Object } from "../../utils/r2";
import { requireAuthedUserId } from "../../utils/session";

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const APPWRITE_BUCKET_ID = "welcome_assets";
const ALLOWED_MIME_PREFIXES = ["image/"];

function guildIdFromParts(parts: any[] | null): string | null {
  const field = parts?.find((p) => p.name === "guild_id");
  if (!field) return null;
  // Non-file fields come through as a Buffer of the raw form value.
  const value = field.data?.toString("utf8") ?? "";
  return /^[0-9]{10,}$/.test(value) ? value : null;
}

export default defineEventHandler(async (event) => {
  // Authenticate so only dashboard users can upload.
  await requireAuthedUserId(event);

  const config = useRuntimeConfig();
  const formData = await readMultipartFormData(event);
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "No file uploaded." });
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

  const ext = (mimeType.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
  const rand = randomBytes(8).toString("hex");
  const key = `welcome/${guildId}/${rand}.${ext}`;

  // ── R2 primary path ─────────────────────────────────────────────────────
  if (getR2()) {
    try {
      await putR2Object({
        key,
        body: filePart.data,
        contentType: mimeType,
      });
      // Proxy URL — stable across deployments, works from the dashboard
      // editor (browser) and the bot-side renderer (which passes through
      // loadImage → HTTP fetch → this proxy).
      const url = `/api/welcome/bg/${key}`;
      return { url, fileId: key };
    } catch (error: any) {
      console.error(
        "[Welcome API] R2 upload failed:",
        error?.message || error,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to upload background image to R2.",
      });
    }
  }

  // ── Appwrite Storage fallback ──────────────────────────────────────────
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint as string)
    .setProject(config.public.appwriteProjectId as string)
    .setKey(config.appwriteApiKey as string);

  const storage = new Storage(client);

  try {
    const fileId = ID.unique();
    const fileName =
      filePart.filename || `welcome_bg_${Date.now()}.${ext}`;

    await storage.createFile(
      APPWRITE_BUCKET_ID,
      fileId,
      InputFile.fromBuffer(filePart.data, fileName),
    );

    const endpoint = config.public.appwriteEndpoint as string;
    const projectId = config.public.appwriteProjectId as string;
    const url = `${endpoint}/storage/buckets/${APPWRITE_BUCKET_ID}/files/${fileId}/view?project=${projectId}`;

    return { url, fileId };
  } catch (error: any) {
    console.error(
      "[Welcome API] Appwrite upload failed:",
      error?.message || error,
    );
    throw createError({
      statusCode: error?.code || 500,
      statusMessage: error?.message || "Failed to upload background image.",
    });
  }
});
