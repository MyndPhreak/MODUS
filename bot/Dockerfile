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

RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

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

# Install ALL workspace dependencies with the frozen root lockfile. Running
# install with scripts enabled lets packages like youtubei.js produce their
# postinstall dist/ output. YOUTUBE_DL_SKIP_PYTHON_CHECK stops youtube-dl-exec
# from failing on this stage (yt-dlp is installed via pip in stage 2).
RUN YOUTUBE_DL_SKIP_PYTHON_CHECK=1 pnpm install --frozen-lockfile

# Copy bot source and compile TS → JS
COPY bot/ ./bot/
RUN pnpm --filter bot run build

# Produce a deployable, production-pruned directory containing the bot plus
# its resolved workspace dependencies (@modus/db built output included).
RUN pnpm --filter bot deploy --prod --legacy /deploy/bot

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-slim AS production

# System deps:
#   - ffmpeg:   audio transcoding + buffered streaming
#   - python3:  required by yt-dlp
#   - yt-dlp:   YouTube audio URL resolution
#   - ca-certs: HTTPS to YouTube/Discord
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    ca-certificates \
    && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp \
    && apt-get purge -y python3-pip python3-venv \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Self-contained bot deployment: package.json + node_modules + dist.
COPY --from=builder /deploy/bot ./

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "const http = require('http'); http.get('http://localhost:' + (process.env.BOT_PORT || 3000), (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000

CMD ["node", "dist/index.js"]
