# Installing MODUS

This guide covers everything you need to host your own instance of the MODUS Discord bot and its web dashboard. 

MODUS is backed by **Postgres**, **Cloudflare R2** (for recordings and images), and optionally **Redis** (for cache and realtime features). It no longer requires Appwrite.

## Prerequisites

1. **Discord Application**:
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
   - Go to the "Bot" tab, generate a token, and enable the **Message Content Intent**, **Server Members Intent**, and **Presence Intent**.
   - Note down your **Client ID** and **Client Secret** (under OAuth2).
2. **Cloudflare R2**:
   - For storing audio recordings and welcome images. (Free tier is usually sufficient).
   - Create a bucket (e.g., `modus-recordings`).
   - Generate an R2 API token with **Object Read & Write** permissions scoped to your new bucket.
3. **Docker & Docker Compose** (Recommended).
4. **Node.js 22+ & pnpm 10.9+** (Required only for first-time database setup or local development).

## Configuration

MODUS requires two `.env` files: one for the bot and one for the web dashboard.

```sh
# Copy the example environments
cp bot/.env.example bot/.env
cp web/.env.example web/.env
```

Open both `.env` files and fill in your credentials. Both `.env.example` files contain detailed comments explaining each variable.

Key variables you must set:
- **Bot (`bot/.env`)**: `DISCORD_TOKEN`, `CLIENT_ID`, `DATABASE_URL`, `R2_*`
- **Web (`web/.env`)**: `NUXT_DISCORD_BOT_TOKEN`, `NUXT_DISCORD_CLIENT_SECRET`, `NUXT_PUBLIC_DISCORD_CLIENT_ID`, `NUXT_SESSION_PASSWORD`, `NUXT_DATABASE_URL`, `NUXT_R2_*`

Music playback needs one extra secret shared between the bot and its Lavalink node — see [Music Relay (Lavalink)](#music-relay-lavalink) below.

## Music Relay (Lavalink)

Music playback runs on [Lavalink](https://lavalink.dev) v4 rather than inside the bot process. MODUS owns the queue, permissions, and recovery; the Lavalink node only extracts, decodes, and streams audio into Discord voice. `docker-compose.yml` ships a pinned `lavalink` service (Lavalink `4.2.2` + the `youtube-source` `1.18.2` plugin) configured by [lavalink/application.yml](lavalink/application.yml).

### 1. Set the node password

The bot and the node share one secret. Generate it once and write the **same value** to two places — Compose reads the repo-root `.env`, while the bot reads `bot/.env`:

```sh
password="$(openssl rand -hex 24)"
echo "LAVALINK_SERVER_PASSWORD=$password" >> .env
echo "LAVALINK_SERVER_PASSWORD=$password" >> bot/.env
unset password
```

To rotate it, replace the value in both files and restart both services (`docker compose up -d lavalink bot`). Never commit either file, and never paste the password into logs or issue reports.

### 2. Point the bot at its nodes

`LAVALINK_NODES_JSON` in `bot/.env` is a strict JSON array of relay nodes. The default entry matches the bundled service:

```json
[{"id":"local","url":"http://lavalink:2333","password":"${LAVALINK_SERVER_PASSWORD}","region":"local","capabilities":["youtube"],"maxPlayers":20}]
```

| Field | Meaning |
|-------|---------|
| `id` | Stable node name. Queues persist the node a guild was placed on, so don't recycle IDs. |
| `url` | Base URL. `http://lavalink:2333` on the Compose network; **HTTPS is required** for any address that isn't private. |
| `password` | Literal, or `${NAME}` to read a deployment environment variable. |
| `region` | Placement hint used to keep a guild near its voice region. |
| `capabilities` | Sources the node can serve (`youtube`, `youtube-music`, `soundcloud`). Placement only considers nodes that advertise the requested source. |
| `maxPlayers` | Concurrent-player ceiling before placement moves on to the next node. |

Add more objects to the array to spread guilds across several nodes.

### 3. Remote nodes (Tailscale only)

**Never expose Lavalink to the internet.** The bundled service intentionally does not publish port `2333` to the host — it is reachable only from the `modus` Docker network. To run a node on another machine, put both hosts on a [Tailscale](https://tailscale.com) tailnet and use the node's tailnet address:

```
LAVALINK_NODES_JSON=[{"id":"eu-1","url":"http://100.x.y.z:2333","password":"${LAVALINK_SERVER_PASSWORD}","region":"eu","capabilities":["youtube"],"maxPlayers":50}]
```

Bind the remote node to its tailnet interface (or firewall `2333` to the tailnet) and leave it off any public interface. A node needs **no inbound access from the internet**, only outbound: HTTPS to the audio sources, HTTPS to `maven.lavalink.dev` on first boot to fetch the pinned plugin, and UDP to Discord's voice servers — the node connects to Discord voice directly, so a host that blocks outbound UDP will connect but never produce audio.

### 4. Running without music

Music is optional. Leave `LAVALINK_NODES_JSON` empty and the bot logs a warning at startup, skips the relay entirely, and answers every music command with a `MUSIC_RELAY_OFFLINE` error; tickets, moderation, recordings, and the rest of the bot are unaffected. The same applies while the node is merely down — the bot's own health check never fails because music is unavailable, and `bot` is deliberately **not** gated on Lavalink's health in `docker-compose.yml`, so a slow or unhealthy node can't keep the bot from starting. Queues live in Postgres, so playback resumes once a healthy node is back.

## Database Initialization (First Time Only)

Before starting the bot, you need to apply the database schema. If you are using the Postgres container provided in `docker-compose.yml`, start it first:

```sh
# Start Postgres and Redis locally
docker compose up -d postgres redis
```

Wait a moment for Postgres to initialize. Then run the schema migrations using pnpm:

```sh
pnpm install

# Run the schema migration script
DATABASE_URL=postgres://modus:modus@localhost:5432/modus pnpm --filter @modus/db run migrate
```

## Method 1: Prebuilt Docker Containers (Recommended)

We publish prebuilt containers to the GitHub Container Registry. Using these avoids compiling the bot and Nuxt dashboard on your server.

```sh
# Tell docker compose to use the published images
export GHCR_OWNER=myndphreak

# Pull the latest prebuilt images
docker compose pull

# Start the full stack (bot, web, postgres, redis)
docker compose up -d
```

## Method 2: Docker Compose (Build from Source)

If you prefer to build the images yourself locally (e.g., if you made custom modifications):

```sh
docker compose up -d --build
```

## Method 3: Local Development (Native)

For development, you can run the bot and web dashboard natively using Node.js and pnpm.

1. **Start database dependencies**:
   ```sh
   docker compose up -d postgres redis
   ```
2. **Bot** (in a new terminal):
   ```sh
   cd bot
   pnpm run dev
   ```
3. **Web** (in a new terminal):
   ```sh
   cd web
   pnpm run dev
   ```

## Migrating from Appwrite

If you are upgrading an older installation of MODUS that used Appwrite, do not start with a fresh database. Refer to the [Migration Runbook](docs/migration-runbook.md) for detailed instructions on transitioning to Postgres + R2 seamlessly.
