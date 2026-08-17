import { describe, expect, it, vi } from "vitest";
import type { Client } from "discord.js";
import { dmWinners } from "./drawAndAnnounce";

/**
 * Builds a stub Client whose users.fetch returns a user with a recorded send().
 * `failFor` lets a specific winner's DM reject, mimicking closed DMs.
 */
function makeClient(failFor: string[] = []) {
  const sent: Array<{ userId: string; content: string }> = [];
  const client = {
    users: {
      fetch: vi.fn(async (id: string) => ({
        send: vi.fn(async (content: string) => {
          if (failFor.includes(id)) throw new Error("Cannot send messages to this user");
          sent.push({ userId: id, content });
        }),
      })),
    },
  } as unknown as Client;
  return { client, sent };
}

describe("dmWinners", () => {
  it("reveals a key prize's code in the DM", async () => {
    const { client, sent } = makeClient();
    await dmWinners(
      client,
      { title: "Steam Key", prizeKind: "key", prizeValue: "ABCD-EFGH" },
      ["u1"],
      "My Server",
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]!.userId).toBe("u1");
    expect(sent[0]!.content).toContain("Your code: `ABCD-EFGH`");
    expect(sent[0]!.content).toContain("**Steam Key**");
    expect(sent[0]!.content).toContain("My Server");
  });

  it("uses the plain prize line for non-key kinds", async () => {
    const { client, sent } = makeClient();
    await dmWinners(
      client,
      { title: "Mug", prizeKind: "physical", prizeValue: "A branded mug" },
      ["u1"],
      "My Server",
    );
    expect(sent[0]!.content).toContain("Prize: A branded mug");
    expect(sent[0]!.content).not.toContain("Your code");
  });

  it("keeps DMing the remaining winners when one winner's DM fails", async () => {
    const { client, sent } = makeClient(["u2"]);
    await dmWinners(
      client,
      { title: "Key", prizeKind: "key", prizeValue: "CODE" },
      ["u1", "u2", "u3"],
      "My Server",
    );
    expect(sent.map((s) => s.userId)).toEqual(["u1", "u3"]);
  });

  it("is a no-op for an empty winner list", async () => {
    const { client, sent } = makeClient();
    await dmWinners(client, { title: "T", prizeKind: "gift", prizeValue: "V" }, [], "My Server");
    expect(sent).toHaveLength(0);
  });
});
