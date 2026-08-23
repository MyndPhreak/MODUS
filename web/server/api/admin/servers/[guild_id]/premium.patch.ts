/**
 * PATCH /api/admin/servers/:guild_id/premium
 *
 * Admin-only. Toggles the `premium` flag on a server. This is the only
 * `servers` column the admin dashboard mutates today, so a scoped
 * endpoint is clearer than a generic PATCH. Every transition — granting
 * or revoking — requires a reason and is persisted to the audit trail
 * (see server/utils/admin-audit).
 *
 * Body: { premium: boolean, reason: string }
 */
import { ServerRepository } from "@modus/db";
import type { H3Event } from "h3";
import { getRepos } from "../../../../utils/db";
import { createEnabledToggleRouteHandler } from "../../../../utils/admin-audit/admin-mutations";

const handler = createEnabledToggleRouteHandler<H3Event>({
  resource: "premium",
  action: "premium.updated",
  stateKey: "premium",
  getTargetId: (event) => getRouterParam(event, "guild_id") ?? "",
  parseBody: (event) => readBody(event),
  getRepository: (event) => {
    const repos = getRepos();
    if (!repos) return null;
    const guildId = getRouterParam(event, "guild_id")!;
    return {
      getEnabled: () => repos.servers.isPremium(guildId),
      setEnabled: (tx, premium) => new ServerRepository(tx).setPremium(guildId, premium),
    };
  },
  createHttpError: (statusCode, statusMessage) => createError({
    statusCode,
    statusMessage,
  }),
  logError: (error) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(`[Admin Servers API] setPremium failed (${errorName}).`);
  },
});

export default defineEventHandler(handler);
