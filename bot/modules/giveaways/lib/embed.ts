/**
 * Pure embed/component JSON builders — no discord.js Client dependency, so
 * they're testable and reusable as-is by both the bot module and (as a
 * locally-duplicated copy, per this repo's convention) the web dashboard's
 * Nitro routes.
 */
import { ButtonStyle, ComponentType } from "discord.js";
import type { APIActionRowComponent, APIButtonComponent, APIEmbed } from "discord.js";

export type PrizeKind = "key" | "gift" | "physical" | "other";
export type GiveawayStatus = "active" | "ended" | "cancelled";

export interface GiveawayRequirementsInput {
  requiredRoleIds: string[];
  blockedRoleIds: string[];
  minAccountAgeDays?: number;
  minServerAgeDays?: number;
}

export interface GiveawayEmbedInput {
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
}

const PRIZE_KIND_LABEL: Record<PrizeKind, string> = {
  key: "🔑 Key / Code",
  gift: "🎁 Gift",
  physical: "📦 Physical Item",
  other: "🏆 Prize",
};

export function buildRequirementsLines(requirements: GiveawayRequirementsInput): string[] {
  const lines: string[] = [];
  if (requirements.requiredRoleIds.length > 0) {
    lines.push(
      `Requires role: ${requirements.requiredRoleIds.map((id) => `<@&${id}>`).join(", ")}`,
    );
  }
  if (requirements.blockedRoleIds.length > 0) {
    lines.push(
      `Blocked role: ${requirements.blockedRoleIds.map((id) => `<@&${id}>`).join(", ")}`,
    );
  }
  if (requirements.minAccountAgeDays) {
    lines.push(`Account age ≥ ${requirements.minAccountAgeDays} day(s)`);
  }
  if (requirements.minServerAgeDays) {
    lines.push(`Server membership ≥ ${requirements.minServerAgeDays} day(s)`);
  }
  return lines;
}

export function buildGiveawayEmbed(input: GiveawayEmbedInput): APIEmbed {
  const fields: NonNullable<APIEmbed["fields"]> = [
    { name: "Prize", value: PRIZE_KIND_LABEL[input.prizeKind], inline: true },
    { name: "Winners", value: String(input.winnerCount), inline: true },
    { name: "Entrants", value: String(input.entrantCount), inline: true },
  ];

  fields.push({
    name: "Value",
    value:
      input.prizeKind === "key"
        ? "🔒 Revealed via DM to the winner(s) when the giveaway ends."
        : input.prizeValue,
    inline: false,
  });

  const reqLines = buildRequirementsLines(input.requirements);
  if (reqLines.length > 0) {
    fields.push({ name: "Requirements", value: reqLines.join("\n"), inline: false });
  }

  if (input.status === "active") {
    fields.push({
      name: "Ends",
      value: `<t:${Math.floor(input.endsAt.getTime() / 1000)}:R>`,
      inline: false,
    });
  } else if (input.status === "ended") {
    fields.push({
      name: "Winner(s)",
      value:
        input.winnerIds && input.winnerIds.length > 0
          ? input.winnerIds.map((id) => `<@${id}>`).join(", ")
          : "No valid entrants.",
      inline: false,
    });
  } else {
    fields.push({ name: "Status", value: "Cancelled.", inline: false });
  }

  return {
    title: `🎉 ${input.title}`,
    description: input.description ?? undefined,
    color: input.status === "active" ? 0x57f287 : input.status === "ended" ? 0xfee75c : 0xed4245,
    image: input.imageUrl ? { url: input.imageUrl } : undefined,
    fields,
  };
}

export function buildGiveawayComponents(
  id: string,
  status: GiveawayStatus,
): APIActionRowComponent<APIButtonComponent>[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          custom_id: `giveaways:enter:${id}`,
          label: "🎉 Enter Giveaway",
          style: ButtonStyle.Primary,
          disabled: status !== "active",
        },
      ],
    },
  ];
}
