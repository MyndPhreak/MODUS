# ─────────────────────────────────────────────────────────────────────────────
# Web Dashboard (Nuxt 4) — Multi-stage Docker build
# Optimized for Unraid / any Docker host
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

WORKDIR /app

# Copy dependency manifests + .npmrc first (Docker layer caching)
COPY package.json pnpm-lock.yaml .npmrc ./

# Install ALL dependencies (including devDependencies for Nuxt build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the Nuxt application for production (outputs to .output/)
RUN pnpm run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-slim AS production

WORKDIR /app

# Copy the self-contained Nuxt server output
COPY --from=builder /app/.output ./.output

# Health check — hits the Nuxt Nitro server
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "const http = require('http'); http.get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

EXPOSE 3000

# Nuxt production server entry point
ENV HOST=0.0.0.0
ENV PORT=3000
CMD ["node", ".output/server/index.mjs"]
