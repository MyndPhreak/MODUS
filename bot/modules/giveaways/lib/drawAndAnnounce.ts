import type { Client, TextChannel } from "discord.js";
import type { DatabaseService } from "../../../DatabaseService";
import type { Logger } from "../../../Logger";
import { drawWinners } from "./draw";
import { buildGiveawayComponents, buildGiveawayEmbed } from "./embed";
import type { PrizeKind } from "./embed";

/** Minimal shape `dmWinners` needs — satisfied by a `giveaways.getById` row. */
interface DmGiveaway {
  title: string;
  prizeKind: string;
  prizeValue: string;
}

/**
 * DMs each winner their prize details. A "key"-kind prizeValue is only ever
 * revealed here — never in the public embed or announcement. Each send is
 * individually try/caught so one winner with closed DMs doesn't block the rest.
 * Shared by the initial draw (`drawAndAnnounce`) and `/giveaway reroll`.
 */
export async function dmWinners(
  client: Client,
  giveaway: DmGiveaway,
  winnerIds: string[],
  guildName: string,
): Promise<void> {
  for (const winnerId of winnerIds) {
    try {
      const user = await client.users.fetch(winnerId);
      const prizeLine =
        giveaway.prizeKind === "key"
          ? `Your code: \`${giveaway.prizeValue}\``
          : `Prize: ${giveaway.prizeValue}`;
      await user.send(`🎉 You won **${giveaway.title}** in ${guildName}!\n${prizeLine}`);
    } catch {
      // DMs closed — the winner still sees the in-channel announcement.
    }
  }
}

/**
 * Draws winners for `giveawayId`, marks it ended, edits the live message,
 * announces in-channel, and DMs each winner the prize details (this is
 * where a "key"-kind prizeValue is revealed — never shown publicly).
 * Shared by /giveaway end, and GiveawayDrawWorker's sweep (Task 11).
 */
export async function drawAndAnnounce(
  client: Client,
  db: DatabaseService,
  logger: Logger,
  giveawayId: string,
  options: { excludeUserIds?: string[] } = {},
): Promise<{ winnerIds: string[] } | { error: string }> {
  const giveaway = await db.giveaways.getById(giveawayId);
  if (!giveaway) return { error: "Giveaway not found." };
  if (giveaway.status !== "active") {
    return { error: "Giveaway has already ended or been cancelled." };
  }

  const allEntrants = await db.giveawayEntries.listEntrantIds(giveawayId);
  const pool = options.excludeUserIds
    ? allEntrants.filter((id) => !options.excludeUserIds!.includes(id))
    : allEntrants;
  const winnerIds = drawWinners(pool, giveaway.winnerCount);

  await db.giveaways.setEnded(giveawayId, winnerIds);

  const embed = buildGiveawayEmbed({
    id: giveaway.id,
    title: giveaway.title,
    description: giveaway.description,
    prizeKind: giveaway.prizeKind as PrizeKind,
    prizeValue: giveaway.prizeValue,
    imageUrl: giveaway.imageUrl,
    winnerCount: giveaway.winnerCount,
    entrantCount: allEntrants.length,
    endsAt: giveaway.endsAt,
    status: "ended",
    winnerIds,
    requirements: giveaway.requirements,
  });
  const components = buildGiveawayComponents(giveaway.id, "ended");

  try {
    const channel = (await client.channels.fetch(giveaway.channelId)) as TextChannel | null;
    if (channel) {
      const message = await channel.messages.fetch(giveaway.messageId);
      await message.edit({ embeds: [embed], components: components as any });

      await channel.send(
        winnerIds.length > 0
          ? `🎉 Congratulations ${winnerIds.map((id) => `<@${id}>`).join(", ")}! You won **${giveaway.title}**.`
          : `😔 **${giveaway.title}** ended with no eligible entrants.`,
      );

      await dmWinners(client, giveaway, winnerIds, channel.guild.name);
    } else {
      logger.warn(
        `Giveaway ${giveaway.id} ended but its channel (${giveaway.channelId}) could not be resolved — winners were not announced or DMed.`,
        giveaway.guildId,
        "giveaways",
      );
    }
  } catch (err) {
    logger.error("Failed to announce giveaway result", giveaway.guildId, err, "giveaways");
  }

  return { winnerIds };
}
