import { defineStore } from "pinia";

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface DiscordProfile {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  avatarUrl: string;
  guilds: DiscordGuild[];
}

/** Shape returned by /api/auth/session. */
interface SessionResponse {
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    globalName?: string | null;
  } | null;
  tokenExpiresAt: number | null;
}

// Module-level deduplication: prevents concurrent fetchUserSession calls
// from triggering duplicate /api/discord/me requests.
let _pendingSessionFetch: Promise<void> | null = null;

export const useUserStore = defineStore("user", {
  state: () => ({
    discord: null as DiscordProfile | null,
    isLoggedIn: false,
    loading: false,
    initialized: false,
  }),

  // Only persist the Discord profile — isLoggedIn is always revalidated
  // against /api/auth/session on app startup.
  persist: {
    pick: ["discord"],
  },

  getters: {
    userName(): string {
      return this.discord?.username || "User";
    },
    userAvatar(): string {
      return this.discord?.avatarUrl || "";
    },
    discordId(): string | null {
      return this.discord?.id || null;
    },
    userGuilds(): DiscordGuild[] {
      return this.discord?.guilds || [];
    },
    /**
     * Back-compat shim for pages that still read `userStore.user?.$id`
     * or `userStore.user?.name`. The native-auth user identity is the
     * Discord profile; these getters expose it with the old field names
     * so existing callers keep working until they're individually
     * migrated. New code should read `discord` directly.
     */
    user(): {
      $id: string;
      name: string;
      labels: string[];
      email: string;
    } | null {
      if (!this.discord) return null;
      return {
        $id: this.discord.id,
        name: this.discord.username,
        labels: [],
        email: "",
      };
    },
    /** Back-compat shim — native auth has no email. */
    userEmail(): string {
      return "";
    },
    /**
     * True when the current Discord user is listed in
     * NUXT_PUBLIC_BOT_ADMIN_IDS. Admin designation has no DB-side presence
     * in the native-auth flow — it's managed purely via env config.
     */
    isAdmin(): boolean {
      const discordId = this.discord?.id;
      if (!discordId) return false;
      const config = useRuntimeConfig();
      const adminIds = (config.public.botAdminIds || "")
        .split(",")
        .map((id: string) => id.trim())
        .filter(Boolean);
      return adminIds.includes(discordId);
    },
  },

  actions: {
    /** Called once on app startup. Probes /api/auth/session and hydrates. */
    async init() {
      if (this.initialized || import.meta.server) return;
      this.loading = true;
      try {
        await this.fetchUserSession();
      } catch {
        this.clearState();
      } finally {
        this.loading = false;
        this.initialized = true;
      }
    },

    loginWithDiscord() {
      if (import.meta.server) return;
      // Server-side route handles the OAuth redirect; the CSRF state cookie
      // is set there too.
      window.location.href = "/api/auth/discord";
    },

    /**
     * Fetch and validate the current session. Dedups concurrent callers
     * onto a single in-flight request — avoids double-hitting
     * /api/discord/me (and thus Discord's 1-req/s user-level rate limit)
     * when multiple components mount at once.
     */
    async fetchUserSession() {
      if (import.meta.server) return;
      if (_pendingSessionFetch) return _pendingSessionFetch;
      _pendingSessionFetch = this._fetchUserSessionImpl();
      try {
        await _pendingSessionFetch;
      } finally {
        _pendingSessionFetch = null;
      }
    },

    async _fetchUserSessionImpl() {
      let session: SessionResponse;
      try {
        session = await $fetch<SessionResponse>("/api/auth/session", {
          credentials: "include",
        });
      } catch {
        this.clearState();
        return;
      }

      if (!session.user) {
        this.clearState();
        return;
      }

      this.isLoggedIn = true;

      // Hydrate Discord profile + guilds from the server, which holds the
      // access token and handles silent refresh. Failure keeps the user
      // logged in but with stale persisted `discord` data.
      try {
        const { profile, guilds } = await $fetch<{
          profile: any;
          guilds: any[];
        }>("/api/discord/me", { credentials: "include" });

        const avatarHash = profile.avatar || this.discord?.avatar;
        const discordId = profile.id;
        const avatarUrl = avatarHash
          ? `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${avatarHash.startsWith("a_") ? "gif" : "webp"}?size=256`
          : `https://cdn.discordapp.com/embed/avatars/${(parseInt(profile.discriminator) || 0) % 5}.png`;

        this.discord = {
          id: discordId,
          username:
            profile.username ||
            profile.global_name ||
            this.discord?.username ||
            "User",
          discriminator: profile.discriminator || "0",
          avatar: avatarHash,
          avatarUrl,
          guilds: (guilds || []).map((g: any) => ({
            id: g.id,
            name: g.name,
            icon: g.icon,
            owner: g.owner,
            permissions: g.permissions,
          })),
        };
      } catch (err) {
        console.warn("[UserStore] /api/discord/me failed:", err);
      }
    },

    clearState() {
      this.discord = null;
      this.isLoggedIn = false;
    },

    async logout() {
      try {
        await $fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.warn("[UserStore] /api/auth/logout failed:", err);
      }
      this.clearState();
      navigateTo("/login");
    },
  },
});
