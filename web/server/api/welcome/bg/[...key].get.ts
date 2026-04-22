/**
 * Stream a welcome background image from R2.
 *
 * Stored objects live under `welcome/<guild_id>/<filename>` so the catch-all
 * route preserves slashes via Nitro's `[...key]` param. A long Cache-Control
 * lets browsers reuse the image across renders — the key is content-hashed
 * at upload time so mutating the bg produces a new URL anyway.
 */
import { getR2Object, looksLikeR2Key } from "../../../utils/r2";

const WELCOME_PREFIX = "welcome/";
const IMAGE_CACHE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export default defineEventHandler(async (event) => {
  const keyParam = getRouterParam(event, "key");
  if (!keyParam) {
    throw createError({ statusCode: 400, statusMessage: "Missing key" });
  }

  // Safety: only allow keys under the welcome prefix so this endpoint can't
  // be used as a general-purpose R2 read oracle.
  const key = keyParam.startsWith(WELCOME_PREFIX)
    ? keyParam
    : `${WELCOME_PREFIX}${keyParam}`;

  if (!looksLikeR2Key(key)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid key" });
  }

  try {
    const object = await getR2Object(key);
    if (!object) {
      throw createError({ statusCode: 404, statusMessage: "Not Found" });
    }
    setResponseHeader(event, "Content-Type", object.contentType);
    setResponseHeader(
      event,
      "Cache-Control",
      `public, max-age=${IMAGE_CACHE_MAX_AGE}, immutable`,
    );
    return object.body;
  } catch (err: any) {
    if (err?.statusCode) throw err;
    console.error(
      `[welcome-bg] Failed to stream ${key}:`,
      err?.message || err,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to load background image.",
    });
  }
});
