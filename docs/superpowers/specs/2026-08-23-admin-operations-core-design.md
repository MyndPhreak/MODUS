# Admin Operations Core Design

## Summary

MODUS will add an admin operations core delivered in three ordered sub-projects:

1. Operations Overview
2. Enhanced Log Explorer
3. Bot-Admin Audit Trail

The work will use a unified operations foundation rather than embedding health and audit logic directly in Vue pages. Existing status, log, server, and system-flag records remain authoritative. The first release will not introduce high-frequency metric storage, log exports, or auditing of server-manager configuration changes.

## Goals

- Give bot administrators one place to identify fleet and dependency problems.
- Provide searchable, pageable access to retained logs without removing the bounded live stream.
- Record sensitive bot-admin configuration changes with a durable actor and reason.
- Reuse existing Postgres, Redis, R2, heartbeat, logging, and authorization patterns.
- Keep the first release operationally useful without building a general-purpose observability platform.

## Non-Goals

- High-frequency time-series metrics or Prometheus-style monitoring.
- Detailed historical charts for every health signal.
- Downloadable log exports.
- Auditing ordinary server-manager module configuration.
- Editing or deleting audit records through the dashboard.
- Automatic remediation of detected incidents.
- A general alert-rule builder or incident-management system.

## Delivery Order

Each sub-project should be independently buildable and reviewable, but all three share the data and API conventions defined here.

### 1. Operations Overview

Add `/dashboard/admin/overview` and make it the default admin destination. It provides current health, recent operational summaries, and a concise list of conditions needing attention.

### 2. Enhanced Log Explorer

Extend the existing live logs page with server-side filtering and cursor pagination. The existing Redis SSE channel remains responsible for immediate events.

### 3. Bot-Admin Audit Trail

Add append-only audit persistence, a shared audited-mutation helper, instrumentation for existing bot-admin mutations, and an admin audit page.

## Architecture

### Admin API Boundary

New operations endpoints live under `web/server/api/admin/` and call `requireBotAdmin` before reading operational data. They return presentation-neutral response objects; Vue pages do not query repositories directly or implement health policy.

The initial endpoint groups are:

- `GET /api/admin/overview`
- `GET /api/admin/logs` with validated query parameters
- `GET /api/admin/audit-events`

Existing bot-admin mutation endpoints remain responsible for their resources but use a shared audit helper once the audit sub-project lands.

### Authoritative Data Sources

- `bot_status`: shard heartbeat, shard identity, total shard count, and deployed version.
- `servers`: registered server state, shard assignment, premium state, and server counts.
- `logs`: structured operational events and recent error/warning summaries.
- `system_flags`: fleet-wide switches such as music availability.
- Live dependency probes: current Postgres, Redis, R2, Discord, bot HTTP, and Lavalink reachability.

No new metrics table is added in this release. The 24-hour and 7-day summaries are derived from retained records. A summary explicitly reports unavailable data when retention is shorter than the requested window.

### Service Boundaries

The web server gains focused utilities with narrow responsibilities:

- An operations summary service collects stored state and probe results.
- Dependency probe functions each return the same health-result shape and do not throw beyond their boundary.
- An audit service validates and redacts audit data before repository insertion.
- Log query parsing validates filters and creates opaque cursors.

These utilities must not expose credentials, connection strings, private service URLs, or other deployment secrets.

## Operations Overview

### Current Health

The overview presents:

- Overall fleet state.
- Active versus expected shards.
- Deployed version and version disagreement between active shards.
- Registered, online, offline, and premium server counts.
- Current fleet-wide music switch state.
- Postgres, Redis, R2, Discord, bot HTTP, and Lavalink health.
- Current reported R2 bucket usage: object count, payload bytes, metadata bytes,
  pending multipart uploads, and metric timestamp.

Each dependency result includes only:

- Stable dependency key and display label.
- Status: `healthy`, `degraded`, `unhealthy`, or `unconfigured`.
- Measured latency when meaningful.
- Last checked timestamp.
- Sanitized operator-facing message.

Redis is optional in MODUS, so an unconfigured Redis result is informational rather than making the whole fleet unhealthy. R2 and Postgres are required and therefore affect overall state. Optional services such as Lavalink affect only their associated subsystem when deliberately unconfigured.

### R2 Usage

Per-bucket usage comes from Cloudflare's GraphQL Analytics API
`r2StorageAdaptiveGroups` dataset, filtered to the configured R2 bucket. The
overview uses the latest available sample and reports:

- Object count.
- Object payload size in bytes and a human-readable binary unit.
- Object metadata size in bytes and a human-readable binary unit.
- Pending multipart upload count.
- The timestamp represented by the metric.

Cloudflare analytics can lag behind current writes, so the UI labels this data
as "last reported" and displays the metric timestamp. The dashboard must not
describe it as an exact real-time bucket scan.

The GraphQL request uses `R2_ACCOUNT_ID`, `R2_BUCKET`, and a dedicated
Cloudflare API bearer token supplied through a private server runtime setting.
The existing S3 access key and secret are not reused as a bearer token. The
token requires only the minimum account analytics permission needed to read R2
metrics and is never exposed through runtime config or API responses.

R2 usage is cached independently for at least five minutes because it changes
less frequently than dependency reachability and the upstream dataset is not
real-time. Concurrent refreshes share an in-flight request where practical. If
the analytics token is absent, the R2 health probe still runs through the S3
client while usage is returned as `unconfigured`; this does not mark R2 itself
unhealthy. If Cloudflare returns no recent sample, usage is `unavailable` with
a sanitized explanation.

The implementation must not calculate routine usage by listing and summing
every object in the bucket. A full S3 object scan grows linearly with bucket
contents and is unsuitable for a dashboard refresh path.

### Probing and Caching

Probes run independently under strict per-probe timeouts and are collected with failure isolation. A failed probe produces an unhealthy result rather than failing `GET /api/admin/overview`.

The aggregated result is cached briefly in the web process to avoid probing every dependency for every page refresh. Cache duration should be short enough for an operations page while preventing accidental request amplification. Concurrent requests should share an in-flight refresh where practical.

### Recent Summaries

The overview derives 24-hour and 7-day summaries from existing records:

- Error log count.
- Warning log count.
- Registered-server growth where timestamps support it.
- Shard availability based on heartbeat freshness at request time.

These are compact comparisons, not high-resolution time-series charts. The API must distinguish zero events from insufficient retained history.

### Needs Attention

The API produces structured attention items rather than requiring the page to infer incidents. Initial conditions include:

- Missing or stale shards.
- Required dependency failure.
- Version disagreement between active shards.
- Elevated recent error activity using a documented conservative threshold.
- A fleet-wide subsystem disabled by health automation or an administrator.
- Recent retention-worker errors found in structured logs.

Each item has a severity, title, concise explanation, timestamp when known, and an optional internal dashboard link. Healthy systems remain visually compact; attention items receive priority.

## Enhanced Log Explorer

### Query Model

`GET /api/admin/logs` supports:

- Free-text message search.
- Log level.
- Scope: global or guild.
- Exact guild ID.
- Exact shard ID.
- Exact source.
- Start and end timestamps.
- Page size with a server-enforced maximum.
- Opaque cursor for the next older page.

Results are ordered newest first by `(timestamp, id)`. The cursor encodes both values so rows with identical timestamps cannot be skipped or repeated. Cursor contents are treated as an implementation detail and validated before use.

The response contains `items` and `nextCursor`. The initial request replaces the current fixed 200-row snapshot. Reasonable default and maximum page sizes prevent unbounded reads.

### Database Indexing

Existing timestamp indexes should be reused where possible. Migration design must add only indexes justified by actual query predicates and query-plan inspection. Text search should begin with a bounded, case-insensitive message search suitable for the retained dataset; a specialized full-text index is deferred until volume demonstrates the need.

### Live and Historical State

Redis SSE remains the live transport. The browser maintains a bounded live buffer to prevent unbounded memory growth. Historical pages are loaded from Postgres and merged by log ID.

The page supports:

- Pause and resume of visible live insertion.
- Auto-scroll control.
- SSE connection status.
- Loading older pages.
- Search and structured filters.
- Direct links from guild IDs to the relevant server dashboard.

Pausing does not stop EventSource reconnection. Newly received entries are buffered up to a documented limit and surfaced as a pending count. Resuming merges them without duplicates. Changing a server-side filter resets historical pagination and re-runs the query. Export is explicitly deferred.

## Bot-Admin Audit Trail

### Scope

The first release audits bot-admin actions only:

- Global module state changes.
- Fleet-wide music state changes.
- Global AI provider and model configuration changes.
- Registered-server premium state changes.

Server-manager configuration changes are not audited. This avoids unnecessary behavioral retention and noise while keeping the schema extensible for future needs.

### Data Model

Add an append-only `admin_audit_events` table with:

- UUID primary key.
- Actor Discord user ID.
- Actor display snapshot when available.
- Stable action key.
- Stable target type and target ID.
- Sanitized JSON before state.
- Sanitized JSON after state.
- Optional reason.
- Whether a reason was required.
- Request correlation ID when available.
- Creation timestamp.

Indexes support newest-first global reads plus actor, action, target, and timestamp filtering. The application exposes insert and read operations but no update or delete operation.

### Reason Policy

Ordinary audited changes accept an optional reason. A non-empty reason is required for high-impact actions:

- Disabling a global module.
- Disabling fleet-wide music.
- Changing the global AI provider.
- Changing a server's premium state.

Reasons are trimmed and length-limited on the server. The API, not the browser, enforces the requirement.

### Redaction

Before and after state pass through a centralized allowlist or resource-specific sanitizer before persistence. API keys, tokens, secrets, credentials, connection details, and credential-like fields must never be stored in audit JSON.

Global AI audit events record safe fields such as provider and model. Secret values are represented only as unchanged, added, removed, or rotated when that distinction is required; their value is never retained.

### Mutation Consistency

For database-backed mutations, the resource change and audit insertion occur in one database transaction where the current repository architecture permits it. A high-impact action must not succeed without its required audit event.

Redis invalidation or publication occurs after the durable transaction. If publication fails, the database remains authoritative, the failure is logged, and the API returns a clear synchronization warning or failure according to the endpoint's existing contract. Retrying must not create misleading duplicate state changes; audit events should carry a request correlation ID where available.

The actor is always derived from `requireBotAdmin`. The browser cannot provide or override the actor ID.

### Audit Page

Add `/dashboard/admin/audit` with:

- Newest-first cursor pagination.
- Actor, action, target, and date filters.
- Timestamp, actor, action, target, and reason in the primary list.
- Expandable sanitized before/after details.

The page has no edit or delete controls.

## Admin Navigation and Interaction

The admin sidebar order becomes:

1. Operations Overview
2. Global Modules
3. Music System
4. AI Settings
5. Registered Servers
6. Live Bot Logs
7. Audit Trail

`/dashboard/admin` redirects to or renders the Operations Overview.

High-impact controls open a confirmation dialog containing a required reason input. Ordinary audited controls may expose an optional reason in the confirmation flow. Existing controls should retain their directness while making consequential changes deliberate.

Registered-server rows link to logs filtered by guild ID. Premium changes link to the resulting audit event when the response provides its ID.

## Error Handling

- Independent health probe failures never erase successful probe results.
- Unconfigured optional dependencies are represented explicitly.
- Invalid filters and cursors return `400` without querying Postgres.
- Repository failures return sanitized operator messages and log internal details server-side.
- SSE disconnection is visible and relies on EventSource automatic reconnection.
- An audit write failure prevents the associated audited database mutation from being reported as successful.
- Secret values are redacted before both persistence and error logging.

## Authorization and Privacy

- Every new admin endpoint calls `requireBotAdmin` before accessing data.
- Actor identity comes from the sealed authenticated session.
- The overview exposes state, not deployment credentials or private endpoints.
- The Cloudflare analytics token remains private server configuration and is
  never serialized to the browser.
- Audit storage is limited to bot-admin behavior in this release.
- Log access remains bot-admin-only because entries span all guilds.
- Request context is limited to a correlation ID; raw IP retention is not required for this feature.

## Verification Strategy

The implementation plan must include focused automated coverage for:

- Health aggregation when individual probes succeed, fail, timeout, or are unconfigured.
- Overall health policy for required and optional dependencies.
- R2 usage parsing, unit formatting, stale/unavailable data, cache behavior,
  and operation without an analytics token.
- 24-hour and 7-day summary behavior with insufficient retention.
- Log filter validation, stable `(timestamp, id)` cursor pagination, and page limits.
- Live/historical log deduplication in extracted testable client logic where practical.
- Audit reason requirements.
- Audit redaction, especially global AI configuration.
- Actor derivation and admin authorization.
- Atomic resource mutation and audit insertion for database-backed actions.
- Audit cursor pagination and filtering.

Repository query plans should be inspected against representative data before adding indexes. Final verification includes:

- `@modus/db` build.
- Bot TypeScript build.
- Nuxt production build.
- Focused API and repository tests introduced by the implementation.
- Manual browser checks for responsive layout, loading states, degraded states, empty states, filter reset behavior, SSE reconnection, and keyboard-accessible confirmation dialogs.

## Rollout

The three sub-projects ship in order. Database migrations precede code that depends on them. The overview can ship without audit persistence. The log explorer can ship independently of the audit page. Audit instrumentation ships only after the audit table and shared sanitization helper are available.

No existing logs are migrated or rewritten. Existing admin functionality remains available while each page is introduced. Rollback of a UI/API sub-project does not require deleting stored logs or audit events.

## Deferred Follow-Ups

- Downloadable log exports.
- High-frequency metric collection and detailed historical charts.
- Alert notifications and incident lifecycle management.
- Background-worker status protocol beyond information derivable from logs.
- Guild-manager audit events.
- Audit retention controls if volume or policy later requires them.
- Full-text or external log indexing when measured query volume warrants it.
