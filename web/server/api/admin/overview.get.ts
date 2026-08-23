import { getRepos } from '../../utils/db'
import { isRealtimeAvailable, pingRedis } from '../../utils/eventbus'
import { getR2 } from '../../utils/r2'
import { requireBotAdmin } from '../../utils/session'
import { PromiseTtlCache } from '../../utils/admin-operations/cache'
import {
  buildAdminOverview,
  createAdminOverviewRouteHandler,
} from '../../utils/admin-operations/overview'
import { runDependencyProbes } from '../../utils/admin-operations/probes'
import { getR2Usage } from '../../utils/admin-operations/r2-usage'
import type { AdminOverviewResponse } from '../../utils/admin-operations/types'

const aggregateCache = new PromiseTtlCache<string, AdminOverviewResponse>()

const handler = createAdminOverviewRouteHandler({
  authorize: requireBotAdmin,
  getRepositories: getRepos,
  cache: aggregateCache,
  now: () => new Date(),
  createHttpError: (statusCode, statusMessage) => createError({ statusCode, statusMessage }),
  logError: (error) => {
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    console.error(`[Admin Overview API] aggregation failed (${errorName}).`)
  },
  loadOverview: async (repositories, now) => {
    const config = useRuntimeConfig()
    const r2 = getR2()
    const botUrl = (config.public.botUrl as string) || (config.botWebhookUrl as string)
    const botToken = config.discordBotToken as string
    const lavalinkVersionUrl = config.lavalinkVersionUrl as string
    const lavalinkPassword = config.lavalinkPassword as string

    return buildAdminOverview({
      repositories,
      runProbes: () => runDependencyProbes({
        postgres: {
          ping: async () => {
            await repositories.db.execute('select 1')
          },
        },
        redis: isRealtimeAvailable() ? { ping: pingRedis } : null,
        r2,
        discord: botToken ? { botToken } : null,
        botHttp: botUrl ? { url: botUrl } : null,
        lavalink: lavalinkVersionUrl
          ? {
              versionUrl: lavalinkVersionUrl,
              password: lavalinkPassword || undefined,
            }
          : null,
        fetchImpl: fetch,
        now: () => now,
      }),
      getR2Usage: () => getR2Usage(fetch, {
        accountId: config.r2AccountId as string,
        bucket: r2?.bucket ?? (config.r2Bucket as string),
        apiToken: config.cloudflareApiToken as string,
      }),
    }, now)
  },
})

export default defineEventHandler(handler)
