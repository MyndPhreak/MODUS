/**
 * R2 client helper for the dashboard server.
 *
 * Mirrors bot/StorageService.ts so the web side can generate presigned GETs
 * and issue deletes without pulling the bot's module. Feature-flagged via
 * `NUXT_USE_R2_STORAGE`; when off, callers should fall back to Appwrite.
 */
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let cached: { client: S3Client; bucket: string; ttl: number } | null = null;

/**
 * Lazy-initialized R2 client. Returns null when R2 is disabled or env vars
 * are missing — callers should treat that as "fall back to Appwrite".
 */
export function getR2() {
  if (cached) return cached;

  const config = useRuntimeConfig();
  if (String(config.useR2Storage) !== "true") return null;

  const accountId = config.r2AccountId as string;
  const accessKeyId = config.r2AccessKeyId as string;
  const secretAccessKey = config.r2SecretAccessKey as string;
  const bucket = config.r2Bucket as string;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.warn(
      "[r2] NUXT_USE_R2_STORAGE=true but NUXT_R2_* env vars are incomplete.",
    );
    return null;
  }

  const endpoint =
    (config.r2Endpoint as string) ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  const ttl = parseInt((config.r2PresignTtl as string) || "300", 10);
  cached = { client, bucket, ttl };
  return cached;
}

/** Heuristic: "/" in the key → R2 object key, else Appwrite file ID. */
export function looksLikeR2Key(fileId: string): boolean {
  return fileId.includes("/");
}

export async function presignGet(
  key: string,
  ttlSeconds?: number,
): Promise<string> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  return getSignedUrl(
    r2.client,
    new GetObjectCommand({ Bucket: r2.bucket, Key: key }),
    { expiresIn: ttlSeconds ?? r2.ttl },
  );
}

export async function deleteR2Object(key: string): Promise<void> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  await r2.client.send(
    new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }),
  );
}
