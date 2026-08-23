export default defineNuxtConfig({
  compatibilityDate: "2024-04-03",
  devtools: { enabled: true },
  modules: [
    "@nuxt/ui",
    "@pinia/nuxt",
    "pinia-plugin-persistedstate/nuxt",
    "nuxt-auth-utils",
  ],
  app: {
    head: {
      title: "MODUS | Modular Discord Utility System",
      // titleTemplate is set at runtime in app.vue via useHead — the static
      // config here only accepts a string template, but we need function
      // logic to avoid double-wrapping the default title (see app.vue).
      link: [{ rel: "icon", type: "image/svg+xml", href: "/modus.svg" }],
      meta: [
        {
          name: "description",
          content:
            "MODUS | A modular system for managing and configuring your Discord bot.",
        },
      ],
    },
  },
  icon: {
    serverBundle: "local",
    clientBundle: {
      scan: true,
      sizeLimitKb: 512,
    },
  },
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    discordBotToken: "", // Set via NUXT_DISCORD_BOT_TOKEN
    renderApiKey: "", // Shared secret for bot→dashboard render API — Set via NUXT_RENDER_API_KEY
    // ── Discord OAuth (nuxt-auth-utils) ───────────────────────────────────
    // /api/auth/discord + /api/auth/callback run the OAuth flow directly;
    // sessions are sealed into a cookie by nuxt-auth-utils. Set
    // NUXT_SESSION_PASSWORD to a 32+ char random string.
    discordClientSecret: "", // Set via NUXT_DISCORD_CLIENT_SECRET
    // Base URL of the bot's HTTP server (server-side only, never sent to browser)
    // Docker: http://bot:3005  |  Non-Docker: https://modus-bot.ppo.gg
    botWebhookUrl: "http://bot:3005", // Set via NUXT_BOT_WEBHOOK_URL
    // Shared secret for the bot's /music control API. Must match BOT_API_SECRET
    // on the bot. When set, unauthenticated calls to the bot are rejected.
    botApiSecret: "", // Set via NUXT_BOT_API_SECRET
    // ── Object storage (Cloudflare R2) ────────────────────────────────────
    // Required for recordings + welcome backgrounds.
    r2AccountId: "", // Set via NUXT_R2_ACCOUNT_ID
    r2AccessKeyId: "", // Set via NUXT_R2_ACCESS_KEY_ID
    r2SecretAccessKey: "", // Set via NUXT_R2_SECRET_ACCESS_KEY
    r2Bucket: "modus-recordings", // Set via NUXT_R2_BUCKET
    r2Endpoint: "", // Set via NUXT_R2_ENDPOINT (optional override)
    r2PresignTtl: "300", // Set via NUXT_R2_PRESIGN_TTL
    cloudflareApiToken: "", // Optional R2 analytics bearer token — Set via NUXT_CLOUDFLARE_API_TOKEN
    // ── Postgres ──────────────────────────────────────────────────────────
    // Required for every server-side data endpoint. When unset the endpoints
    // return 503 rather than silently degrading.
    databaseUrl: "", // Set via NUXT_DATABASE_URL
    public: {
      baseUrl: "https://modus.ppo.gg", // Set via NUXT_PUBLIC_BASE_URL
      webhookBaseUrl: "https://modus.ppo.gg", // Public origin for webhook trigger URLs — Set via NUXT_PUBLIC_WEBHOOK_BASE_URL
      botAdminIds: "", // Comma-separated Discord IDs, set via NUXT_PUBLIC_BOT_ADMIN_IDS
      botUrl: "", // Bot health check URL, set via NUXT_PUBLIC_BOT_URL
      discordClientId: "", // Discord bot client ID, set via NUXT_PUBLIC_DISCORD_CLIENT_ID
    },
  },
  routeRules: {
    // Dashboard pages hydrate after the Pinia user store probes
    // /api/auth/session, so SSR would just render an empty shell.
    // Keeping them SPA-only avoids 404/500 on hard refresh.
    "/dashboard": { ssr: false },
    "/dashboard/**": { ssr: false },
  },
  future: {
    compatibilityVersion: 4,
  },
  vite: {
    server: {
      allowedHosts: ["localhost", "127.0.0.1", "0.0.0.0", "modus.ppo.gg"],
    },
  },
});
