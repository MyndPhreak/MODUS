/**
 * R2 (S3-compatible) client for the dashboard.
 *
 * Lazy-initialized. Returns null when credentials are missing so endpoints
 * can surface a 503 rather than throwing on import.
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let cached: { client: S3Client; bucket: string; ttl: number } | null = null;

export function getR2() {
  if (cached) return cached;

  const config = useRuntimeConfig();
  const accountId = config.r2AccountId as string;
  const accessKeyId = config.r2AccessKeyId as string;
  const secretAccessKey = config.r2SecretAccessKey as string;
  const bucket = config.r2Bucket as string;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
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

/** "/" in the key → R2 object key. New uploads always produce this shape. */
export function looksLikeR2Key(fileId: string): boolean {
  return fileId.includes("/");
}

/**
 * Recording objects are stored under `recordings/<guildId>/<recordingId>/...`.
 * Extract the owning guild id from a key so endpoints can authorize against it.
 * Returns null when the key isn't a recording key (so callers can reject it
 * rather than treat it as a general-purpose bucket reference).
 */
export function guildIdFromRecordingKey(key: string): string | null {
  const parts = key.split("/");
  if (parts.length < 3 || parts[0] !== "recordings") return null;
  const guildId = parts[1];
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return null;
  return guildId;
}

const IDENTITY_AVATAR_URL_PREFIX = "/api/identity/avatar/";
// Matches the exact shape produced by identity/upload-avatar.post.ts:
// `identity/<guildId>/<16-hex-char rand>.<ext>`.
const IDENTITY_AVATAR_KEY_RE = /^identity\/(\d{10,})\/[a-f0-9]{16}\.[a-z0-9]+$/;

/**
 * Extract the R2 key from a stored `avatarImage` proxy path, scoped to the
 * given guild. Returns null for anything that isn't exactly what
 * upload-avatar.post.ts produces for that guild — a missing/wrong-guild/
 * malformed value is treated as "nothing to clean up" rather than guessed at.
 */
export function extractIdentityAvatarKey(
  avatarImage: string | null | undefined,
  guildId: string,
): string | null {
  if (!avatarImage || !avatarImage.startsWith(IDENTITY_AVATAR_URL_PREFIX)) {
    return null;
  }
  const key = avatarImage.slice(IDENTITY_AVATAR_URL_PREFIX.length);
  const match = IDENTITY_AVATAR_KEY_RE.exec(key);
  return match && match[1] === guildId ? key : null;
}

const WELCOME_BG_URL_PREFIX = "/api/welcome/bg/";
// Matches the exact shape produced by welcome/upload-bg.post.ts:
// `welcome/<guildId>/<16-hex-char rand>.<ext>`.
const WELCOME_BG_KEY_RE = /^welcome\/(\d{10,})\/[a-f0-9]{16}\.[a-z0-9]+$/;

/** Same idea as extractIdentityAvatarKey, for the welcome background field. */
export function extractWelcomeBgKey(
  backgroundImage: string | null | undefined,
  guildId: string,
): string | null {
  if (!backgroundImage || !backgroundImage.startsWith(WELCOME_BG_URL_PREFIX)) {
    return null;
  }
  const key = backgroundImage.slice(WELCOME_BG_URL_PREFIX.length);
  const match = WELCOME_BG_KEY_RE.exec(key);
  return match && match[1] === guildId ? key : null;
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

export async function putR2Object(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}

/**
 * Fetch an object as `{ body, contentType }`. Returns null when the
 * object doesn't exist.
 */
export async function getR2Object(
  key: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  try {
    const res = await r2.client.send(
      new GetObjectCommand({ Bucket: r2.bucket, Key: key }),
    );
    if (!res.Body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as NodeJS.ReadableStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return {
      body: Buffer.concat(chunks),
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}
