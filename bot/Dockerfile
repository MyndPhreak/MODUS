# ─────────────────────────────────────────────────────────────────────────────
# Discord Bot — Multi-stage Docker build
# Optimized for Unraid / any Docker host
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

WORKDIR /app

# Copy dependency manifests + patches first (Docker layer caching)
# patches/ must be present before pnpm install because pnpm hashes patch files
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install ALL dependencies (including devDependencies for TypeScript build).
# Running with scripts enabled is required so that packages like youtubei.js
# (installed from the GitHub tarball, not npm) execute their postinstall build
# step and produce their dist/ output.
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Compile TypeScript → JavaScript
RUN pnpm run build

# Prune devDependencies from node_modules in-place so the production stage can
# copy a lean, already-built node_modules without re-running any install.
RUN pnpm prune --prod

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

WORKDIR /app

# Copy manifests (needed for pnpm/Node module resolution metadata at runtime)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Copy the already-built, already-pruned node_modules from the builder stage.
# This avoids re-running pnpm install and preserves all lifecycle-script output
# (e.g. youtubei.js dist/) that --ignore-scripts would have silently dropped.
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Health check — hits the bot's built-in health server
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "const http = require('http'); http.get('http://localhost:' + (process.env.BOT_PORT || 3000), (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Expose health check port (configurable via BOT_PORT env var)
EXPOSE 3000

# Run the bot
CMD ["node", "dist/index.js"]
