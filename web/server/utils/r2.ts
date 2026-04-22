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
