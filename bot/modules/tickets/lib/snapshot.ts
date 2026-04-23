/**
 * Snapshot a closed ticket thread into Postgres + R2.
 *
 * Runs inline in the close handler on the shard that owns the thread —
 * no leader election. Idempotent by thread_id so a retry after partial
 * failure is safe.
 */
import { customAlphabet } from "nanoid";
import { ThreadChannel, Message, Embed, Attachment } from "discord.js";
import type { ModuleManager } from "../../../ModuleManager";
import type { TicketsSettings } from "../../../lib/schemas";
import type { TicketMeta } from "./types";
import { META_PREFIX } from "./types";
import type { NewTicketMessage } from "@modus/db";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// URL-safe alphabet, 24 chars ≈ 142 bits entropy.
const newSlug = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  24,
);

const MAX_PAGES = 50;
const MESSAGES_PER_PAGE = 100;

interface SnapshotEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  image_url?: string;
  thumbnail_url?: string;
}

interface MentionLookup {
  users: Record<string, string>;
  roles: Record<string, string>;
  channels: Record<string, string>;
}

// Matches <@id>, <@!id>, <@&id>, <#id> — Discord's mention markup.
// Captures [full, kind, id] where kind is `@`, `@!`, `@&`, or `#`.
const MENTION_RE = /<(@!?|@&|#)(\d{15,25})>/g;

interface SnapshotAttachment {
  name: string;
  content_type: string;
  size: number;
  is_image: boolean;
  mirrored: boolean;
  r2_key?: string;
  /** Original cdn.discordapp.com URL, kept for reference; will 404 after ~24h. */
  expired_url: string;
}

export interface SnapshotResult {
  slug: string;
  messageCount: number;
  hasSkippedAttachments: boolean;
}

export async function snapshotTranscript(
  thread: ThreadChannel,
  meta: TicketMeta,
  settings: TicketsSettings,
  moduleManager: ModuleManager,
  closedById: string,
): Promise<SnapshotResult | null> {
  const cfg = settings.webTranscripts;
  if (!cfg?.enabled) return null;

  const db = moduleManager.databaseService;
  const logger = moduleManager.logger;
  const storage = db.storage;

  // Idempotency guard
  const existing = await db.transcripts.getByThreadId(thread.id);
  if (existing) {
    return {
      slug: existing.id,
      messageCount: existing.messageCount,
      hasSkippedAttachments: existing.hasSkippedAttachments,
    };
  }

  const slug = newSlug();

  // ── Paginate thread messages (oldest → newest) ─────────────────────────
  const allMessages: Message[] = [];
  let lastId: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await thread.messages.fetch({
      limit: MESSAGES_PER_PAGE,
      before: lastId,
    });
    if (batch.size === 0) break;
    const arr = [...batch.values()];
    allMessages.push(...arr);
    lastId = arr[arr.length - 1]?.id;
    if (batch.size < MESSAGES_PER_PAGE) break;
  }
  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // ── Build message rows ─────────────────────────────────────────────────
  const messageRows: NewTicketMessage[] = [];
  const participants = new Set<string>([meta.ownerId]);
  const mentionedUserIds = new Set<string>();
  const mentionedRoleIds = new Set<string>();
  const mentionedChannelIds = new Set<string>();
  let hasSkippedAttachments = false;
  const mirrorOn = cfg.mirrorAttachments && storage != null;
  const maxBytes = cfg.attachmentMaxSizeBytes;

  // Header IDs also need resolution so the transcript can display names.
  mentionedUserIds.add(meta.ownerId);
  mentionedUserIds.add(closedById);
  if (meta.claimedById) mentionedUserIds.add(meta.claimedById);

  for (const msg of allMessages) {
    if (msg.system) continue;
    // Skip the internal ticket-meta embed
    if (
      msg.author.bot &&
      msg.embeds[0]?.footer?.text?.startsWith(META_PREFIX)
    ) {
      continue;
    }

    if (!msg.author.bot) participants.add(msg.author.id);

    // discord.js populates msg.mentions from the gateway payload, but only
    // for text the server actually parsed as a mention. Bot-sent content
    // that embeds raw `<@id>` strings still needs regex extraction to be
    // safe across all paths.
    for (const id of msg.mentions.users.keys()) mentionedUserIds.add(id);
    for (const id of msg.mentions.roles.keys()) mentionedRoleIds.add(id);
    for (const id of msg.mentions.channels.keys()) mentionedChannelIds.add(id);
    collectMentionsFromText(
      msg.content,
      mentionedUserIds,
      mentionedRoleIds,
      mentionedChannelIds,
    );

    const embeds: SnapshotEmbed[] = msg.embeds
      .filter((e) => !e.footer?.text?.startsWith(META_PREFIX))
      .map((e) => serializeEmbed(e));

    for (const e of embeds) {
      collectMentionsFromEmbed(
        e,
        mentionedUserIds,
        mentionedRoleIds,
        mentionedChannelIds,
      );
    }

    const attachments: SnapshotAttachment[] = [];
    for (const att of msg.attachments.values()) {
      const isImage = (att.contentType ?? "").startsWith("image/");
      const canMirror =
        mirrorOn && isImage && (att.size ?? 0) <= maxBytes;

      if (canMirror && storage) {
        try {
          const buf = await fetchToBuffer(att);
          const r2Key = await storage.putTicketAttachment(
            slug,
            msg.id,
            att.name ?? "attachment",
            buf,
            att.contentType ?? "application/octet-stream",
          );
          attachments.push({
            name: att.name ?? "attachment",
            content_type: att.contentType ?? "application/octet-stream",
            size: att.size ?? 0,
            is_image: isImage,
            mirrored: true,
            r2_key: r2Key,
            expired_url: att.url,
          });
          continue;
        } catch (err) {
          logger.warn(
            `Failed to mirror attachment ${att.name} for ticket ${thread.id}`,
            thread.guildId ?? undefined,
            "tickets",
          );
          // fall through to skipped path
        }
      }

      hasSkippedAttachments = true;
      attachments.push({
        name: att.name ?? "attachment",
        content_type: att.contentType ?? "application/octet-stream",
        size: att.size ?? 0,
        is_image: isImage,
        mirrored: false,
        expired_url: att.url,
      });
    }

    messageRows.push({
      transcriptId: slug,
      discordMessageId: msg.id,
      authorId: msg.author.id,
      authorTag: msg.author.tag,
      authorAvatarUrl: msg.author.displayAvatarURL({ size: 128 }),
      authorIsBot: msg.author.bot,
      content: msg.content ?? "",
      embeds: embeds as unknown,
      attachments: attachments as unknown,
      createdAt: new Date(msg.createdTimestamp),
    });
  }

  // ── Resolve mention targets to display names ───────────────────────────
  const mentions = await resolveMentions(
    thread,
    mentionedUserIds,
    mentionedRoleIds,
    mentionedChannelIds,
  );

  // ── Compute expires_at ─────────────────────────────────────────────────
  const expiresAt =
    cfg.retentionDays == null
      ? null
      : new Date(Date.now() + cfg.retentionDays * ONE_DAY_MS);

  // ── Insert ────────────────────────────────────────────────────────────
  try {
    await db.transcripts.insertSnapshot(
      {
        id: slug,
        guildId: thread.guildId!,
        ticketId: meta.ticketId,
        threadId: thread.id,
        threadName: thread.name,
        openerId: meta.ownerId,
        claimedById: meta.claimedById,
        closedById,
        typeId: meta.typeId,
        priority: meta.priority,
        participantIds: Array.from(participants),
        openedAt: new Date(meta.openedAt),
        closedAt: new Date(),
        expiresAt,
        messageCount: messageRows.length,
        hasSkippedAttachments,
        mentions,
      },
      messageRows,
    );
  } catch (err) {
    // If insertion fails after uploading blobs, attempt cleanup so we don't
    // leak orphaned R2 objects.
    if (storage) {
      await storage.deleteTicketTranscriptAssets(slug).catch(() => {});
    }
    throw err;
  }

  return {
    slug,
    messageCount: messageRows.length,
    hasSkippedAttachments,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function serializeEmbed(e: Embed): SnapshotEmbed {
  return {
    title: e.title ?? undefined,
    description: e.description ?? undefined,
    color: e.color ?? undefined,
    fields: e.fields.length
      ? e.fields.map((f) => ({
          name: f.name,
          value: f.value,
          inline: f.inline,
        }))
      : undefined,
    footer: e.footer ? { text: e.footer.text } : undefined,
    image_url: e.image?.url ?? undefined,
    thumbnail_url: e.thumbnail?.url ?? undefined,
  };
}

function collectMentionsFromText(
  text: string | null | undefined,
  users: Set<string>,
  roles: Set<string>,
  channels: Set<string>,
): void {
  if (!text) return;
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const kind = m[1]!;
    const id = m[2]!;
    if (kind === "@&") roles.add(id);
    else if (kind === "#") channels.add(id);
    else users.add(id);
  }
}

function collectMentionsFromEmbed(
  e: SnapshotEmbed,
  users: Set<string>,
  roles: Set<string>,
  channels: Set<string>,
): void {
  collectMentionsFromText(e.title, users, roles, channels);
  collectMentionsFromText(e.description, users, roles, channels);
  if (e.fields) {
    for (const f of e.fields) {
      collectMentionsFromText(f.name, users, roles, channels);
      collectMentionsFromText(f.value, users, roles, channels);
    }
  }
  collectMentionsFromText(e.footer?.text, users, roles, channels);
}

async function resolveMentions(
  thread: ThreadChannel,
  userIds: Set<string>,
  roleIds: Set<string>,
  channelIds: Set<string>,
): Promise<MentionLookup> {
  const guild = thread.guild;
  const users: Record<string, string> = {};
  const roles: Record<string, string> = {};
  const channels: Record<string, string> = {};

  // Users: prefer guild display name (nickname-aware) and fall back through
  // the client user cache. A guild.members.fetch round-trips on a cache miss
  // but we already hit the API paging the thread; one more call per unknown
  // member at close time is acceptable.
  for (const id of userIds) {
    const cached =
      guild.members.cache.get(id) ?? (await fetchMember(thread, id));
    if (cached) {
      users[id] = cached.displayName ?? cached.user.username;
      continue;
    }
    const user = thread.client.users.cache.get(id);
    if (user) users[id] = user.username;
  }

  for (const id of roleIds) {
    const role = guild.roles.cache.get(id);
    if (role) roles[id] = role.name;
  }

  for (const id of channelIds) {
    const ch = guild.channels.cache.get(id);
    if (ch) channels[id] = ch.name;
  }

  return { users, roles, channels };
}

async function fetchMember(thread: ThreadChannel, id: string) {
  try {
    return await thread.guild.members.fetch(id);
  } catch {
    return null;
  }
}

async function fetchToBuffer(att: Attachment): Promise<Buffer> {
  const res = await fetch(att.url);
  if (!res.ok) {
    throw new Error(`Fetch ${att.url} → ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
