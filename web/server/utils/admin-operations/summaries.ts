export interface RecentSummaryLogCounts {
  error: number
  warn: number
  oldestTimestamp: Date | null
}

export interface RecentSummaryServerCounts {
  registeredSince: number
}

export interface RecentSummaryWindow {
  errors: number
  warnings: number
  registeredServers: number
  historyComplete: boolean
}

export interface BuildRecentSummariesInput {
  now: Date
  last24Hours: {
    logs: RecentSummaryLogCounts
    servers: RecentSummaryServerCounts
  }
  last7Days: {
    logs: RecentSummaryLogCounts
    servers: RecentSummaryServerCounts
  }
}

export interface RecentSummaries {
  last24Hours: RecentSummaryWindow
  last7Days: RecentSummaryWindow
}

function buildWindowSummary(
  since: Date,
  logs: RecentSummaryLogCounts,
  servers: RecentSummaryServerCounts,
): RecentSummaryWindow {
  return {
    errors: logs.error,
    warnings: logs.warn,
    registeredServers: servers.registeredSince,
    historyComplete: logs.oldestTimestamp === null || logs.oldestTimestamp <= since,
  }
}

export function buildRecentSummaries(input: BuildRecentSummariesInput): RecentSummaries {
  const now = input.now.getTime()
  const last24HoursSince = new Date(now - 24 * 60 * 60 * 1000)
  const last7DaysSince = new Date(now - 7 * 24 * 60 * 60 * 1000)

  return {
    last24Hours: buildWindowSummary(
      last24HoursSince,
      input.last24Hours.logs,
      input.last24Hours.servers,
    ),
    last7Days: buildWindowSummary(
      last7DaysSince,
      input.last7Days.logs,
      input.last7Days.servers,
    ),
  }
}
