import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { getChannelLockOverwrites } from "./channelLock";

describe("getChannelLockOverwrites", () => {
  it("denies everyone and allows every moderation-exempt role to chat", () => {
    expect(getChannelLockOverwrites(["role-a", "role-b"])).toEqual([
      { id: "@everyone", allow: [], deny: [PermissionFlagsBits.SendMessages] },
      { id: "role-a", allow: [PermissionFlagsBits.SendMessages], deny: [] },
      { id: "role-b", allow: [PermissionFlagsBits.SendMessages], deny: [] },
    ]);
  });
});
