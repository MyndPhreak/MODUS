/**
 * Local copy of bot/modules/giveaways/lib/embed.ts's JSON-building logic.
 * Duplicated rather than shared — web/ cannot import from bot/, and this
 * repo's convention (see web/server/api/polls/send.post.ts's
 * flattenDiscordErrors comment) is local helpers per feature, not a shared
 * abstraction across the two packages.
 */
export type PrizeKind = "key" | "gift" | "physical" | "other";
export type GiveawayStatus = "active" | "ended" | "cancelled";

const PRIZE_KIND_LABEL: Record<PrizeKind, string> = {
  key: "🔑 Key / Code",
  gift: "🎁 Gift",
  physical: "📦 Physical Item",
  other: "🏆 Prize",
};

export interface GiveawayRequirementsInput {
  requiredRoleIds: string[];
  blockedRoleIds: string[];
  minAccountAgeDays?: number;
  minServerAgeDays?: number;
}

export function buildRequirementsLines(requirements: GiveawayRequirementsInput): string[] {
  const lines: string[] = [];
  if (requirements.requiredRoleIds.length > 0) {
    lines.push(`Requires role: ${requirements.requiredRoleIds.map((id) => `<@&${id}>`).join(", ")}`);
  }
  if (requirements.blockedRoleIds.length > 0) {
    lines.push(`Blocked role: ${requirements.blockedRoleIds.map((id) => `<@&${id}>`).join(", ")}`);
  }
  if (requirements.minAccountAgeDays) {
    lines.push(`Account age ≥ ${requirements.minAccountAgeDays} day(s)`);
  }
  if (requirements.minServerAgeDays) {
    lines.push(`Server membership ≥ ${requirements.minServerAgeDays} day(s)`);
  }
  return lines;
}

export function buildGiveawayEmbedJson(input: {
  id: string;
  title: string;
  description?: string | null;
  prizeKind: PrizeKind;
  prizeValue: string;
  imageUrl?: string | null;
  winnerCount: number;
  entrantCount: number;
  endsAt: Date;
  status: GiveawayStatus;
  winnerIds?: string[];
  requirements: GiveawayRequirementsInput;
}) {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Prize", value: PRIZE_KIND_LABEL[input.prizeKind], inline: true },
    { name: "Winners", value: String(input.winnerCount), inline: true },
    { name: "Entrants", value: String(input.entrantCount), inline: true },
    {
      name: "Value",
      value:
        input.prizeKind === "key"
          ? "🔒 Revealed via DM to the winner(s) when the giveaway ends."
          : input.prizeValue,
    },
  ];

  const reqLines = buildRequirementsLines(input.requirements);
  if (reqLines.length > 0) {
    fields.push({ name: "Requirements", value: reqLines.join("\n") });
  }

  if (input.status === "active") {
    fields.push({ name: "Ends", value: `<t:${Math.floor(input.endsAt.getTime() / 1000)}:R>` });
  } else if (input.status === "ended") {
    fields.push({
      name: "Winner(s)",
      value:
        input.winnerIds && input.winnerIds.length > 0
          ? input.winnerIds.map((id) => `<@${id}>`).join(", ")
          : "No valid entrants.",
    });
  } else {
    fields.push({ name: "Status", value: "Cancelled." });
  }

  return {
    title: `🎉 ${input.title}`,
    description: input.description ?? undefined,
    color: input.status === "active" ? 0x57f287 : input.status === "ended" ? 0xfee75c : 0xed4245,
    image: input.imageUrl ? { url: input.imageUrl } : undefined,
    fields,
  };
}

export function buildGiveawayComponentsJson(id: string, status: GiveawayStatus) {
  return [
    {
      type: 1, // ActionRow
      components: [
        {
          type: 2, // Button
          custom_id: `giveaways:enter:${id}`,
          label: "🎉 Enter Giveaway",
          style: 1, // Primary
          disabled: status !== "active",
        },
      ],
    },
  ];
}
