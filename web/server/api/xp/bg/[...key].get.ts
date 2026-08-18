/**
 * Stream an XP rank card background image from R2.
 *
 * Stored objects live under `xp/<guild_id>/<filename>`.
 */
import { getR2Object, looksLikeR2Key } from "../../../utils/r2";

const XP_PREFIX = "xp/";
const IMAGE_CACHE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default defineEventHandler(async (event) => {
  const keyParam = getRouterParam(event, "key");
  if (!keyParam) {
    throw createError({ statusCode: 400, statusMessage: "Missing key" });
  }

  const key = keyParam.startsWith(XP_PREFIX)
    ? keyParam
    : `${XP_PREFIX}${keyParam}`;

  if (!looksLikeR2Key(key)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid key" });
  }

  try {
    const object = await getR2Object(key);
    if (!object) {
      throw createError({ statusCode: 404, statusMessage: "Not Found" });
    }
    const contentType = object.contentType || "application/octet-stream";
    setResponseHeader(event, "Content-Type", contentType);
    setResponseHeader(event, "X-Content-Type-Options", "nosniff");
    if (contentType.toLowerCase().startsWith("image/svg+xml")) {
      setResponseHeader(
        event,
        "Content-Security-Policy",
        "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      );
    }
    setResponseHeader(
      event,
      "Cache-Control",
      `public, max-age=${IMAGE_CACHE_MAX_AGE}, immutable`,
    );
    return object.body;
  } catch (err: any) {
    if (err?.statusCode) throw err;
    console.error(
      `[xp-bg] Failed to stream ${key}:`,
      err?.message || err,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to load background image.",
    });
  }
});
