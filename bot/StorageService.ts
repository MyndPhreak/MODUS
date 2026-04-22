/**
 * R2 / S3-compatible object storage for recordings.
 *
 * Wraps the AWS SDK v3 S3 client with conventions that fit MODUS:
 *   - Streaming multipart uploads so we never buffer a whole OGG in memory.
 *   - Presigned GETs so the dashboard links users directly at R2 (no egress
 *     through Nitro).
 *   - Structured object keys: `recordings/<guildId>/<recordingId>/<file>.ogg`
 *     — groups a session's files together for bulk prefix deletes.
 *
 * Feature-flagged via USE_R2_STORAGE. When disabled, DatabaseService falls
 * back to the existing Appwrite Storage path and this service is never
 * instantiated.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
  presignTtlSeconds: number;
}

export class StorageService {
  private client: S3Client;
  private bucket: string;
  private presignTtl: number;

  constructor(config: R2Config) {
    const endpoint =
      config.endpoint ||
      `https://${config.accountId}.r2.cloudflarestorage.com`;

    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2 doesn't require checksum headers and will reject some SDK defaults.
      forcePathStyle: true,
    });
    this.bucket = config.bucket;
    this.presignTtl = config.presignTtlSeconds;
  }

  /** Build R2 config from env. Returns null if required vars are missing. */
  static fromEnv(): R2Config | null {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
    return {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      endpoint: process.env.R2_ENDPOINT || undefined,
      presignTtlSeconds: parseInt(process.env.R2_PRESIGN_TTL || "300", 10),
    };
  }

  /**
   * Upload a Readable stream as a multipart object. No in-memory buffering —
   * parts are flushed to R2 as the stream produces data.
   */
  async uploadStream(
    key: string,
    body: Readable,
    contentType = "audio/ogg",
  ): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
      // 8 MB parts — balances memory (one part per concurrent upload) against
      // the 10k-part multipart ceiling (=> 80 GB max per file, plenty).
      partSize: 8 * 1024 * 1024,
      queueSize: 4,
    });
    await upload.done();
  }

  /** Convenience for small blobs (e.g. announce clips) that fit in memory. */
  async uploadBuffer(
    key: string,
    body: Buffer,
    contentType = "audio/ogg",
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Fetch the object as a Buffer. Used only by the mixing pipeline. */
  async getBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!res.Body) throw new Error(`R2 object ${key} has no body`);
    // Body is a Readable in Node — collect it.
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Bulk delete by object keys. Fire-and-forget for best-effort cleanup. */
  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    // S3/R2 caps at 1000 per request.
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  /** List all object keys under a prefix. Paginates transparently. */
  async listPrefix(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of res.Contents || []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = res.IsTruncated
        ? res.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return keys;
  }

  /**
   * Presigned GET URL. Browser fetches the file directly from R2 so bytes
   * never pass through Nitro.
   */
  async presignGet(key: string, ttlSeconds?: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds ?? this.presignTtl },
    );
  }

  /**
   * Upload a ticket attachment to R2. Keys are structured as
   * `transcripts/<transcriptId>/<discordMessageId>/<filename>` so retention
   * cleanup can bulk-list-and-delete by transcript prefix.
   */
  async putTicketAttachment(
    transcriptId: string,
    discordMessageId: string,
    filename: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const safeName = filename.replace(/[^\w.\-]/g, "_");
    const key = `transcripts/${transcriptId}/${discordMessageId}/${safeName}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  /** Presigned GET for a transcript attachment; caller chooses TTL. */
  async getSignedTicketAttachmentUrl(
    key: string,
    ttlSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  /**
   * List + batch-delete all R2 objects under a transcript prefix.
   * Idempotent — missing objects are not an error.
   */
  async deleteTicketTranscriptAssets(transcriptId: string): Promise<number> {
    const prefix = `transcripts/${transcriptId}/`;
    let deleted = 0;
    let continuationToken: string | undefined;

    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const contents = list.Contents ?? [];
      if (contents.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: contents.map((o) => ({ Key: o.Key! })),
              Quiet: true,
            },
          }),
        );
        deleted += contents.length;
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);

    return deleted;
  }
}

// ── Key conventions ───────────────────────────────────────────────────────

/** Object key for a per-user multitrack file. */
export function trackKey(
  guildId: string,
  recordingId: string,
  userId: string,
  timestamp: number,
): string {
  return `recordings/${guildId}/${recordingId}/track_${userId}_${timestamp}.ogg`;
}

/** Object key for a session's mixed file. */
export function mixedKey(
  guildId: string,
  recordingId: string,
  timestamp: number,
): string {
  return `recordings/${guildId}/${recordingId}/mixed_${timestamp}.ogg`;
}

/** Prefix that groups every file for a single recording session. */
export function recordingPrefix(
  guildId: string,
  recordingId: string,
): string {
  return `recordings/${guildId}/${recordingId}/`;
}

/** Heuristic: treat keys containing a "/" as R2 object keys, not Appwrite IDs. */
export function looksLikeR2Key(fileId: string): boolean {
  return fileId.includes("/");
}
