# Admin Operations Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin landing page that summarizes fleet health, actionable incidents, recent activity, and current reported R2 bucket usage.

**Architecture:** Pure aggregation and health-policy functions sit behind an admin-only Nitro endpoint. Independent dependency probes are timeout-bounded and briefly cached; Cloudflare GraphQL R2 usage has its own five-minute cache. The Vue page renders the endpoint response and contains no health inference.

**Tech Stack:** Nuxt 4/Nitro, Vue 3, Nuxt UI, TypeScript, Drizzle/Postgres, AWS S3 client, Cloudflare GraphQL Analytics, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-admin-operations-core-design.md`

## Global Constraints

- Use pnpm 10.9.0 and Node.js 22; do not use npm or yarn.
- Every endpoint in this plan must call `requireBotAdmin`.
- Never return credentials, connection strings, private service URLs, bucket names, or API tokens.
- Redis being unconfigured is informational; required Postgres and R2 failures affect overall health.
- R2 usage is “last reported,” never described as real-time.
- Do not scan every R2 object to calculate routine usage.
- Stage only explicit files and use conventional commits.

---

### Task 1: Web Test Harness and Operations Contracts

**Files:**
- Modify: `web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `web/server/utils/admin-operations/types.ts`
- Create: `web/server/utils/admin-operations/policy.ts`
- Test: `web/server/utils/admin-operations/policy.test.ts`

**Interfaces:**
- Produces: `DependencyHealth`, `AttentionItem`, `AdminOverviewResponse`, and `deriveOverallStatus(input)`.

- [ ] **Step 1: Add a failing policy test** covering required dependency failure, optional unconfigured Redis, stale shards, and version disagreement. Use fixed timestamps and assert exact `overallStatus` and stable attention keys.
- [ ] **Step 2: Add `vitest` and a `test` script to `web/package.json`, run `pnpm install`, then run `pnpm --filter web test -- policy.test.ts`; expect failure because the policy module does not exist.**
- [ ] **Step 3: Define exact response contracts and implement `deriveOverallStatus` as a pure function.** Required dependency failure yields `unhealthy`; missing expected shards or version disagreement yields at least `degraded`; unconfigured Redis does not downgrade health.
- [ ] **Step 4: Run `pnpm --filter web test -- policy.test.ts`; expect all policy cases to pass.**
- [ ] **Step 5: Commit with explicit files:** `git commit -m "test(web): add admin operations policy harness"`.

### Task 2: Operational Summary Queries

**Files:**
- Modify: `packages/db/src/repositories/logs.ts`
- Modify: `packages/db/src/repositories/servers.ts`
- Create: `web/server/utils/admin-operations/summaries.ts`
- Test: `web/server/utils/admin-operations/summaries.test.ts`

**Interfaces:**
- Produces: `LogRepository.countByLevelSince(since: Date)`, `ServerRepository.getAdminCounts(since: Date)`, and `buildRecentSummaries(...)`.
- Consumes: contracts from Task 1.

- [ ] **Step 1: Write failing pure tests** for 24-hour/7-day summary mapping and the `historyComplete` flag when the oldest retained log is newer than the requested window.
- [ ] **Step 2: Run `pnpm --filter web test -- summaries.test.ts`; expect module-not-found failure.**
- [ ] **Step 3: Implement repository aggregate queries** using SQL `count(*) FILTER (...)`, plus the oldest retained log timestamp and server registration counts supported by the schema. Return numeric primitives, not Drizzle values.
- [ ] **Step 4: Implement `buildRecentSummaries`** so zero and incomplete history are distinct response states.
- [ ] **Step 5: Run the focused test, `pnpm --filter @modus/db build`, and `pnpm --filter web typecheck`; expect success.**
- [ ] **Step 6: Commit:** `git commit -m "feat(db): add admin operations summary queries"`.

### Task 3: Dependency Probes and R2 Analytics

**Files:**
- Modify: `web/nuxt.config.ts`
- Create: `web/server/utils/admin-operations/cache.ts`
- Create: `web/server/utils/admin-operations/probes.ts`
- Create: `web/server/utils/admin-operations/r2-usage.ts`
- Test: `web/server/utils/admin-operations/probes.test.ts`
- Test: `web/server/utils/admin-operations/r2-usage.test.ts`
- Modify: `.env.example` if present, otherwise modify the repository’s documented web environment example.

**Interfaces:**
- Produces: `runDependencyProbes(deps)`, `getR2Usage(fetchImpl, config)`, and `formatBinaryBytes(bytes)`.
- Adds private runtime config `cloudflareApiToken`, set by `NUXT_CLOUDFLARE_API_TOKEN`.

- [ ] **Step 1: Write failing probe tests** using injected fake fetch/S3/Redis dependencies for success, timeout, unconfigured optional service, and sanitized failure messages.
- [ ] **Step 2: Write failing R2 tests** for GraphQL variables, latest sample selection, byte formatting, missing token, no sample, cache reuse, and no token leakage.
- [ ] **Step 3: Run both focused tests; expect missing implementations.**
- [ ] **Step 4: Implement a shared promise-aware TTL cache and timeout wrapper.** Abort timed-out fetches and map thrown errors to sanitized health results.
- [ ] **Step 5: Implement probes** for Postgres, Redis, S3 R2 reachability, Discord, bot HTTP, and Lavalink using injected dependencies for tests.
- [ ] **Step 6: Implement Cloudflare GraphQL analytics** against `r2StorageAdaptiveGroups`, filtering by account and configured bucket, ordering newest first, and caching for at least five minutes. Return raw bytes and formatted binary units plus the sample timestamp.
- [ ] **Step 7: Document `NUXT_CLOUDFLARE_API_TOKEN` as optional analytics-only configuration and run focused tests plus `pnpm --filter web typecheck`.**
- [ ] **Step 8: Commit:** `git commit -m "feat(web): add dependency and R2 usage probes"`.

### Task 4: Admin Overview API

**Files:**
- Create: `web/server/utils/admin-operations/overview.ts`
- Create: `web/server/api/admin/overview.get.ts`
- Test: `web/server/utils/admin-operations/overview.test.ts`

**Interfaces:**
- Produces: `buildAdminOverview(deps, now): Promise<AdminOverviewResponse>` and `GET /api/admin/overview`.
- Consumes: Tasks 1–3 contracts, repository summaries, probes, and R2 usage.

- [ ] **Step 1: Write a failing orchestration test** with fake repositories and probes asserting shard freshness at 120 seconds, active/expected counts, version disagreement, attention ordering, and partial probe failure.
- [ ] **Step 2: Run the focused test; expect failure because `buildAdminOverview` is absent.**
- [ ] **Step 3: Implement `buildAdminOverview`** with injected dependencies and a fixed `now` argument; keep all policy outside the route.
- [ ] **Step 4: Add the route** with `requireBotAdmin`, repository availability handling, sanitized errors, and a short aggregate cache.
- [ ] **Step 5: Run focused tests and `pnpm --filter web typecheck`; expect success.**
- [ ] **Step 6: Commit:** `git commit -m "feat(api): expose admin operations overview"`.

### Task 5: Operations Overview Page and Navigation

**Files:**
- Create: `web/app/pages/dashboard/admin/overview.vue`
- Modify: `web/app/pages/dashboard/admin.vue`
- Modify: `web/app/pages/dashboard/admin/index.vue`

**Interfaces:**
- Consumes: `GET /api/admin/overview` response from Task 4.
- Produces: default admin landing page and sidebar entry `overview`.

- [ ] **Step 1: Change the admin route default** so `/dashboard/admin` resolves to the overview, and put Operations Overview first in the sidebar.
- [ ] **Step 2: Build the page** with fleet summary cards, compact dependency cards, R2 usage, 24-hour/7-day summaries, and a severity-sorted Needs Attention section. Include loading, empty, degraded, unavailable, and retry states.
- [ ] **Step 3: Ensure copy says “last reported” for R2 usage and does not expose internal endpoint or bucket details.**
- [ ] **Step 4: Run `pnpm --filter web typecheck` and `pnpm --filter web build`; expect success.**
- [ ] **Step 5: Manually verify** desktop/mobile layout, keyboard navigation, admin denial, one failed probe, Redis unconfigured, and missing analytics token.
- [ ] **Step 6: Commit:** `git commit -m "feat(web): add admin operations overview"`.

### Task 6: Overview Release Verification

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Run `pnpm --filter web test`; expect all web tests to pass.**
- [ ] **Step 2: Run `pnpm --filter @modus/db build`, `pnpm --filter bot build`, `pnpm --filter web typecheck`, and `pnpm --filter web build`; expect zero failures.**
- [ ] **Step 3: Run `git diff --check` and inspect `git status --short`; verify only intentional files remain.**
- [ ] **Step 4: If verification required code changes, commit only those files with `fix(web): harden admin operations overview`; otherwise do not create an empty commit.**

