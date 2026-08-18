<p align="center">
  <img src="https://modus.ppo.gg/modus2-animated.svg" alt="MODUS" width="280" />
</p>

<h3 align="center">A modular Discord bot with an admin web dashboard.</h3>

<p align="center">
  Music, moderation, AI, events, recordings, polls, giveaways, and many more — feature modules you can toggle per server.
</p>

---

## What is MODUS?

MODUS is a modular Discord platform that combines a feature-rich bot with a Nuxt-based web dashboard. It aims to replace a collection of single-purpose bots by providing a single, extensible service for moderation, music playback, AI tools, ticketing, automated workflows, and server dashboards.

The project uses Postgres, Redis, and Cloudflare R2 for persistent storage and runs with Docker Compose for convenient self-hosting.

## Quick links

- Documentation: web/docs and in-repo files
- Changelog: [CHANGELOG.md](CHANGELOG.md) — see the full release notes (latest: 1.19.1)
- Installation: [INSTALLATION.md](INSTALLATION.md)
- License: [LICENSE](LICENSE) — MIT

## Notable recent changes

Summary of high-impact updates (see CHANGELOG.md for full history):

- Music: migrated to a Lavalink v4 control plane with durable player state, autoplay, lyrics (LavaLyrics & LRCLIB), real-time pitch/speed controls, and improved reconnect/recovery logic.
- Giveaways: add full giveaway lifecycle (create, draw, reroll, cancel), duration parsing, entry requirements, and admin dashboard UI.
- Web: major welcome-image editor enhancements (multi-select, undo/redo, uploaded image layers, alignment/distribute tools, avatar shapes), a giveaways dashboard, polls/events UI, and numerous accessibility and rendering fixes.
- Polls & Events: reusable poll templates, running polls with live tallies, scheduled events (create/edit/delete/list), and dashboard send flows.
- Recordings & R2: multitrack recording support, R2-backed recording storage, streaming uploads, and transcript handling.
- AI & Tools: AI chat module with multiple providers and tool integrations (web search, TTS, and more); appended system prompts and dashboard reorganization for AI features.
- Infrastructure: Postgres/Redis/R2 migration completed with many DB migrations, improved auth, and optional native Discord OAuth for the dashboard.

## Features (high level)

- Music player with queue, filters, durable playback, and Lavalink integration
- AI chat module with provider flexibility and tool access
- Voice recording with per-participant tracks
- Moderation tools (warn, ban, timeout, purge) and audit logging
- AutoMod with flexible rule conditions and actions
- Tickets with thread-based lifecycle and transcript generation
- Welcome image visual editor and server-side rendering
- Reaction roles (buttons and dropdowns)
- Temporary voice channels (join-to-create lobbies)
- Alerts (Twitch, YouTube, GitHub, RSS)
- Polls, Events, Giveaways, Milestones, Verification, Triggers, and more

For a full feature list and roadmap see CHANGELOG.md and the docs pages in the web dashboard.

## Web Dashboard

The dashboard is a separate Nuxt 4 application that connects to the same Postgres backend used by the bot. It provides admin pages for modules, a visual welcome image editor, polls/events management, and real-time dashboards for running polls and giveaways.

Public landing pages (docs, landing) are server-rendered; dashboard pages require Discord OAuth and are rendered client-side.

## Stack

- Bot: Discord.js 14, Lavalink 4 (Shoukaku), Node 22, TypeScript
- Web: Nuxt 4, Pinia, Tailwind CSS
- AI: Anthropic, OpenAI, Google Gemini, Groq (pluggable)
- Backend: Postgres, Redis, Cloudflare R2
- Infra: Docker Compose, pnpm workspaces, GHCR

## Self-hosting / Quick start

See INSTALLATION.md for full instructions. Quick summary:

1. Copy the example environment file and set secrets (DATABASE_URL, REDIS_URL, R2 credentials, DISCORD_BOT_TOKEN, etc.).

2. Start with Docker Compose (recommended):

```bash
# from repository root
cp .env.example .env
# edit .env with your values
docker compose up -d --build
```

3. Visit the dashboard (default: http://localhost:3000) and use Discord OAuth to register your server.

Notes:
- If you run the bot and dashboard separately in development, follow the web/README.md for dashboard dev commands.
- For production, ensure R2, Postgres, and Redis are reachable and the Lavalink service is configured.

## Contributing

Contributions are welcome. Please:

- Open issues for bugs or feature requests
- Send PRs against the `main` branch — this repository uses feature branches and PR reviews
- Follow the existing code style and tests where applicable

See CONTRIBUTORS, CODE_OF_CONDUCT, and the repository issue tracker for more details.

## CI / Tests

The repository includes GitHub Actions for builds and tests. Please ensure your changes pass the CI checks before opening a PR.

## License

MIT — see [LICENSE](LICENSE)


---

This README was updated to reflect recent releases — see [CHANGELOG.md](CHANGELOG.md) for full release notes and the history of changes.
