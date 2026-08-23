/**
 * PUT /api/global-config/ai
 *
 * Admin-only. Writes the sentinel `guild_configs` row for global AI
 * defaults. Body is the full settings object; an empty object effectively
 * clears the override. Provider changes require a reason; model-only
 * changes do not. Every change is persisted to the audit trail (see
 * server/utils/admin-audit) with the API key itself never recorded.
 */
import { GuildConfigRepository } from "@modus/db";
import type { H3Event } from "h3";
import { getRepos } from "../../utils/db";
import {
  createAiConfigRouteHandler,
  type AiConfigRepository,
  type GlobalAiConfig,
} from "../../utils/admin-audit/admin-mutations";

const handler = createAiConfigRouteHandler<H3Event>({
  parseBody: (event) => readBody(event),
  getRepository: (): AiConfigRepository | null => {
    const repos = getRepos();
    if (!repos) return null;
    return {
      getConfig: async () =>
        (await repos.guildConfigs.getGlobalAIConfig()) as GlobalAiConfig | null,
      setConfig: (tx, config) =>
        new GuildConfigRepository(tx).setGlobalAIConfig(config),
    };
  },
  createHttpError: (statusCode, statusMessage) => createError({
    statusCode,
    statusMessage,
  }),
  logError: (error) => {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(`[Global AI Config] write failed (${errorName}).`);
  },
});

export default defineEventHandler(handler);
