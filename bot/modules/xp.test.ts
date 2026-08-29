import { describe, expect, it } from "vitest";
import { ButtonStyle } from "discord.js";
import { buildXpShareRow } from "./xp";

describe("buildXpShareRow", () => {
  it("includes a share action scoped to the requested member", () => {
    const row = buildXpShareRow("guild-1", "member-42", "rank");
    const shareButton = row.components.find(
      (component) => component.data.custom_id === "xp:share-rank:guild-1:member-42",
    );

    expect(shareButton?.data.label).toBe("Share");
    expect(shareButton?.data.style).toBe(ButtonStyle.Secondary);
  });
});
