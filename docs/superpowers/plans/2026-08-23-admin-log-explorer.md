# Admin Log Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 200-row admin snapshot with validated historical search and stable cursor pagination while preserving bounded Redis SSE updates.

**Architecture:** Postgres owns historical filtered reads ordered by `(timestamp, id)`; Nitro validates filters and emits opaque cursors. Extracted pure client logic merges historical and live records by ID, while the page controls pause/resume, pending live entries, auto-scroll, and connection state.

**Tech Stack:** Nuxt 4/Nitro, Vue 3, Nuxt UI, TypeScript, Drizzle/Postgres, Redis SSE, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-admin-operations-core-design.md`

## Global Constraints

- Operations Overview plan must land first because this plan reuses the web Vitest harness.
- `GET /api/admin/logs` remains bot-admin-only.
- Default page size is 100; hard maximum is 200.
- Cursors contain timestamp and ID, are opaque to the browser, and invalid cursors return 400.
- Live and historical arrays remain bounded and deduplicate by `$id`.
- Log export is not included.
- Stage explicit files only and use conventional commits.

---

### Task 1: Cursor and Filter Contracts

**Files:**
- Create: `web/server/utils/admin-logs/query.ts`
- Test: `web/server/utils/admin-logs/query.test.ts`

**Interfaces:**
- Produces: `AdminLogQuery`, `parseAdminLogQuery(query)`, `encodeLogCursor({timestamp,id})`, and `decodeLogCursor(value)`.

- [ ] **Step 1: Write failing tests** for defaults, maximum page size, valid filters, invalid level/scope/shard/date ranges, cursor round-trip, and malformed cursor rejection.
- [ ] **Step 2: Run `pnpm --filter web test -- query.test.ts`; expect missing-module failure.**
- [ ] **Step 3: Implement strict parsing** for `search`, `level`, `scope`, `guildId`, `shardId`, `source`, `from`, `to`, `limit`, and `cursor`. Trim text inputs and cap their lengths.
- [ ] **Step 4: Implement base64url cursor encoding** for an ISO timestamp plus UUID/string ID; validate both fields on decode.
- [ ] **Step 5: Run the focused tests; expect success.**
- [ ] **Step 6: Commit:** `git commit -m "feat(api): define admin log query contracts"`.

### Task 2: Repository Cursor Query

**Files:**
- Modify: `packages/db/src/repositories/logs.ts`
- Test: `web/server/utils/admin-logs/repository-contract.test.ts`

**Interfaces:**
- Produces: `LogRepository.searchPage(input): Promise<{items: LogDoc[]; nextCursorRow: {timestamp: Date; id: string} | null}>`.
- Consumes: normalized filters from Task 1; repository accepts values, not encoded cursors.

- [ ] **Step 1: Write a failing contract test** against an extracted predicate/order helper, proving identical timestamps use descending ID as the tie-breaker and the next page excludes already-returned rows.
- [ ] **Step 2: Run the focused test; expect missing helper failure.**
- [ ] **Step 3: Implement optional Drizzle predicates** for text, level, scope, guild, shard, source, date range, and `(timestamp,id)` cursor. Fetch `limit + 1`, return at most `limit`, and derive the next cursor row from the last returned item only when another row exists.
- [ ] **Step 4: Keep `listAll` temporarily for compatibility, but route new code through `searchPage`.**
- [ ] **Step 5: Run the focused test and `pnpm --filter @modus/db build`; expect success. Inspect the generated SQL/query plan on a representative database before adding any index.**
- [ ] **Step 6: Commit:** `git commit -m "feat(db): add cursor-paginated log search"`.

### Task 3: Paginated Admin Logs API

**Files:**
- Modify: `web/server/api/admin/logs.get.ts`
- Test: `web/server/utils/admin-logs/api-response.test.ts`

**Interfaces:**
- Produces: `{ items: LogDoc[]; nextCursor: string | null }`.
- Consumes: Task 1 parser/cursor and Task 2 repository method.

- [ ] **Step 1: Write a failing response-mapping test** asserting the repository cursor row becomes an opaque cursor and absent continuation becomes `null`.
- [ ] **Step 2: Run the focused test; expect missing mapper failure.**
- [ ] **Step 3: Replace fixed `LIMIT = 200` behavior** with validated query parsing, `searchPage`, and response mapping. Preserve `requireBotAdmin`, 503, and sanitized 500 behavior; pass parser errors through as 400.
- [ ] **Step 4: Run focused tests and `pnpm --filter web typecheck`; expect success.**
- [ ] **Step 5: Commit:** `git commit -m "feat(api): add searchable admin log history"`.

### Task 4: Live/Historical Client State

**Files:**
- Create: `web/app/utils/admin-log-state.ts`
- Test: `web/app/utils/admin-log-state.test.ts`

**Interfaces:**
- Produces: `mergeLogItems(current,incoming,max)`, `queueLiveLog(state,log,maxPending)`, and `resumeLiveLogs(state,maxVisible)`.

- [ ] **Step 1: Write failing tests** for deduplication, newest-first ordering, visible-buffer cap, paused pending count, pending cap, and resume merge.
- [ ] **Step 2: Run the focused test; expect missing implementation.**
- [ ] **Step 3: Implement immutable pure helpers** keyed by `$id`; break timestamp ties by `$id` for deterministic order.
- [ ] **Step 4: Run the focused tests; expect success.**
- [ ] **Step 5: Commit:** `git commit -m "test(web): define admin live log state"`.

### Task 5: Log Explorer UI

**Files:**
- Modify: `web/app/pages/dashboard/admin/logs.vue`
- Modify: `web/app/pages/dashboard/admin/servers.vue`

**Interfaces:**
- Consumes: paginated API from Task 3 and state helpers from Task 4.

- [ ] **Step 1: Replace the fixed snapshot fetch** with query state, debounced text search, filter serialization, page reset, and `Load older` using `nextCursor`.
- [ ] **Step 2: Add controls** for search, level, scope, guild, shard, source, date range, pause/resume, auto-scroll, refresh, and clear view. Show SSE state and pending live count.
- [ ] **Step 3: Merge SSE entries through the tested helper.** Paused events enter the bounded pending buffer; resuming merges without duplicates.
- [ ] **Step 4: Add guild links** from log rows to `/dashboard/server/:guildId/logs` and from Registered Servers to `/dashboard/admin/logs?guildId=:guildId`.
- [ ] **Step 5: Run `pnpm --filter web test`, `pnpm --filter web typecheck`, and `pnpm --filter web build`; expect success.**
- [ ] **Step 6: Manually verify** malformed cursor, empty search, rapid filter changes, identical timestamps, SSE reconnect, pause overflow, load older, mobile controls, and keyboard access.
- [ ] **Step 7: Commit:** `git commit -m "feat(web): enhance admin log explorer"`.

### Task 6: Log Explorer Release Verification

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Run all web tests and all three production builds; expect success.**
- [ ] **Step 2: Run `git diff --check` and inspect explicit status.**
- [ ] **Step 3: If verification required fixes, commit explicit files with `fix(web): harden admin log explorer`; otherwise do not create an empty commit.**

