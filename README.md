<p align="center">
  <img src="https://modus.ppo.gg/modus2-animated.svg" alt="MODUS" width="280" />
</p>

<h3 align="center">A modular Discord bot with a web dashboard.</h3>

<p align="center">
  Music, moderation, AI, anti-raid, recordings, tickets, and more — 25+ features you can toggle per server.
</p>

---

## What is MODUS?

MODUS is a Discord bot designed to replace the pile of single-purpose bots most servers end up with. Instead of running five different bots for moderation, music, welcome messages, tickets, and logging, MODUS handles all of it through independent modules that can be toggled on or off per server.

It ships with a web dashboard (built on Nuxt 4) for configuring everything without touching slash commands, and uses Postgres, Redis, and Cloudflare R2 as its backend infrastructure.

## Features

### AI Chat

Talk to LLMs directly in Discord. Supports multiple providers and models:

- **Anthropic** — Claude 4 Sonnet, Claude 4 Opus
- **OpenAI** — GPT-4o, GPT-4o Mini, o3-mini
- **Google** — Gemini 2.5 Pro, Gemini 2.5 Flash
- **Groq** — Llama 4 Scout, Llama 4 Maverick, Qwen QwQ

Servers can bring their own API keys, set custom system prompts, adjust token limits, and configure per-user cooldowns. The AI module also has access to tools — it can control music playback, search the web, and more.

### Music

Full music player with queue management, playback controls, and audio filters. Supports YouTube and Spotify links out of the box through discord-player and yt-dlp.

**Filters:** Bass Boost, Nightcore, Vaporwave, 8D Audio, Karaoke, Tremolo, Vibrato, Lo-Fi, Phaser, Chorus, Flanger, Treble Boost.

### Voice Recording

Record voice channels with per-user multitrack output. Each participant gets their own audio track with silence-padded timing so tracks stay aligned. Configurable bitrate and duration limits.

### Moderation

Standard mod toolkit — warn, kick, ban, timeout, purge — with case tracking, automatic escalation (e.g. 3 warnings triggers a timeout), DM notifications, and a modlog channel.

### AutoMod

Rule-based content filtering with flexible conditions (regex, contains, starts with, role checks) and configurable actions (delete, warn, timeout, kick, ban, DM, log). Rules support AND/OR logic, per-rule cooldowns, and channel/role exemptions.

### Tickets

Deployable ticket panels with button-based creation. Tickets are created as threads with full lifecycle management — open, claim, add/remove users, set priority, and auto-generate transcripts on close. Idle tickets can be swept automatically.

### Welcome Messages

Canvas-rendered welcome images with a visual editor on the dashboard. Place text, images, shapes, and user avatars on a customizable background. Supports fonts, shadows, opacity, rotation, and borders.

### Reaction Roles

Button and dropdown-based role assignment panels. Deploy to any channel with customizable button styles and embed formatting. No emoji reactions needed.

### Temporary Voice Channels

Lobby-based system where joining a designated channel spawns a personal voice channel. Supports naming templates (`{username}`, `{displayname}`), user limits, and category assignment. Channels auto-delete when empty.

### Alerts

Monitor external platforms and post updates to Discord:

- **Twitch** — Stream go-live notifications via EventSub
- **YouTube** — New video/upload alerts
- **GitHub** — Repository activity
- **RSS** — Any RSS feed

### Logging

Audit logging with per-category toggles: message edits/deletes, member joins/leaves, role changes, channel changes, and invite tracking. Everything goes to a designated log channel with timestamped embeds.

### Anti-Raid

Velocity-based join flood detection. Configurable thresholds (X joins in Y seconds) with automatic channel lockdown during detected raids.

### And More

- **Events** — Schedule server events with timezone support
- **Tags** — Reusable text/embed snippets with autocomplete
- **Polls** — Native Discord polls with visual result bars
- **Milestones** — Track and celebrate member activity milestones
- **Verification** — Button-based gate verification with role assignment
- **Triggers** — Receive webhooks from GitHub, Twitch, or custom sources and post formatted embeds
- **Embeds** — Build and send custom embeds via slash command or modal

## Web Dashboard

The dashboard runs as a separate service on Nuxt 4. It connects to the same Postgres backend as the bot and leverages `nuxt-auth-utils` for Discord OAuth, letting server admins configure modules, preview welcome images, manage recordings, and monitor bot health — all through a browser.

SSR is disabled for dashboard routes (they require Discord OAuth), while public pages like the landing page are server-rendered.

## Stack

| Layer | Tech |
|-------|------|
| Bot | Discord.js 14, discord-player, Node 22, TypeScript |
| Web | Nuxt 4, nuxt-auth-utils, @nuxt/ui, Tailwind CSS, Pinia |
| AI | Anthropic Claude, OpenAI, Groq, Google Gemini |
| Backend | Postgres, Redis, Cloudflare R2 |
| Infra | Docker Compose, GHCR, pnpm workspaces |

## Self-Hosting

For detailed instructions on how to set up MODUS using Docker (with prebuilt images or from source) or for native development, please see our [Installation Guide](INSTALLATION.md).

## Project Structure

```
bot/                    Discord bot
  modules/              Feature plugins (auto-loaded)
  lib/                  Shared utilities
  ModuleManager.ts      Plugin loader and interaction router
  DatabaseService.ts    Postgres database layer

web/                    Nuxt 4 dashboard
  app/pages/            File-based routing
  app/composables/      Vue composition hooks
  server/api/           Backend API routes
```

Modules are self-contained — drop a file in `bot/modules/` and it gets picked up automatically. No registration step required.

## License

MIT — see [LICENSE](LICENSE).
