<p align="center">
  <img src="https://modus.ppo.gg/modus2-animated.svg" alt="MODUS" width="280" />
</p>

<h3 align="center">A modular Discord bot with a web dashboard.</h3>

<p align="center">
  Music, moderation, AI, anti-raid, recordings, tickets, and more — 20+ features you can toggle per server.
</p>

---

## Features

- **Music** — Spotify/YouTube playback with effects, queue management, and real-time dashboard sync
- **Recording** — Multi-speaker voice recording with waveform visualization and segment playback
- **AI Chat** — Multi-provider conversational AI with web search (SearXNG), per-guild config, and audit logging
- **Moderation** — Kick/ban/mute, automod (spam & profanity rules), and audit trails
- **Anti-Raid** — Join velocity detection to shut down raids automatically
- **Tickets** — Thread-based ticket system with types, priorities, claims, and transcripts
- **Reaction Roles** — Button panels and dropdown selectors
- **Welcome** — Customizable join messages with server-rendered welcome images
- **Polls** — Native Discord polls via modal
- **Triggers** — Webhook router for external automation (GitHub, etc.)
- **Temporary Voice** — Auto-created voice channels that clean up when empty
- **Social Alerts** — Twitch go-live notifications via EventSub
- **Events, Tags, Milestones, Verification** — and more

## Project Structure

```
bot/          Discord bot (discord.js, modules, Appwrite service)
web/          Web dashboard (Nuxt 4, API routes, OAuth)
```

## Setup

Copy the example env files and fill in your credentials:

```sh
cp bot/.env.example bot/.env
cp web/.env.example web/.env
```

### Docker (recommended)

```sh
docker compose up -d
```

### Local development

```sh
pnpm install

# Bot
cd bot && pnpm dev

# Web
cd web && pnpm dev
```

The bot runs on port `3000` (health check) and the web dashboard on `3001` by default.

## License

Source-available — not designed for self-hosting.

## Stack

| Layer | Tech |
|-------|------|
| Bot | Discord.js 14, discord-player, Node 22, TypeScript |
| Web | Nuxt 4, @nuxt/ui, Tailwind CSS, Pinia |
| AI | Anthropic Claude, OpenAI, Groq, Google Gemini |
| Database | Appwrite (collections + file storage) |
| Infra | Docker Compose, GHCR, pnpm workspaces |
