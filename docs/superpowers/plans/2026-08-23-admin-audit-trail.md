# Bot-Admin Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and display an append-only, redacted audit trail for bot-admin module, music, AI, and premium changes.

**Architecture:** A new Drizzle table/repository stores sanitized events. A shared web audit service derives actors from authenticated sessions, enforces reason policy, redacts resource-specific state, and wraps database-backed mutations in transactions. An admin-only cursor API and page expose read-only history.

**Tech Stack:** Nuxt 4/Nitro, Vue 3, Nuxt UI, TypeScript, Drizzle/Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-admin-operations-core-design.md`

## Global Constraints

- Operations Overview and Log Explorer plans land first.
- Audit bot-admin actions only; do not audit server-manager configuration.
- Never persist API keys, tokens, secrets, credentials, connection details, or raw IP addresses.
- Actor ID comes only from `requireBotAdmin`.
- Audit rows are append-only through application interfaces.
- Disabling global modules/music, changing AI provider, and changing premium require a non-empty reason.
- Stage explicit files only and use dependency-order conventional commits.

---

### Task 1: Audit Schema, Migration, and Repository

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/repositories/admin-audit-events.ts`
- Modify: `packages/db/src/index.ts`
- Create: next SQL migration under `packages/db/drizzle/` (filename assigned by `drizzle-kit generate`)
- Modify: generated `packages/db/drizzle/meta/_journal.json`
- Create/Modify: generated Drizzle snapshot under `packages/db/drizzle/meta/`

**Interfaces:**
- Produces: `AdminAuditEvent`, `NewAdminAuditEvent`, `AdminAuditEventRepository.insert(input)`, and `searchPage(input)`.

- [ ] **Step 1: Add the schema** with UUID ID, actor ID/display, action, target type/ID, JSONB before/after, optional reason, `reasonRequired`, optional request ID, and timezone-aware `createdAt`. Add newest-first, actor, action, and target/time indexes.
- [ ] **Step 2: Implement repository insert and cursor search.** Do not implement update or delete methods. Search uses `(createdAt,id)` descending with validated value inputs.
- [ ] **Step 3: Export the repository and run `pnpm --filter @modus/db db:generate`; inspect the SQL to ensure it creates only the intended table and indexes.**
- [ ] **Step 4: Run `pnpm --filter @modus/db build`; expect success.**
- [ ] **Step 5: Commit generated and source files explicitly:** `git commit -m "feat(db): add bot admin audit events"`.

### Task 2: Audit Policy, Redaction, and Transaction Helper

**Files:**
- Create: `web/server/utils/admin-audit/types.ts`
- Create: `web/server/utils/admin-audit/policy.ts`
- Create: `web/server/utils/admin-audit/redaction.ts`
- Create: `web/server/utils/admin-audit/service.ts`
- Modify: `web/server/utils/db.ts`
- Test: `web/server/utils/admin-audit/policy.test.ts`
- Test: `web/server/utils/admin-audit/redaction.test.ts`
- Test: `web/server/utils/admin-audit/service.test.ts`

**Interfaces:**
- Produces: `requiresReason(action,before,after)`, `sanitizeAuditState(resource,state)`, and `runAuditedMutation({event,action,target,before,after,reason,mutate})`.
- `mutate(tx)` runs inside the same Drizzle transaction as audit insertion and returns the endpoint result.

- [ ] **Step 1: Write failing policy tests** for every required-reason transition and ordinary optional-reason changes.
- [ ] **Step 2: Write failing redaction tests** using nested keys including `apiKey`, `token`, `secret`, `password`, `accessKeyId`, and `connectionString`; assert no secret value survives serialized output. Assert AI output contains provider/model plus credential state only.
- [ ] **Step 3: Write failing service tests** proving actor derivation cannot be overridden, required empty reasons reject before mutation, mutation/audit share a transaction, audit failure rolls back mutation, and request ID is retained without IP.
- [ ] **Step 4: Run focused tests; expect missing implementations.**
- [ ] **Step 5: Implement policy and resource-specific allowlist sanitizers.** Reject unsupported resource types rather than persisting arbitrary objects.
- [ ] **Step 6: Add `adminAudit` to `Repos` and implement `runAuditedMutation`.** Trim reasons, enforce a documented maximum, derive the actor through `requireBotAdmin`, and insert after `mutate(tx)` inside one transaction.
- [ ] **Step 7: Run focused tests and `pnpm --filter web typecheck`; expect success.**
- [ ] **Step 8: Commit:** `git commit -m "feat(api): add audited admin mutation service"`.

### Task 3: Instrument Global Module and Music Changes

**Files:**
- Modify: `packages/db/src/repositories/modules.ts`
- Modify: `packages/db/src/repositories/system-flags.ts`
- Modify: `web/server/api/modules/[name].patch.ts`
- Modify: `web/server/api/admin/music-system.patch.ts`
- Modify: `web/app/pages/dashboard/admin/modules.vue`
- Modify: `web/app/pages/dashboard/admin/music-system.vue`
- Test: `web/server/utils/admin-audit/admin-mutations.test.ts`

**Interfaces:**
- Consumes: `runAuditedMutation` from Task 2.
- Produces: mutation responses containing `{success: true, auditEventId: string}`.

- [ ] **Step 1: Write failing endpoint-level service tests** for module enable/disable and music enable/disable, including required reason on disable and optional reason on enable.
- [ ] **Step 2: Extend repository setters to accept the transaction executor supplied by the audit service without changing ordinary callers.**
- [ ] **Step 3: Wrap both endpoints in `runAuditedMutation`.** Read exact before state, mutate through the transaction executor, persist safe after state, then publish Redis invalidation only after commit.
- [ ] **Step 4: Add confirmation dialogs.** Disabling requires a reason; enabling accepts an optional reason. Surface synchronization failures without claiming the durable change was reverted.
- [ ] **Step 5: Run focused tests, DB build, web typecheck, and web build; expect success.**
- [ ] **Step 6: Commit:** `git commit -m "feat(web): audit global system controls"`.

### Task 4: Instrument AI and Premium Changes

**Files:**
- Modify: repository used by `web/server/api/global-config/ai.put.ts`
- Modify: `packages/db/src/repositories/servers.ts`
- Modify: `web/server/api/global-config/ai.put.ts`
- Modify: `web/server/api/admin/servers/[guild_id]/premium.patch.ts`
- Modify: `web/app/pages/dashboard/admin/ai.vue`
- Modify: `web/app/pages/dashboard/admin/servers.vue`
- Test: `web/server/utils/admin-audit/ai-premium.test.ts`

**Interfaces:**
- Consumes: Task 2 service and safe resource sanitizers.

- [ ] **Step 1: Write failing tests** proving provider changes require a reason, model-only changes allow an optional reason, secret rotation never persists the secret, and every premium transition requires a reason.
- [ ] **Step 2: Extend the relevant repository setters to accept the transaction executor.**
- [ ] **Step 3: Wrap AI and premium endpoints in audited transactions.** AI before/after snapshots contain only provider, model, safe URL classification if needed, and credential presence/rotation state.
- [ ] **Step 4: Add confirmation/reason UI** and return the audit event ID after success.
- [ ] **Step 5: Run focused tests and all affected builds; expect success.**
- [ ] **Step 6: Commit:** `git commit -m "feat(web): audit AI and premium controls"`.

### Task 5: Audit Query API and Read-Only Page

**Files:**
- Create: `web/server/utils/admin-audit/query.ts`
- Create: `web/server/api/admin/audit-events.get.ts`
- Create: `web/app/pages/dashboard/admin/audit.vue`
- Modify: `web/app/pages/dashboard/admin.vue`
- Test: `web/server/utils/admin-audit/query.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/audit-events` returning `{items,nextCursor}`.

- [ ] **Step 1: Write failing query tests** for actor/action/target/date filters, default and maximum limits, cursor round-trip, and malformed input.
- [ ] **Step 2: Implement strict query parsing and opaque `(createdAt,id)` cursors.**
- [ ] **Step 3: Add the admin-only endpoint** with 400/503/sanitized-500 behavior matching the log explorer.
- [ ] **Step 4: Add Audit Trail to the sidebar and build the page** with filters, newest-first pagination, actor/action/target/reason columns, and expandable sanitized before/after JSON. Provide no edit/delete controls.
- [ ] **Step 5: Run web tests, typecheck, and build; manually verify empty state, paging, filters, long reasons, redacted details, mobile layout, and keyboard expansion.**
- [ ] **Step 6: Commit:** `git commit -m "feat(web): add bot admin audit trail"`.

### Task 6: Audit Trail Release Verification

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Apply the generated migration to a development database and exercise all four audited resource types. Confirm rejected changes leave neither resource nor audit mutation behind.**
- [ ] **Step 2: Search stored audit JSON and server logs for seeded secret values; expect zero matches.**
- [ ] **Step 3: Run `pnpm --filter web test`, `pnpm --filter @modus/db build`, `pnpm --filter bot build`, `pnpm --filter web typecheck`, and `pnpm --filter web build`; expect success.**
- [ ] **Step 4: Run `git diff --check` and inspect status.**
- [ ] **Step 5: If fixes were required, commit explicit files with `fix(web): harden bot admin audit trail`; otherwise do not create an empty commit.**
