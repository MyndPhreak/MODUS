<p align="center">
  <img src="https://modus.ppo.gg/modus2-animated.svg" alt="MODUS" width="200" />
</p>

<h1 align="center">MODUS</h1>
<p align="center"><strong>Modular Discord Utility System</strong></p>
<p align="center">A self-hosted Discord bot and web dashboard built around a plugin-based architecture. 25+ modules, one bot.</p>

---

## What is MODUS?

MODUS is a Discord bot designed to replace the pile of single-purpose bots most servers end up with. Instead of running five different bots for moderation, music, welcome messages, tickets, and logging, MODUS handles all of it through independent modules that can be toggled on or off per server.

It ships with a web dashboard (built on Nuxt 4) for configuring everything without touching slash commands, and uses Appwrite as its database backend.

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

The dashboard runs as a separate service on Nuxt 4. It connects to the same Appwrite backend as the bot and lets server admins configure modules, preview welcome images, manage recordings, and monitor bot health — all through a browser.

SSR is disabled for dashboard routes (they require Discord OAuth), while public pages like the landing page are server-rendered.

## Tech Stack

| | |
|---|---|
| **Bot** | discord.js v14, discord-player, yt-dlp, FFmpeg |
| **AI** | Anthropic SDK, OpenAI SDK, Groq |
| **Web** | Nuxt 4, Vue 3, Tailwind CSS, @nuxt/ui |
| **Database** | Appwrite |
| **Validation** | Zod v4 |
| **Runtime** | Node.js 22 |
| **Package Manager** | pnpm |

## Self-Hosting

### Requirements

- Node.js 22+
- pnpm 10.9+
- An [Appwrite](https://appwrite.io/) instance
- A Discord application with bot token
- FFmpeg and yt-dlp (for music/recording — included in Docker image)

### With Docker

```sh
docker compose up -d
```

This starts both services — the bot on port 3005 and the dashboard on port 3000. Copy `.env.example` in both `bot/` and `web/` to `.env` and fill in your credentials first.

### Without Docker

```sh
# Bot
cd bot
pnpm install
pnpm run setup-db    # first time only — creates Appwrite collections
pnpm run dev

# Web (separate terminal)
cd web
pnpm install
pnpm run dev
```

### Environment Variables

Both services need their own `.env` file. See `bot/.env.example` and `web/.env.example` for the full list. At minimum you'll need:

- Discord bot token and application ID
- Appwrite endpoint, project ID, and API key
- AI provider API keys (for the AI module)

## Project Structure

```
bot/                    Discord bot
  modules/              Feature plugins (auto-loaded)
  lib/                  Shared utilities
  ModuleManager.ts      Plugin loader and interaction router
  AppwriteService.ts    Database layer

web/                    Nuxt 4 dashboard
  app/pages/            File-based routing
  app/composables/      Vue composition hooks
  server/api/           Backend API routes
```

Modules are self-contained — drop a file in `bot/modules/` and it gets picked up automatically. No registration step required.

## License

ISC
