/**
 * List giveaways for a guild, most recent first, with live entrant counts.
 */
import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";
import { fetchGuildMemberIdentities } from "../../utils/discord";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const guildId = query.guild_id as string;

  if (!guildId) {
    throw createError({ statusCode: 400, statusMessage: "Missing guild_id query parameter." });
  }

  await requireModuleAccess(event, guildId, "giveaways");

  const repos = getRepos();
  if (!repos) {
    throw createError({ statusCode: 503, statusMessage: "Database unavailable (NUXT_DATABASE_URL not set)." });
  }

  const rows = await repos.giveaways.listByGuild(guildId);
  const giveawayRows = await Promise.all(
    rows.map(async (row) => {
      const entrantIds = await repos.giveawayEntries.listEntrantIds(row.id);
      return {
      id: row.id,
      channelId: row.channelId,
      messageId: row.messageId,
      title: row.title,
      description: row.description,
      prizeKind: row.prizeKind,
      prizeValue: row.prizeKind === "key" ? null : row.prizeValue,
      imageUrl: row.imageUrl,
      winnerCount: row.winnerCount,
      entrantIds,
      entrantCount: await repos.giveawayEntries.countEntries(row.id),
      endsAt: row.endsAt,
      status: row.status,
      winnerIds: row.winnerIds,
      requirements: row.requirements,
      source: row.source,
      createdAt: row.createdAt,
      };
    }),
  );

  const identities = await fetchGuildMemberIdentities(
    guildId,
    giveawayRows.flatMap((giveaway) => [...giveaway.entrantIds, ...giveaway.winnerIds]),
  );
  const resolveMembers = (ids: string[]) => ids.map((id) => identities.get(id) ?? {
    id,
    displayName: id,
    username: null,
  });
  const giveaways = giveawayRows.map(({ entrantIds, winnerIds, ...giveaway }) => ({
    ...giveaway,
    entrants: resolveMembers(entrantIds),
    winners: resolveMembers(winnerIds),
  }));

  return { giveaways };
});
