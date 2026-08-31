# ─────────────────────────────────────────────────────────────────────────────
# Discord Bot — Multi-stage Docker build (workspace-aware)
#
# Build context is the repo root so pnpm can resolve the full workspace
# (root lockfile + workspace members). `pnpm deploy` then produces a
# self-contained, pruned directory for the production stage.
#
#   docker build -f bot/Dockerfile -t modus-bot .
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

# @discordjs/opus doesn't always ship a prebuilt binary for the current Node
# ABI (e.g. no node-v127 build for 0.10.0 — https://github.com/discordjs/opus/releases).
# When that happens it falls back to compiling from source via node-gyp, which
# needs Python + a C++ toolchain.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# Copy workspace manifests first (Docker layer caching).
# patches/ must be present before pnpm install because pnpm hashes patch files.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY bot/package.json ./bot/
COPY web/package.json ./web/
COPY packages/db/package.json ./packages/db/
COPY bot/patches ./bot/patches

# The root postinstall hook compiles @modus/db (tsc), so we need its source
# and tsconfig present before `pnpm install` runs.
COPY packages/db/tsconfig.json ./packages/db/
COPY packages/db/src ./packages/db/src

# Install ALL workspace dependencies with the frozen root lockfile. Scripts stay
# enabled so native voice packages (@discordjs/opus, sodium-native) build their
# bindings for this image.
RUN pnpm install --frozen-lockfile

# Copy bot source and compile TS → JS
COPY bot/ ./bot/
RUN pnpm --filter bot run build

# Produce a deployable, production-pruned directory containing the bot plus
# its resolved workspace dependencies (@modus/db built output included).
RUN pnpm --filter bot deploy --prod --legacy /deploy/bot

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-slim AS production

# System deps:
#   - ffmpeg:   recording (PCM → OGG Opus) and TTS decode, spawned from PATH
#   - ca-certs: HTTPS to Discord, R2, and the Lavalink fleet
#
# Music extraction and decoding belong to Lavalink now, so this image no longer
# carries a Python media-download toolchain.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Self-contained bot deployment: package.json + node_modules + dist.
COPY --from=builder /deploy/bot ./

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "const http = require('http'); http.get('http://localhost:' + (process.env.BOT_PORT || 3000), (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000

CMD ["node", "dist/index.js"]
