/**
 * Pure entry-requirement checking — no Discord types, so it's testable
 * without a live interaction. Callers (handlers/enter.ts) translate a
 * GuildMember/User into EntrantInfo before calling this.
 */

export interface GiveawayRequirements {
  requiredRoleIds: string[];
  blockedRoleIds: string[];
  minAccountAgeDays?: number;
  minServerAgeDays?: number;
}

export interface EntrantInfo {
  roleIds: string[];
  accountCreatedAt: Date;
  /** Null when the member's join date isn't cached (rare — Discord always sets it). */
  serverJoinedAt: Date | null;
}

export type RequirementFailureReason =
  | "missing_required_role"
  | "has_blocked_role"
  | "account_too_new"
  | "server_join_too_recent";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function checkRequirements(
  requirements: GiveawayRequirements,
  entrant: EntrantInfo,
  now: Date = new Date(),
): RequirementFailureReason | null {
  if (
    requirements.requiredRoleIds.length > 0 &&
    !requirements.requiredRoleIds.some((id) => entrant.roleIds.includes(id))
  ) {
    return "missing_required_role";
  }

  if (requirements.blockedRoleIds.some((id) => entrant.roleIds.includes(id))) {
    return "has_blocked_role";
  }

  if (requirements.minAccountAgeDays) {
    const ageDays = (now.getTime() - entrant.accountCreatedAt.getTime()) / MS_PER_DAY;
    if (ageDays < requirements.minAccountAgeDays) return "account_too_new";
  }

  if (requirements.minServerAgeDays) {
    if (!entrant.serverJoinedAt) return "server_join_too_recent";
    const ageDays = (now.getTime() - entrant.serverJoinedAt.getTime()) / MS_PER_DAY;
    if (ageDays < requirements.minServerAgeDays) return "server_join_too_recent";
  }

  return null;
}

export function describeRequirementFailure(reason: RequirementFailureReason): string {
  switch (reason) {
    case "missing_required_role":
      return "You don't have a role required to enter this giveaway.";
    case "has_blocked_role":
      return "You have a role that's blocked from entering this giveaway.";
    case "account_too_new":
      return "Your Discord account doesn't meet the minimum age requirement for this giveaway.";
    case "server_join_too_recent":
      return "You haven't been a member of this server long enough to enter this giveaway.";
  }
}
