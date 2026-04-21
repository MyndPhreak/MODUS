export default defineNuxtConfig({
  compatibilityDate: "2024-04-03",
  devtools: { enabled: true },
  modules: ["@nuxt/ui", "@pinia/nuxt", "pinia-plugin-persistedstate/nuxt"],
  app: {
    head: {
      title: "MODUS — Modular Discord Utility System",
      link: [{ rel: "icon", type: "image/svg+xml", href: "/modus.svg" }],
      meta: [
        {
          name: "description",
          content:
            "MODUS — A modular system for managing and configuring your Discord bot.",
        },
      ],
    },
  },
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    appwriteApiKey: "", // Set via NUXT_APPWRITE_API_KEY
    discordBotToken: "", // Set via NUXT_DISCORD_BOT_TOKEN
    renderApiKey: "", // Shared secret for bot→dashboard render API — Set via NUXT_RENDER_API_KEY
    // Base URL of the bot's HTTP server (server-side only, never sent to browser)
    // Docker: http://bot:3005  |  Non-Docker: https://modus-bot.ppo.gg
    botWebhookUrl: "http://bot:3005", // Set via NUXT_BOT_WEBHOOK_URL
    // ── Recording storage (R2) ────────────────────────────────────────────
    // When useR2Storage is "true", stream/delete endpoints talk to R2 instead
    // of Appwrite Storage. See web/.env.example for NUXT_R2_* details.
    useR2Storage: "false", // Set via NUXT_USE_R2_STORAGE
    r2AccountId: "", // Set via NUXT_R2_ACCOUNT_ID
    r2AccessKeyId: "", // Set via NUXT_R2_ACCESS_KEY_ID
    r2SecretAccessKey: "", // Set via NUXT_R2_SECRET_ACCESS_KEY
    r2Bucket: "modus-recordings", // Set via NUXT_R2_BUCKET
    r2Endpoint: "", // Set via NUXT_R2_ENDPOINT (optional override)
    r2PresignTtl: "300", // Set via NUXT_R2_PRESIGN_TTL
    public: {
      appwriteEndpoint: "https://api.ppo.gg/v1", // Set via NUXT_PUBLIC_APPWRITE_ENDPOINT
      appwriteProjectId: "69266f6e00118a9f6b58", // Set via NUXT_PUBLIC_APPWRITE_PROJECT_ID
      baseUrl: "https://modus.ppo.gg", // Set via NUXT_PUBLIC_BASE_URL
      webhookBaseUrl: "https://modus.ppo.gg", // Public origin for webhook trigger URLs — Set via NUXT_PUBLIC_WEBHOOK_BASE_URL
      botAdminIds: "", // Comma-separated Discord IDs, set via NUXT_PUBLIC_BOT_ADMIN_IDS
      botUrl: "", // Bot health check URL, set via NUXT_PUBLIC_BOT_URL
      discordClientId: "", // Discord bot client ID, set via NUXT_PUBLIC_DISCORD_CLIENT_ID
    },
  },
  routeRules: {
    // Dashboard pages rely on the client-only Appwrite SDK and require
    // authentication — SSR is impossible and causes 404/500 on refresh.
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
