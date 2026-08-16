import { describe, expect, it } from "vitest";
import { buildGiveawayComponents, buildGiveawayEmbed, buildRequirementsLines } from "./embed";

const baseInput = {
  id: "gw1",
  title: "Steam Key Giveaway",
  description: "Test description",
  prizeKind: "key" as const,
  prizeValue: "SECRET-CODE-123",
  winnerCount: 1,
  entrantCount: 5,
  endsAt: new Date("2026-08-20T00:00:00.000Z"),
  status: "active" as const,
  requirements: { requiredRoleIds: [], blockedRoleIds: [] },
};

describe("buildRequirementsLines", () => {
  it("returns an empty array when there are no requirements", () => {
    expect(buildRequirementsLines({ requiredRoleIds: [], blockedRoleIds: [] })).toEqual([]);
  });

  it("includes a line per configured requirement", () => {
    const lines = buildRequirementsLines({
      requiredRoleIds: ["r1"],
      blockedRoleIds: ["r2"],
      minAccountAgeDays: 30,
      minServerAgeDays: 7,
    });
    expect(lines).toHaveLength(4);
  });
});

describe("buildGiveawayEmbed", () => {
  it("hides the prize value for kind = key", () => {
    const embed = buildGiveawayEmbed(baseInput);
    const valueField = embed.fields?.find((f) => f.name === "Value");
    expect(valueField?.value).not.toContain("SECRET-CODE-123");
  });

  it("shows the prize value for kind = gift", () => {
    const embed = buildGiveawayEmbed({ ...baseInput, prizeKind: "gift", prizeValue: "A cool mug" });
    const valueField = embed.fields?.find((f) => f.name === "Value");
    expect(valueField?.value).toBe("A cool mug");
  });

  it("shows an Ends field when active", () => {
    const embed = buildGiveawayEmbed(baseInput);
    expect(embed.fields?.some((f) => f.name === "Ends")).toBe(true);
  });

  it("shows winners when ended", () => {
    const embed = buildGiveawayEmbed({
      ...baseInput,
      status: "ended",
      winnerIds: ["user1", "user2"],
    });
    const winnerField = embed.fields?.find((f) => f.name === "Winner(s)");
    expect(winnerField?.value).toContain("user1");
    expect(winnerField?.value).toContain("user2");
  });

  it("shows a cancelled status when cancelled", () => {
    const embed = buildGiveawayEmbed({ ...baseInput, status: "cancelled" });
    expect(embed.fields?.some((f) => f.name === "Status" && f.value === "Cancelled.")).toBe(true);
  });
});

describe("buildGiveawayComponents", () => {
  it("enables the Enter button when active", () => {
    const [row] = buildGiveawayComponents("gw1", "active");
    const button = row.components[0] as { disabled?: boolean; custom_id: string };
    expect(button.disabled).toBe(false);
    expect(button.custom_id).toBe("giveaway:enter:gw1");
  });

  it("disables the Enter button when ended or cancelled", () => {
    const [endedRow] = buildGiveawayComponents("gw1", "ended");
    const [cancelledRow] = buildGiveawayComponents("gw1", "cancelled");
    expect((endedRow.components[0] as { disabled?: boolean }).disabled).toBe(true);
    expect((cancelledRow.components[0] as { disabled?: boolean }).disabled).toBe(true);
  });
});
