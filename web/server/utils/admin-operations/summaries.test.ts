import { describe, expect, it } from 'vitest'
import { buildRecentSummaries } from './summaries'

describe('buildRecentSummaries', () => {
  it('maps complete 24-hour and 7-day log and server aggregates', () => {
    const result = buildRecentSummaries({
      now: new Date('2026-08-23T12:00:00.000Z'),
      last24Hours: {
        logs: { error: 2, warn: 5, oldestTimestamp: new Date('2026-08-22T11:59:00.000Z') },
        servers: { registeredSince: 3 },
      },
      last7Days: {
        logs: { error: 9, warn: 12, oldestTimestamp: new Date('2026-08-15T11:59:00.000Z') },
        servers: { registeredSince: 8 },
      },
    })

    expect(result).toEqual({
      last24Hours: { errors: 2, warnings: 5, registeredServers: 3, historyComplete: true },
      last7Days: { errors: 9, warnings: 12, registeredServers: 8, historyComplete: true },
    })
  })

  it('marks only windows that predate retained logs incomplete while preserving zero counts', () => {
    const result = buildRecentSummaries({
      now: new Date('2026-08-23T12:00:00.000Z'),
      last24Hours: {
        logs: { error: 0, warn: 0, oldestTimestamp: null },
        servers: { registeredSince: 0 },
      },
      last7Days: {
        logs: { error: 1, warn: 0, oldestTimestamp: new Date('2026-08-20T12:00:00.000Z') },
        servers: { registeredSince: 2 },
      },
    })

    expect(result).toEqual({
      last24Hours: { errors: 0, warnings: 0, registeredServers: 0, historyComplete: true },
      last7Days: { errors: 1, warnings: 0, registeredServers: 2, historyComplete: false },
    })
  })
})
