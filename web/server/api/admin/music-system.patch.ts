/**
 * PATCH /api/admin/music-system
 *
 * Admin-only. Manually toggles the fleet-wide music playback switch — the
 * only way to re-enable it after the Lavalink health check auto-disables
 * it. Disabling requires a reason; enabling does not. Every change is
 * persisted to the audit trail (see server/utils/admin-audit).
 *
 * Body: { enabled: boolean, reason?: string }
 */
import type { H3Event } from "h3";
import { SystemFlagsRepository } from "@modus/db";
import { getRepos } from "../../utils/db";
import { CHANNEL_MUSIC_HEALTH, publish } from "../../utils/eventbus";
import { createEnabledToggleRouteHandler } from "../../utils/admin-audit/admin-mutations";

const handler = createEnabledToggleRouteHandler<H3Event>({
  resource: "music",
  action: "music.updated",
  getTargetId: () => "music",
  parseBody: (event) => readBody(event),
  getRepository: () => {
    const repos = getRepos();
    if (!repos) return null;
    return {
      getEnabled: async () => (await repos.systemFlags.getFlag("music"))?.enabled ?? false,
      setEnabled: (tx, enabled, reason) =>
        new SystemFlagsRepository(tx).setFlag("music", enabled, reason ?? "manual"),
    };
  },
  onCommitted: async () => {
    // Notify the running bot fleet so every shard's cached flag refreshes
    // immediately instead of waiting out the 60s TTL. No-op when Redis is
    // unconfigured.
    await publish(CHANNEL_MUSIC_HEALTH, { kind: "changed" });
  },
  createHttpError: (statusCode, statusMessage) => createError({
    statusCode,
    statusMessage,
  }),
  logError: (error) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(`[Music System API] setFlag(music) failed (${errorName}).`);
  },
});

export default defineEventHandler(handler);
