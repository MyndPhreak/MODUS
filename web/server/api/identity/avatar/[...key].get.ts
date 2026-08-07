/**
 * Stream a per-guild bot avatar image from R2.
 *
 * Stored objects live under `identity/<guild_id>/<filename>` so the
 * catch-all route preserves slashes via Nitro's `[...key]` param. A long
 * Cache-Control lets browsers reuse the image — the key is random per
 * upload, so replacing the avatar always produces a new URL.
 */
import { getR2Object, looksLikeR2Key } from "../../../utils/r2";

const IDENTITY_PREFIX = "identity/";
const IMAGE_CACHE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default defineEventHandler(async (event) => {
  const keyParam = getRouterParam(event, "key");
  if (!keyParam) {
    throw createError({ statusCode: 400, statusMessage: "Missing key" });
  }

  // Safety: only allow keys under the identity prefix so this endpoint
  // can't be used as a general-purpose R2 read oracle.
  const key = keyParam.startsWith(IDENTITY_PREFIX)
    ? keyParam
    : `${IDENTITY_PREFIX}${keyParam}`;

  if (!looksLikeR2Key(key)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid key" });
  }

  try {
    const object = await getR2Object(key);
    if (!object) {
      throw createError({ statusCode: 404, statusMessage: "Not Found" });
    }
    setResponseHeader(event, "Content-Type", object.contentType);
    setResponseHeader(event, "X-Content-Type-Options", "nosniff");
    setResponseHeader(
      event,
      "Cache-Control",
      `public, max-age=${IMAGE_CACHE_MAX_AGE}, immutable`,
    );
    return object.body;
  } catch (err: any) {
    if (err?.statusCode) throw err;
    console.error(`[identity-avatar] Failed to stream ${key}:`, err?.message || err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to load avatar image.",
    });
  }
});
