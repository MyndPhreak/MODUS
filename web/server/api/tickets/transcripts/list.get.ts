/**
 * GET /api/tickets/transcripts/list?guild_id=...
 *
 * Returns the 25 most-recent transcripts for a guild. Guild-admin only.
 */
import { requireGuildManager } from "../../../utils/session";
import { getRepos } from "../../../utils/db";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const guildId = typeof query.guild_id === "string" ? query.guild_id : "";
  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "guild_id is required.",
    });
  }

  await requireGuildManager(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable.",
    });
  }

  const rows = await repos.transcripts.listByGuild(guildId, 25);
  return {
    items: rows.map((r) => ({
      id: r.id,
      ticket_id: r.ticketId,
      thread_name: r.threadName,
      opener_id: r.openerId,
      closed_at: r.closedAt.toISOString(),
      expires_at: r.expiresAt?.toISOString() ?? null,
      message_count: r.messageCount,
    })),
  };
});
