# ─────────────────────────────────────────────────────────────────────────────
# Discord Bot — Multi-stage Docker build
# Optimized for Unraid / any Docker host
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

WORKDIR /app

# Copy dependency manifests first (Docker layer caching)
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (including devDependencies for TypeScript build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Compile TypeScript → JavaScript
RUN pnpm run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-slim AS production

# Install system dependencies:
#   - ffmpeg:   Audio transcoding + buffered streaming
#   - python3:  Required by yt-dlp
#   - yt-dlp:   YouTube audio URL resolution
#   - ca-certs: HTTPS connections to YouTube/Discord
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

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only (no devDependencies)
# --ignore-scripts: youtubei.js postinstall runs `npm install` which isn't
# available in the slim image; all native addons were already built in the
# builder stage so lifecycle scripts aren't needed here.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Health check — hits the bot's built-in health server
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "const http = require('http'); http.get('http://localhost:' + (process.env.BOT_PORT || 3000), (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Expose health check port (configurable via BOT_PORT env var)
EXPOSE 3000

# Run the bot
CMD ["node", "dist/index.js"]
