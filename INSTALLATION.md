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
