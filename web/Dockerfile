# ─────────────────────────────────────────────────────────────────────────────
# Web Dashboard (Nuxt 4) — Multi-stage Docker build (workspace-aware)
#
# Build context is the repo root so pnpm can resolve the full workspace
# (root lockfile + workspace members including @modus/db). Nuxt's build
# produces a self-contained server bundle in .output/ which is all the
# production stage needs.
#
#   docker build -f web/Dockerfile -t modus-web .
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

WORKDIR /repo

# Copy workspace manifests first (Docker layer caching).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY web/package.json ./web/
COPY bot/package.json ./bot/
COPY packages/db/package.json ./packages/db/
COPY bot/patches ./bot/patches
COPY web/.npmrc ./web/

# The root postinstall hook builds @modus/db; it needs the db package's
# source and tsconfig present before pnpm install runs.
COPY packages/db/tsconfig.json ./packages/db/
COPY packages/db/src ./packages/db/src

# Install all workspace deps with frozen root lockfile.
RUN pnpm install --frozen-lockfile

# Copy web source and build Nuxt. Output is .output/ — a self-contained Node
# server bundle with all runtime dependencies pre-bundled.
COPY web/ ./web/
RUN pnpm --filter web run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-slim AS production

# ffprobe (in ffmpeg) is used by upload-announce recording validation.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /repo/web/.output ./.output

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "const http = require('http'); http.get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000

ENV HOST=0.0.0.0
ENV PORT=3000
CMD ["node", ".output/server/index.mjs"]
