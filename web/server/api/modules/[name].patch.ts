/**
 * PATCH /api/modules/:name
 *
 * Admin-only. Toggles a module's global `enabled` flag. This is the
 * fleet-wide kill switch — per-guild enabling lives in guild_configs.
 * Disabling a module requires a reason; enabling one does not. Every change
 * is persisted to the audit trail (see server/utils/admin-audit).
 *
 * Body: { enabled: boolean, reason?: string }
 */
import type { H3Event } from "h3";
import { ModuleRepository } from "@modus/db";
import { getRepos } from "../../utils/db";
import { CHANNEL_MODULES, publish } from "../../utils/eventbus";
import { createEnabledToggleRouteHandler } from "../../utils/admin-audit/admin-mutations";

const handler = createEnabledToggleRouteHandler<H3Event>({
  resource: "module",
  action: "module.updated",
  getTargetId: (event) => getRouterParam(event, "name") ?? "",
  parseBody: (event) => readBody(event),
  getRepository: (event) => {
    const repos = getRepos();
    if (!repos) return null;
    const name = getRouterParam(event, "name")!;
    return {
      getEnabled: async () => (await repos.modules.getByName(name))?.enabled ?? false,
      setEnabled: (tx, enabled) => new ModuleRepository(tx).setEnabled(name, enabled),
    };
  },
  onCommitted: async () => {
    // Notify the running bot fleet so every shard re-reads the modules table
    // and refreshes its in-memory enabled set. Without this the toggle only
    // takes effect on the next bot restart. No-op when Redis is unconfigured.
    await publish(CHANNEL_MODULES, { kind: "changed" });
  },
  createHttpError: (statusCode, statusMessage) => createError({
    statusCode,
    statusMessage,
  }),
  logError: (error) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(`[Modules API] setEnabled failed (${errorName}).`);
  },
});

export default defineEventHandler(handler);
