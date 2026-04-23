/**
 * GET /api/tickets/transcripts/:slug
 *
 * Auth-gated transcript fetch. Returns 404 for all denial cases
 * (not-found, expired, forbidden) so the slug enumeration signal is
 * equivalent across them.
 */
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getRepos } from "../../../utils/db";
import { getResolvedDiscordId } from "../../../utils/session";
import { getR2 } from "../../../utils/r2";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");
  if (!slug || slug.length < 8 || slug.length > 64) {
    throw createError({ statusCode: 404, statusMessage: "Not found." });
  }

  // Resolve caller; unauthenticated → treat as "not found" to match the
  // other denial paths and avoid leaking slug existence via a 401.
  const callerId = await getResolvedDiscordId(event);
  if (!callerId) {
    throw createError({ statusCode: 404, statusMessage: "Not found." });
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable.",
    });
  }

  const result = await repos.transcripts.getWithMessages(slug);
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: "Not found." });
  }

  const { transcript, messages } = result;

  if (transcript.expiresAt && transcript.expiresAt.getTime() < Date.now()) {
    throw createError({ statusCode: 404, statusMessage: "Not found." });
  }

  // Access check: opener | participant | guild admin/owner.
  const isOpener = transcript.openerId === callerId;
  const isParticipant = transcript.participantIds.includes(callerId);

  let isGuildManager = false;
  if (!isOpener && !isParticipant) {
    const server = await repos.servers.getByGuildId(transcript.guildId);
    if (server) {
      const config = useRuntimeConfig();
      const botAdminIds = (config.public.botAdminIds || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      isGuildManager =
        botAdminIds.includes(callerId) ||
        server.owner_id === callerId ||
        server.admin_user_ids.includes(callerId);
    }
  }

  if (!(isOpener || isParticipant || isGuildManager)) {
    throw createError({ statusCode: 404, statusMessage: "Not found." });
  }

  // Sign R2 URLs for mirrored attachments.
  const r2 = getR2();
  const signedByKey: Record<string, string> = {};
  if (r2) {
    const keys = new Set<string>();
    for (const m of messages) {
      const atts = Array.isArray(m.attachments)
        ? (m.attachments as Array<{ r2_key?: string }>)
        : [];
      for (const a of atts) {
        if (a && typeof a.r2_key === "string") keys.add(a.r2_key);
      }
    }
    await Promise.all(
      Array.from(keys).map(async (key) => {
        signedByKey[key] = await getSignedUrl(
          r2.client,
          new GetObjectCommand({ Bucket: r2.bucket, Key: key }),
          { expiresIn: SIGNED_URL_TTL_SECONDS },
        );
      }),
    );
  }

  return {
    transcript: {
      id: transcript.id,
      guild_id: transcript.guildId,
      ticket_id: transcript.ticketId,
      thread_name: transcript.threadName,
      opener_id: transcript.openerId,
      claimed_by_id: transcript.claimedById,
      closed_by_id: transcript.closedById,
      type_id: transcript.typeId,
      priority: transcript.priority,
      opened_at: transcript.openedAt.toISOString(),
      closed_at: transcript.closedAt.toISOString(),
      expires_at: transcript.expiresAt?.toISOString() ?? null,
      message_count: transcript.messageCount,
      has_skipped_attachments: transcript.hasSkippedAttachments,
      mentions: transcript.mentions,
    },
    messages: messages.map((m) => ({
      id: m.id,
      discord_message_id: m.discordMessageId,
      author_id: m.authorId,
      author_tag: m.authorTag,
      author_avatar_url: m.authorAvatarUrl,
      author_is_bot: m.authorIsBot,
      content: m.content,
      embeds: m.embeds,
      attachments: m.attachments,
      created_at: m.createdAt.toISOString(),
    })),
    signed_urls: signedByKey,
  };
});
