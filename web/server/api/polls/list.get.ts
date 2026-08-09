/**
 * List currently-running polls for a guild, enriched with live vote tallies
 * fetched straight from Discord (tallies are never persisted — see
 * packages/db/src/schema.ts's `polls` table comment).
 *
 * Requires guild-manager access, matching every sibling route in this
 * feature (`requireAuthedUserId` alone only proves a session exists, not
 * that the caller has any relationship to `guild_id`).
 */
import { getRepos } from "../../utils/db";
import { requireGuildManager } from "../../utils/session";

interface DiscordPollAnswerCount {
  id: number;
  count: number;
}

// Cap concurrent per-poll Discord fetches so a guild with many running
// polls can't burst the bot's shared REST rate-limit budget on every page
// load / manual refresh.
const FETCH_BATCH_SIZE = 8;

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

  await requireGuildManager(event, guildId);

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  const botToken = config.discordBotToken as string;
  if (!botToken) {
    throw createError({
      statusCode: 500,
      statusMessage: "Bot token not configured on server.",
    });
  }

  let rows: Awaited<ReturnType<typeof repos.polls.listActiveByGuild>>;
  try {
    rows = await repos.polls.listActiveByGuild(guildId);
  } catch (error: any) {
    console.error(
      `[Poll List API] Failed to fetch polls for ${guildId}:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch polls.",
    });
  }

  const fetchOne = async (row: (typeof rows)[number]) => {
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
  };

  // Process in small sequential batches rather than one giant Promise.all
  // fan-out — bounds concurrent Discord REST calls without pulling in a
  // generic concurrency-limiter utility this codebase doesn't otherwise have.
  const results: Array<Awaited<ReturnType<typeof fetchOne>>> = [];
  for (let i = 0; i < rows.length; i += FETCH_BATCH_SIZE) {
    const batch = rows.slice(i, i + FETCH_BATCH_SIZE);
    results.push(...(await Promise.all(batch.map(fetchOne))));
  }

  return { polls: results.filter((p): p is NonNullable<typeof p> => p !== null) };
});
