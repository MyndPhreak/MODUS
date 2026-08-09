/**
 * List currently-running polls for a guild, enriched with live vote tallies
 * fetched straight from Discord (tallies are never persisted — see
 * packages/db/src/schema.ts's `polls` table comment).
 *
 * Open to any authenticated guild member, matching how `/poll results` is
 * open to all members in the bot today (unlike create/end, which require
 * Manage Messages).
 */
import { getRepos } from "../../utils/db";
import { requireAuthedUserId } from "../../utils/session";

interface DiscordPollAnswerCount {
  id: number;
  count: number;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);
  const guildId = query.guild_id as string;

  if (!guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id query parameter.",
    });
  }

  await requireAuthedUserId(event);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  const botToken = config.discordBotToken as string;
  const rows = await repos.polls.listActiveByGuild(guildId);

  const results = await Promise.all(
    rows.map(async (row) => {
      try {
        const message = (await $fetch(
          `https://discord.com/api/v10/channels/${row.channelId}/messages/${row.messageId}`,
          { headers: { Authorization: `Bot ${botToken}` } },
        )) as { poll?: { answer_counts?: DiscordPollAnswerCount[] } };

        const counts = message.poll?.answer_counts ?? [];
        const byAnswerId = new Map(counts.map((c) => [c.id, c.count]));
        const options = row.options.map((text, i) => ({
          text,
          votes: byAnswerId.get(i + 1) ?? 0,
        }));
        const totalVotes = options.reduce((sum, o) => sum + o.votes, 0);

        return {
          id: row.id,
          channelId: row.channelId,
          messageId: row.messageId,
          question: row.question,
          options,
          totalVotes,
          expiresAt: row.expiresAt,
          source: row.source,
          createdBy: row.createdBy,
        };
      } catch {
        // Message was likely deleted in Discord — drop it from the list
        // rather than surfacing a per-row error. Best-effort cleanup; no DB
        // mutation here (see spec's error-handling section).
        return null;
      }
    }),
  );

  return { polls: results.filter((p): p is NonNullable<typeof p> => p !== null) };
});
