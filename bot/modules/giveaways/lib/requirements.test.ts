import { describe, expect, it } from "vitest";
import { checkRequirements, describeRequirementFailure } from "./requirements";

const NOW = new Date("2026-08-16T00:00:00.000Z");
const baseEntrant = {
  roleIds: [] as string[],
  accountCreatedAt: new Date("2020-01-01T00:00:00.000Z"),
  serverJoinedAt: new Date("2025-01-01T00:00:00.000Z"),
};
const noRequirements = { requiredRoleIds: [], blockedRoleIds: [] };

describe("checkRequirements", () => {
  it("passes when there are no requirements", () => {
    expect(checkRequirements(noRequirements, baseEntrant, NOW)).toBeNull();
  });

  it("fails when a required role is missing", () => {
    const requirements = { requiredRoleIds: ["role1"], blockedRoleIds: [] };
    expect(checkRequirements(requirements, baseEntrant, NOW)).toBe("missing_required_role");
  });

  it("passes when the entrant has one of several required roles", () => {
    const requirements = { requiredRoleIds: ["role1", "role2"], blockedRoleIds: [] };
    const entrant = { ...baseEntrant, roleIds: ["role2"] };
    expect(checkRequirements(requirements, entrant, NOW)).toBeNull();
  });

  it("fails when the entrant has a blocked role", () => {
    const requirements = { requiredRoleIds: [], blockedRoleIds: ["banned"] };
    const entrant = { ...baseEntrant, roleIds: ["banned"] };
    expect(checkRequirements(requirements, entrant, NOW)).toBe("has_blocked_role");
  });

  it("fails when the account is younger than the minimum age", () => {
    const requirements = { ...noRequirements, minAccountAgeDays: 30 };
    const entrant = { ...baseEntrant, accountCreatedAt: new Date("2026-08-15T00:00:00.000Z") };
    expect(checkRequirements(requirements, entrant, NOW)).toBe("account_too_new");
  });

  it("passes when the account meets the minimum age exactly at the boundary", () => {
    const requirements = { ...noRequirements, minAccountAgeDays: 30 };
    const entrant = { ...baseEntrant, accountCreatedAt: new Date("2026-07-17T00:00:00.000Z") };
    expect(checkRequirements(requirements, entrant, NOW)).toBeNull();
  });

  it("fails when serverJoinedAt is null and a min server age is set", () => {
    const requirements = { ...noRequirements, minServerAgeDays: 7 };
    const entrant = { ...baseEntrant, serverJoinedAt: null };
    expect(checkRequirements(requirements, entrant, NOW)).toBe("server_join_too_recent");
  });

  it("fails when server membership is younger than the minimum age", () => {
    const requirements = { ...noRequirements, minServerAgeDays: 7 };
    const entrant = { ...baseEntrant, serverJoinedAt: new Date("2026-08-14T00:00:00.000Z") };
    expect(checkRequirements(requirements, entrant, NOW)).toBe("server_join_too_recent");
  });

  it("checks required role before blocked role before age checks (first failure wins)", () => {
    const requirements = {
      requiredRoleIds: ["role1"],
      blockedRoleIds: ["banned"],
      minAccountAgeDays: 9999,
    };
    const entrant = { ...baseEntrant, roleIds: [] };
    expect(checkRequirements(requirements, entrant, NOW)).toBe("missing_required_role");
  });
});

describe("describeRequirementFailure", () => {
  it("returns a distinct, human-readable message for every reason", () => {
    const reasons = [
      "missing_required_role",
      "has_blocked_role",
      "account_too_new",
      "server_join_too_recent",
    ] as const;
    const messages = reasons.map(describeRequirementFailure);
    expect(new Set(messages).size).toBe(reasons.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
