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

// Module-level deduplication: prevents concurrent fetchUserSession calls
// from triggering duplicate /api/discord/me requests.
let _pendingSessionFetch: Promise<void> | null = null;

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
    /**
     * True when the current user is a bot admin.
     *
     * Legacy (Appwrite): uses the `admin` label on the Appwrite user.
     * Native: Appwrite users don't exist, so we fall back to the
     * comma-separated NUXT_PUBLIC_BOT_ADMIN_IDS env (also consulted as a
     * fallback in legacy mode so an operator can grant admin without
     * touching Appwrite).
     */
    isAdmin(): boolean {
      if (this.user?.labels?.includes("admin")) return true;
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
     * Deduplicates concurrent calls — if a fetch is already in-flight, callers
     * share the same promise to avoid duplicate Discord API requests (429s).
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

    /** Internal implementation — do not call directly. */
    async _fetchUserSessionImpl() {
      const { account, client } = this.getAppwrite();
      const config = useRuntimeConfig();

      // ── Detect which auth backend owns the current request ────────────
      // /api/auth/session returns { backend: "native" | "appwrite" | null }.
      // Native mode skips the Appwrite SDK entirely.
      let backend: "native" | "appwrite" | null = null;
      try {
        const status = await $fetch<{
          backend: "native" | "appwrite" | null;
          user: { id: string } | null;
        }>("/api/auth/session", { credentials: "include" });
        backend = status.backend;
      } catch {
        // /api/auth/session failure is non-fatal — fall through to Appwrite.
        backend = null;
      }

      if (backend === "native") {
        await this._hydrateFromNativeSession();
        return;
      }

      try {
        // Try to use the session secret from our cookie (set by server-side OAuth callback)
        const projectId = config.public.appwriteProjectId;
        const sessionCookie = useCookie(`a_session_${projectId}`);
        console.log(
          `[UserStore] Session cookie present: ${!!sessionCookie.value}, Project ID: ${projectId}`,
        );
        if (sessionCookie.value) {
          client.setSession(sessionCookie.value);
        }

        const session = await account.getSession("current");
        this.session = session;
        this.isLoggedIn = true;

        console.log(
          `[UserStore] Session loaded — Provider: ${session.provider}, Has providerAccessToken: ${!!session.providerAccessToken}, Token length: ${session.providerAccessToken?.length || 0}`,
        );

        const userDetails = await account.get();
        this.user = userDetails;
        console.log(
          `[UserStore] User loaded — ID: ${userDetails.$id}, Name: ${userDetails.name}`,
        );

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
                console.log(
                  "[UserStore] Fetching Discord profile from server API...",
                );
                const response = await fetch("/api/discord/me", {
                  credentials: "include",
                });
                console.log(
                  `[UserStore] Server API response: ${response.status} ${response.statusText}`,
                );
                if (response.ok) {
                  const data = await response.json();
                  console.log(
                    `[UserStore] Server API data — Profile ID: ${data.profile?.id}, Avatar: ${data.profile?.avatar}, Guilds: ${data.guilds?.length ?? 0}`,
                  );
                  profileData = data.profile;
                  guildsData = data.guilds || [];
                } else {
                  const errorText = await response.text();
                  console.error(
                    `[UserStore] Server API error body:`,
                    errorText,
                  );
                }
              } catch (serverErr) {
                console.warn(
                  "[UserStore] Server Discord API unavailable, keeping persisted data",
                  serverErr,
                );
              }
            }

            if (profileData) {
              // Use existing persisted avatar if new data doesn't have one
              // (happens when token is expired and we fall back to Appwrite identity)
              const avatarHash = profileData.avatar || this.discord?.avatar;
              const discordId = profileData.id;

              console.log(
                `[UserStore] Building profile — Discord ID: ${discordId}, Avatar hash: ${avatarHash}, Guilds count: ${guildsData.length}`,
              );

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
                    : [], // Clear stale or leaked guilds. If token expired, forces re-sync rather than preserving old leaked bot guilds.
              };

              // Log admin check info
              const adminIds = (config.public.botAdminIds || "")
                .split(",")
                .map((id: string) => id.trim())
                .filter(Boolean);
              console.log(
                `[UserStore] Admin check — Discord ID: ${discordId}, Admin IDs config: "${config.public.botAdminIds}", Parsed: [${adminIds.join(", ")}], Is admin: ${adminIds.includes(discordId)}`,
              );
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

    /**
     * Hydrate from the native sealed-cookie session.
     *
     * No Appwrite SDK calls — the profile + guilds come from /api/discord/me
     * which reads the sealed session server-side and pulls fresh data from
     * Discord (with silent token refresh when needed). On native auth the
     * Pinia `user` / `session` slots aren't populated; callers that need
     * Appwrite-shaped user data should rely on the `discord` slot.
     */
    async _hydrateFromNativeSession() {
      this.isLoggedIn = true;
      this.user = null;
      this.session = null;

      let profileData: any = null;
      let guildsData: any[] = [];

      try {
        const response = await fetch("/api/discord/me", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          profileData = data.profile;
          guildsData = data.guilds || [];
        }
      } catch (err) {
        console.warn("[UserStore] /api/discord/me failed (native):", err);
      }

      if (!profileData) {
        this.clearState();
        return;
      }

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
            : [],
      };
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
      const pid = config.public.appwriteProjectId;

      const cookieOpts = { path: "/" };
      const sessionCookie = useCookie(`a_session_${pid}`, cookieOpts);
      sessionCookie.value = null;

      const userCookie = useCookie(`a_user_${pid}`, cookieOpts);
      userCookie.value = null;

      // Clear Discord OAuth cookies set during login callback
      const discordToken = useCookie(`discord_token_${pid}`, cookieOpts);
      discordToken.value = null;

      const discordExpiry = useCookie(
        `discord_token_expiry_${pid}`,
        cookieOpts,
      );
      discordExpiry.value = null;

      const discordUid = useCookie(`discord_uid_${pid}`, cookieOpts);
      discordUid.value = null;
    },

    clearState() {
      this.user = null;
      this.session = null;
      this.discord = null;
      this.isLoggedIn = false;
    },

    async logout() {
      // Best-effort Appwrite server-side session delete — silently skipped
      // in native mode (no active Appwrite session) but still attempted so
      // a legacy session is torn down if one exists.
      const { account } = this.getAppwrite();
      try {
        await account.deleteSession("current");
      } catch {
        // No active Appwrite session, or network blip — proceed either way.
      }

      // Clear every cookie on our domain, native + legacy, in one server call.
      try {
        await $fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.warn("[UserStore] /api/auth/logout failed:", err);
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
