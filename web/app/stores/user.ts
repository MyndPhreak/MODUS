import { defineStore } from "pinia";
import { type Models, ID } from "appwrite";

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

export const useUserStore = defineStore("user", {
  state: () => ({
    user: null as Models.User<any> | null,
    session: null as Models.Session | null,
    discord: null as DiscordProfile | null,
    isLoggedIn: false,
    loading: false,
    initialized: false, // track whether we've checked the session
  }),

  // Only persist Discord profile data – isLoggedIn is always revalidated
  persist: {
    pick: ["discord"],
  },

  getters: {
    userName(): string {
      return this.discord?.username || this.user?.name || "User";
    },
    userAvatar(): string {
      return this.discord?.avatarUrl || "";
    },
    userEmail(): string {
      return this.user?.email || "";
    },
    discordId(): string | null {
      return this.discord?.id || null;
    },
    userGuilds(): DiscordGuild[] {
      return this.discord?.guilds || [];
    },
  },

  actions: {
    getAppwrite() {
      return useAppwrite();
    },

    /**
     * Called once on app startup. Validates the session with Appwrite.
     * If no valid session exists, resets state.
     */
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

    async register(email: string, password: string, name: string) {
      this.loading = true;
      try {
        const { account } = this.getAppwrite();
        await account.create(ID.unique(), email, password, name);
        await this.login(email, password);
      } finally {
        this.loading = false;
      }
    },

    async login(email: string, password: string) {
      this.loading = true;
      try {
        const { account } = this.getAppwrite();
        await account.createEmailPasswordSession(email, password);
        await this.fetchUserSession();
      } finally {
        this.loading = false;
      }
    },

    async loginWithDiscord() {
      if (import.meta.server) return;

      try {
        // Clear existing session if any (especially anonymous)
        const { account } = this.getAppwrite();
        try {
          await account.deleteSession("current");
        } catch {
          // Ignore if no session
        }

        // Navigate to the server-side OAuth initiation route.
        // This uses node-appwrite's createOAuth2Token to avoid
        // cross-origin cookie issues with client-side createOAuth2Session.
        window.location.href = "/api/auth/discord";
      } catch (err: any) {
        console.error("Discord OAuth initialization failed:", err);
        throw err;
      }
    },

    /**
     * Fetch and validate the current session from Appwrite.
     * If the session is a Discord OAuth session, also fetch Discord profile + guilds.
     */
    async fetchUserSession() {
      if (import.meta.server) return;

      const { account, client } = this.getAppwrite();
      const config = useRuntimeConfig();

      try {
        // Try to use the session secret from our cookie (set by server-side OAuth callback)
        const projectId = config.public.appwriteProjectId;
        const sessionCookie = useCookie(`a_session_${projectId}`);
        if (sessionCookie.value) {
          client.setSession(sessionCookie.value);
        }

        const session = await account.getSession("current");
        this.session = session;
        this.isLoggedIn = true;

        const userDetails = await account.get();
        this.user = userDetails;

        // Fetch Discord profile data
        // Always use server API since SSR OAuth sessions don't expose
        // providerAccessToken on the client-side getSession response
        if (session.provider === "discord" || session.provider === "oauth2") {
          try {
            let profileData: any = null;
            let guildsData: any[] = [];

            // First try: direct fetch if token happens to be available (rare with SSR flow)
            if (session.providerAccessToken) {
              try {
                [profileData, guildsData] = await Promise.all([
                  this.fetchDiscordUserData(session.providerAccessToken),
                  this.fetchDiscordGuilds(session.providerAccessToken),
                ]);
              } catch {
                // Token might be expired, fall through to server API
                console.warn(
                  "[UserStore] Direct Discord fetch failed, trying server API...",
                );
              }
            }

            // Second try: server API which uses admin key to access provider tokens
            if (!profileData) {
              try {
                const response = await fetch("/api/discord/me");
                if (response.ok) {
                  const data = await response.json();
                  profileData = data.profile;
                  guildsData = data.guilds || [];
                }
              } catch {
                console.warn(
                  "[UserStore] Server Discord API unavailable, keeping persisted data",
                );
              }
            }

            if (profileData) {
              // Use existing persisted avatar if new data doesn't have one
              // (happens when token is expired and we fall back to Appwrite identity)
              const avatarHash = profileData.avatar || this.discord?.avatar;
              const discordId = profileData.id;

              const avatarUrl = avatarHash
                ? `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${avatarHash.startsWith("a_") ? "gif" : "webp"}?size=256`
                : `https://cdn.discordapp.com/embed/avatars/${(parseInt(profileData.discriminator) || 0) % 5}.png`;

              this.discord = {
                id: discordId,
                username:
                  profileData.username ||
                  profileData.global_name ||
                  this.discord?.username ||
                  "User",
                discriminator: profileData.discriminator || "0",
                avatar: avatarHash,
                avatarUrl,
                guilds:
                  guildsData.length > 0
                    ? guildsData.map((g: any) => ({
                        id: g.id,
                        name: g.name,
                        icon: g.icon,
                        owner: g.owner,
                        permissions: g.permissions,
                      }))
                    : this.discord?.guilds || [], // Preserve existing guilds if new data has none
              };
            }
          } catch (err) {
            console.error(
              "[UserStore] Failed to fetch Discord user data:",
              err,
            );
          }
        }

        // Sync session to cookie for server-side accessibility
        this.syncCookies(session.$id, userDetails.$id);
      } catch {
        this.clearState();
      }
    },

    syncCookies(sessionId: string, userId: string) {
      const config = useRuntimeConfig();
      const cookieOpts = {
        sameSite: "lax" as const,
        secure: !import.meta.dev,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      };

      // Note: We do NOT overwrite `a_session_*` here.
      // The server-side OAuth callback sets it to the session SECRET,
      // and overwriting with the session ID would break authentication.

      const userCookie = useCookie(
        `a_user_${config.public.appwriteProjectId}`,
        cookieOpts,
      );
      userCookie.value = userId;
    },

    clearCookies() {
      const config = useRuntimeConfig();
      const sessionCookie = useCookie(
        `a_session_${config.public.appwriteProjectId}`,
      );
      sessionCookie.value = null;

      const userCookie = useCookie(`a_user_${config.public.appwriteProjectId}`);
      userCookie.value = null;
    },

    clearState() {
      this.user = null;
      this.session = null;
      this.discord = null;
      this.isLoggedIn = false;
    },

    async logout() {
      const { account } = this.getAppwrite();
      try {
        await account.deleteSession("current");
      } catch (error) {
        console.error("Error deleting session:", error);
      }
      this.clearState();
      this.clearCookies();
      navigateTo("/login");
    },

    async fetchDiscordUserData(accessToken: string) {
      const response = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch Discord user data");
      }

      return response.json();
    },

    async fetchDiscordGuilds(accessToken: string): Promise<any[]> {
      const response = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        console.warn("Failed to fetch Discord guilds:", response.status);
        return [];
      }

      return response.json();
    },
  },
});
