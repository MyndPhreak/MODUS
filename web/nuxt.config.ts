export default defineNuxtConfig({
  compatibilityDate: "2024-04-03",
  devtools: { enabled: true },
  modules: ["@nuxt/ui", "@pinia/nuxt", "pinia-plugin-persistedstate/nuxt"],
  app: {
    head: {
      title: "MODUS — Modular Operational Discord Utility System",
      meta: [
        {
          name: "description",
          content:
            "MODUS — A modular operational system for managing and configuring your Discord bot.",
        },
      ],
    },
  },
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    appwriteApiKey: "", // Set via NUXT_APPWRITE_API_KEY
    discordBotToken: "", // Set via NUXT_DISCORD_BOT_TOKEN
    public: {
      appwriteEndpoint: "https://api.ppo.gg/v1", // Set via NUXT_PUBLIC_APPWRITE_ENDPOINT
      appwriteProjectId: "69266f6e00118a9f6b58", // Set via NUXT_PUBLIC_APPWRITE_PROJECT_ID
      baseUrl: "https://bot.ppo.gg", // Set via NUXT_PUBLIC_BASE_URL
      botAdminIds: "", // Comma-separated Discord IDs, set via NUXT_PUBLIC_BOT_ADMIN_IDS
      botUrl: "", // Bot health check URL, set via NUXT_PUBLIC_BOT_URL
      discordClientId: "", // Discord bot client ID, set via NUXT_PUBLIC_DISCORD_CLIENT_ID
    },
  },
  future: {
    compatibilityVersion: 4,
  },
  vite: {
    server: {
      allowedHosts: ["localhost", "127.0.0.1", "0.0.0.0", "bot.ppo.gg"],
    },
  },
});
