# CLAUDE.md — AI Assistant Guide for MODUS

## Project Overview

**MODUS** (Modular Discord Utility System) is a modular Discord bot with an integrated web dashboard. It's a TypeScript monorepo with two main services:

- **`bot/`** — Discord bot built with discord.js v14, featuring 25+ plugin modules
- **`web/`** — Nuxt 4 (Vue 3) dashboard for configuration and monitoring

**Version:** 1.9.0 | **License:** ISC | **Runtime:** Node.js 22 | **Package Manager:** pnpm v10.9.0

## Repository Structure

```
MODUS/
├── bot/                    # Discord bot service
│   ├── index.ts            # Entry point — client init, event registration, health server (port 3005)
│   ├── sharding.ts         # Multi-process sharding setup
│   ├── ModuleManager.ts    # Dynamic plugin loader & command/interaction router
│   ├── AppwriteService.ts  # Appwrite database CRUD wrapper (1300+ lines)
│   ├── MusicAPI.ts         # discord-player integration (queue, playback, Spotify/YT)
│   ├── WebhookRouter.ts    # Webhook trigger routing with template variables
│   ├── AlertsWorker.ts     # Background alerts service (Twitch EventSub, etc.)
│   ├── Logger.ts           # Structured logging utility
│   ├── ServerStatusService.ts # Health check service
│   ├── setup-db.ts         # Appwrite collection/index initialization
│   ├── lib/                # Shared utilities
│   │   ├── discord-utils.ts    # Discord API helpers
│   │   ├── schemas.ts          # Zod validation schemas
│   │   ├── ytdlp-stream.ts     # yt-dlp streaming bridge
│   │   └── validateSettings.ts # Settings validation
│   ├── modules/            # Feature plugins (each exports a Module interface)
│   │   ├── ai.ts           # LLM integration (Claude, OpenAI, Groq) with tool use
│   │   ├── alerts.ts       # Twitch/social alerts with EventSub
│   │   ├── antiraid.ts     # Join velocity-based raid detection
│   │   ├── automod.ts      # Content filtering and auto-moderation
│   │   ├── embeds.ts       # Embed builder command
│   │   ├── events.ts       # Server event scheduling
│   │   ├── logging.ts      # Message/member/moderation event logging
│   │   ├── milestones.ts   # Member growth milestone tracking
│   │   ├── moderation.ts   # Ban, kick, mute, warn, timeout
│   │   ├── music.ts        # Music playback (Spotify, YouTube)
│   │   ├── polls.ts        # Native Discord polls
│   │   ├── reaction-roles.ts # Button & dropdown role assignment
│   │   ├── recording.ts    # Voice channel multi-track recording
│   │   ├── tags.ts         # User-created text snippets
│   │   ├── tempvoice.ts    # Temporary voice channels
│   │   ├── tickets/        # Multi-type ticketing system (subdirectory with handlers/)
│   │   ├── triggers.ts     # Webhook-triggered actions
│   │   ├── verification.ts # Custom gate verification
│   │   ├── welcome.ts      # Welcome messages with image rendering
│   │   └── ...             # ping, reload, shard-info, help
│   ├── scripts/            # Utility scripts
│   ├── patches/            # pnpm patch overrides
│   ├── Dockerfile          # Multi-stage build (ffmpeg, yt-dlp, python3)
│   └── .env.example        # 50+ env vars template
├── web/                    # Nuxt 4 web dashboard
│   ├── nuxt.config.ts      # SSR disabled for /dashboard/**, Nitro config
│   ├── app.config.ts       # @nuxt/ui component styling overrides
│   ├── tailwind.config.js  # Custom glassmorphism theme, animations
│   ├── app/                # Nuxt frontend
│   │   ├── app.vue         # Root component
│   │   ├── pages/          # File-based routing
│   │   │   ├── index.vue       # Public landing page
│   │   │   ├── login.vue       # Discord OAuth login
│   │   │   └── dashboard/      # Protected dashboard (guild settings, modules)
│   │   ├── components/     # Vue components (automod/, dashboard/, editors)
│   │   ├── composables/    # Vue 3 composition hooks (useAppwrite, useMusicPlayer, etc.)
│   │   ├── stores/user.ts  # Pinia auth state store
│   │   ├── layouts/        # Nuxt layouts
│   │   ├── plugins/        # Nuxt lifecycle plugins
│   │   ├── types/          # TypeScript declarations
│   │   └── utils/          # Frontend utilities
│   ├── server/             # Nitro backend
│   │   ├── api/            # API routes
│   │   │   ├── auth/       # Discord OAuth flow
│   │   │   ├── discord/    # Discord API proxies (server-side)
│   │   │   ├── music/      # Music state/control
│   │   │   ├── recordings/ # Upload/download/stream
│   │   │   ├── ai/         # AI model list, usage stats
│   │   │   ├── welcome/    # Welcome image rendering
│   │   │   └── bot-health.get.ts
│   │   └── utils/          # Server utilities
│   ├── shared/             # Code shared between client & server
│   ├── public/             # Static assets
│   ├── Dockerfile          # Multi-stage build
│   └── .env.example        # Web env vars template
├── .github/workflows/      # CI/CD
│   ├── ci.yml              # Selective build & deploy to GHCR on push to main
│   ├── docker-publish.yml  # Docker image publishing on release
│   └── release-please.yml  # Automated versioning & changelog
├── .agent/workflows/       # Claude Code agent workflows
│   └── stage-comment-commit.md  # Granular conventional commit workflow
├── docker-compose.yml      # Local/production deployment (bot:3005, web:3000)
├── release-please-config.json   # Release Please settings
├── .release-please-manifest.json # Version tracking
├── CHANGELOG.md            # Auto-generated release notes
└── package.json            # Root workspace (private)
```

## Development Commands

### Bot (`cd bot/`)

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm run dev` | Run with hot reload (ts-node + nodemon) |
| `pnpm run dev:sharded` | Run sharded with hot reload |
| `pnpm run build` | Compile TypeScript to `dist/` |
| `pnpm run start` | Run compiled bot |
| `pnpm run start:sharded` | Run compiled sharded bot |
| `pnpm run setup-db` | Initialize Appwrite collections & indexes |

### Web (`cd web/`)

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm run dev` | Nuxt dev server on `0.0.0.0:3000` |
| `pnpm run build` | Build for production |
| `pnpm run preview` | Preview production build |
| `pnpm run generate` | Static site generation |

### Docker

```sh
docker compose up -d          # Start both services
docker compose up -d bot      # Start bot only
docker compose up -d web      # Start web only
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Bot framework | discord.js v14.25 |
| Music | discord-player v7 + yt-dlp + FFmpeg |
| AI providers | Anthropic SDK (Claude), OpenAI, Groq |
| Database | Appwrite (Backend-as-a-Service) |
| Web framework | Nuxt 4.2 (Vue 3, SSR + SPA hybrid) |
| UI library | @nuxt/ui (headless) + Tailwind CSS 3 |
| State management | Pinia v3 + persisted state |
| Canvas/rendering | @napi-rs/canvas, Konva |
| Validation | Zod v4 |
| Runtime | Node.js 22 |
| Package manager | pnpm v10.9.0 |

## Architecture Patterns

### Bot Module System

Each file in `bot/modules/` exports a `Module` object with:
- **`data`** — Slash command definition (discord.js `SlashCommandBuilder`)
- **`execute(interaction)`** — Command handler
- **`buttons`**, **`selectMenus`**, **`modals`** — Optional interaction handlers (matched by customId prefix)
- **`events`** — Optional Discord.js event listeners
- **`autoDefer`** — Controls automatic reply deferral (default: true)

`ModuleManager.ts` dynamically loads all modules, registers commands with Discord, and routes interactions.

### Appwrite Database

- `AppwriteService.ts` is the single data access layer for all modules
- Documents are partitioned by guild ID
- Settings documents per guild per module
- Zod schemas in `bot/lib/schemas.ts` validate settings at runtime

### Web Dashboard

- SSR is disabled for `/dashboard/**` routes (client-side only, requires Discord OAuth)
- Composables (`useServerSettings`, `useMusicPlayer`, etc.) encapsulate module-specific state
- API routes in `web/server/api/` proxy Discord API calls server-side (keeps bot token secure)
- Styling uses glassmorphism theme defined in `tailwind.config.js`

## Commit Conventions

This project uses **conventional commits** with **Release Please** for automated versioning and changelog generation.

### Commit Format

```
type(scope): descriptive subject line

- Optional body with bullet points
- Rationale for non-obvious decisions
```

### Types and Changelog Visibility

| Type | Changelog Section | Visible? |
|------|-------------------|----------|
| `feat` | Features | Yes |
| `fix` | Bug Fixes | Yes |
| `perf` | Performance | Yes |
| `refactor` | Refactors | Yes |
| `docs` | Documentation | Yes |
| `chore` | Chores | No |
| `ci` | CI | No |
| `style` | Styles | No |
| `test` | Tests | No |

### Scopes

- `bot` — Bot-side logic (commands, services, modules)
- `web` — Dashboard/web UI changes
- `api` — Server API routes

### Granular Commits

When multiple features/fixes are pending, create **one commit per logical change** (not one big commit). This ensures Release Please generates detailed changelogs with one bullet per feature.

Commit in dependency order:
1. Infrastructure/config (deps, Docker, CI)
2. Backend/bot logic
3. API routes
4. Frontend/web UI
5. Documentation/chore

See `.agent/workflows/stage-comment-commit.md` for the full workflow.

## CI/CD

- **`ci.yml`** — On push to `main`: detects changed service (bot/web), builds Docker image, pushes to GHCR with `latest` and `sha-<hash>` tags
- **`docker-publish.yml`** — On release: builds both services with semantic version tags
- **`release-please.yml`** — Creates version bump PRs from conventional commits

Docker images are published to GitHub Container Registry (GHCR).

## Key Conventions

1. **TypeScript everywhere** — Both bot and web use TypeScript with strict mode
2. **pnpm only** — The project enforces pnpm via `packageManager` field; do not use npm or yarn
3. **No linting/formatting tools configured** — Follow existing code style (2-space indent, single quotes in bot, template-based Vue components)
4. **No test suite yet** — `bot/package.json` has a placeholder test script
5. **Environment variables** — Never commit `.env` files; use `.env.example` as reference
6. **Specific file staging** — Always use `git add <specific-files>`, never `git add .` or `git add -A`
7. **Module naming** — Bot modules use kebab-case filenames matching their slash command name
8. **Composable naming** — Web composables follow `use<Feature>.ts` convention
9. **API route naming** — Nitro routes use `<name>.<method>.ts` convention (e.g., `bot-health.get.ts`)

## Common Patterns When Adding Features

### Adding a new bot module

1. Create `bot/modules/<name>.ts` exporting a `Module` object
2. Add settings schema in `bot/lib/schemas.ts` if needed
3. Add Appwrite collection methods in `bot/AppwriteService.ts` if needed
4. The module is auto-loaded by `ModuleManager.ts` — no registration required

### Adding a dashboard page for a module

1. Create `web/app/pages/dashboard/[guild_id]/<module>.vue`
2. Create a composable in `web/app/composables/use<Module>.ts` if complex state is needed
3. Add API routes in `web/server/api/<module>/` for server-side operations
4. Use `useServerSettings` composable for reading/writing guild settings

### Adding an API route

1. Create `web/server/api/<path>/<name>.<method>.ts`
2. Use Nitro's `defineEventHandler` pattern
3. For Discord API calls, proxy through server to keep tokens secure
