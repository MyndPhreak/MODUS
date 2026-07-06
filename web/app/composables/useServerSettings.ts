import type { GuildConfigDoc, ModuleDoc } from "@modus/db";

/** Minimal guild identity for header/breadcrumb display. */
export interface DashboardGuild {
  id: string;
  name: string;
  icon: string | null;
}

/** Projection returned by GET /api/servers/by-guild-ids. */
export interface ServerSummary {
  $id: string;
  guild_id: string;
  name: string;
  icon: string | null;
  owner_id: string | null;
  admin_user_ids: string[];
  dashboard_role_ids: string[];
  premium: boolean;
}

/** Text channel as returned by GET /api/discord/channels. */
export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  parentId: string | null;
}

/** Role as returned by GET /api/discord/roles. */
export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
  permissions: string;
}

export interface ServerSettingsState {
  guild: DashboardGuild | null;
  modules: ModuleDoc[];
  guildConfigs: GuildConfigDoc[];
  channels: DiscordChannel[];
  channelsLoading: boolean;
  roles: DiscordRole[];
  rolesLoading: boolean;
  loading: boolean;
  unauthorized: boolean;
  dashboardRoleIds: string[];
  isServerOwnerOrAdmin: boolean;
}


export function useServerSettings(guildId: string) {
  // Shared state keyed by guild ID so it persists across child pages
  const state = useState<ServerSettingsState>(
    `server-settings-${guildId}`,
    () => ({
      guild: null,
      modules: [],
      guildConfigs: [],
      channels: [],
      channelsLoading: false,
      roles: [],
      rolesLoading: false,
      loading: true,
      unauthorized: false,
      dashboardRoleIds: [],
      isServerOwnerOrAdmin: false,
    }),
  );

  const userStore = useUserStore();
  const toast = useToast();

  // ── Module Helpers ──
  const isModuleEnabled = (moduleName: string) => {
    const config = state.value.guildConfigs.find(
      (c) => c.moduleName === moduleName.toLowerCase(),
    );
    return config ? config.enabled : true;
  };

  // Keep in sync with web/app/pages/dashboard/server/[guild_id]/modules/*.vue
  // (excluding index.vue, which is the grid itself). Modules without a
  // dedicated settings page — help, ping, reload, say, shard-info — are
  // intentionally omitted.
  const MODULE_SETTINGS_PAGES = new Set([
    "music",
    "moderation",
    "recording",
    "milestones",
    "automod",
    "logging",
    "triggers",
    "ai",
    "antiraid",
    "verification",
    "tickets",
    "alerts",
    "tempvoice",
    "reaction-roles",
    "events",
    "polls",
    "embeds",
    "tags",
    "welcome",
  ]);

  const hasModuleSettings = (moduleName: string): boolean => {
    return MODULE_SETTINGS_PAGES.has(moduleName.toLowerCase());
  };

  const toggleModule = async (moduleName: string, enabled: boolean) => {
    const name = moduleName.toLowerCase();
    try {
      await $fetch(
        `/api/guild-configs/${encodeURIComponent(
          guildId,
        )}/${encodeURIComponent(name)}`,
        { method: "PUT", body: { enabled } },
      );
      // Refresh the config locally — the PUT doesn't return the row.
      const existing = state.value.guildConfigs.find(
        (c) => c.moduleName === name,
      );
      if (existing) {
        existing.enabled = enabled;
      } else {
        state.value.guildConfigs.push({
          id: `${guildId}:${name}`,
          $id: `${guildId}:${name}`,
          guildId,
          moduleName: name,
          enabled,
          settings: "{}",
          updatedAt: new Date(),
          createdAt: new Date(),
        });
      }
      toast.add({
        title: "Success",
        description: `Module ${moduleName} ${enabled ? "enabled" : "disabled"} for this server.`,
        color: "success",
      });
    } catch (error) {
      console.error("Error toggling module:", error);
      toast.add({
        title: "Error",
        description: "Failed to update module status.",
        color: "error",
      });
    }
  };

  // ── Settings persistence ──
  const saveModuleSettings = async (
    moduleName: string,
    settingsPayload: Record<string, any>,
  ) => {
    const name = moduleName.toLowerCase();
    try {
      await $fetch(
        `/api/guild-configs/${encodeURIComponent(
          guildId,
        )}/${encodeURIComponent(name)}`,
        { method: "PUT", body: { settings: settingsPayload } },
      );
      const existing = state.value.guildConfigs.find(
        (c) => c.moduleName === name,
      );
      const settingsJson = JSON.stringify(settingsPayload);
      if (existing) {
        existing.settings = settingsJson;
      } else {
        state.value.guildConfigs.push({
          id: `${guildId}:${name}`,
          $id: `${guildId}:${name}`,
          guildId,
          moduleName: name,
          enabled: true,
          settings: settingsJson,
          updatedAt: new Date(),
          createdAt: new Date(),
        });
      }
      toast.add({
        title: "Settings Saved",
        description: `${moduleName} settings updated for this server.`,
        color: "success",
      });
      return true;
    } catch (error) {
      console.error("Error saving module settings:", error);
      toast.add({
        title: "Error",
        description: "Failed to save module settings.",
        color: "error",
      });
      return false;
    }
  };

  const getModuleConfig = (moduleName: string) => {
    const config = state.value.guildConfigs.find(
      (c) => c.moduleName === moduleName.toLowerCase(),
    );
    if (config?.settings) {
      try {
        return JSON.parse(config.settings);
      } catch {
        return {};
      }
    }
    return {};
  };

  // ── Data Loaders ──
  const loadChannels = async () => {
    if (state.value.channels.length > 0) return;
    state.value.channelsLoading = true;
    try {
      const response = await $fetch<{ channels: DiscordChannel[] }>(
        "/api/discord/channels",
        { params: { guild_id: guildId } },
      );
      state.value.channels = response.channels || [];
    } catch (error) {
      console.error("Error loading channels:", error);
      toast.add({
        title: "Error",
        description:
          "Failed to load channels. Make sure the bot is in this server.",
        color: "error",
      });
    } finally {
      state.value.channelsLoading = false;
    }
  };

  const loadRoles = async () => {
    if (state.value.roles.length > 0) return;
    state.value.rolesLoading = true;
    try {
      const response = await $fetch<{ roles: DiscordRole[] }>(
        "/api/discord/roles",
        { params: { guild_id: guildId } },
      );
      state.value.roles = response.roles || [];
    } catch (error) {
      console.error("Error loading roles:", error);
      toast.add({
        title: "Error",
        description:
          "Failed to load roles. Make sure the bot is in this server.",
        color: "error",
      });
    } finally {
      state.value.rolesLoading = false;
    }
  };

  const channelOptions = computed(() =>
    state.value.channels.map((c) => ({
      label: `#${c.name}`,
      value: c.id,
    })),
  );

  const roleOptions = computed(() =>
    state.value.roles
      .filter((r) => !r.managed)
      .map((r) => ({
        label: `@${r.name}`,
        value: r.id,
      })),
  );

  // ── Initialization ──
  const fetchModules = async () => {
    try {
      state.value.modules = await $fetch<ModuleDoc[]>("/api/modules");
    } catch (error) {
      console.error("Error fetching modules:", error);
    }
  };

  const fetchGuildConfigs = async () => {
    try {
      state.value.guildConfigs = await $fetch<GuildConfigDoc[]>(
        `/api/guild-configs?guild_id=${encodeURIComponent(guildId)}`,
      );
    } catch (error) {
      console.error("Error fetching guild configs:", error);
    }
  };

  /**
   * Gate access the same way the write-path APIs do (requireGuildManager:
   * servers.owner_id / admin_user_ids), instead of re-deriving Discord
   * ADMINISTRATOR / dashboard_role_ids client-side. That drift used to let
   * a Discord admin or dashboard-role user see a fully editable settings
   * page whose saves then silently 403'd, because the server-side gate
   * didn't recognize either signal. Reconciliation now goes through
   * POST /api/servers/join — the single place that logic lives — which
   * promotes a qualifying user into admin_user_ids on success.
   */
  const checkPermissions = async () => {
    try {
      let serverDoc: ServerSummary | null = null;
      try {
        const rows = await $fetch<ServerSummary[]>(
          `/api/servers/by-guild-ids?ids=${encodeURIComponent(guildId)}`,
        );
        serverDoc = rows[0] ?? null;
      } catch {
        // Not registered yet or permission denied.
      }

      if (!serverDoc) {
        state.value.unauthorized = true;
        return;
      }

      state.value.dashboardRoleIds = serverDoc.dashboard_role_ids ?? [];

      const userId = userStore.discordId;
      const isOwner = !!userId && serverDoc.owner_id === userId;
      const isAdmin =
        !!userId && serverDoc.admin_user_ids.includes(userId);

      if (isOwner || isAdmin) {
        state.value.isServerOwnerOrAdmin = true;
        state.value.guild = {
          id: serverDoc.guild_id,
          name: serverDoc.name,
          icon: serverDoc.icon,
        };
        return;
      }

      // Not yet a recognized manager — ask the server whether this user
      // qualifies (Discord ADMINISTRATOR or a configured dashboard role)
      // and, if so, join them into admin_user_ids.
      try {
        const joined = await $fetch<{
          guild_id: string;
          name: string;
          icon: string | null;
        }>("/api/servers/join", {
          method: "POST",
          body: { guild_id: guildId },
        });
        state.value.isServerOwnerOrAdmin = true;
        state.value.guild = {
          id: joined.guild_id,
          name: joined.name,
          icon: joined.icon,
        };
        return;
      } catch {
        // Not a Discord admin and no matching dashboard role.
      }

      state.value.unauthorized = true;
    } catch (error) {
      console.error("Error checking permissions:", error);
      state.value.unauthorized = true;
    }
  };

  const initialize = async () => {
    // Skip if already initialized
    if (state.value.guild && !state.value.loading) return;

    state.value.loading = true;
    try {
      if (!userStore.isLoggedIn) {
        await userStore.fetchUserSession();
      }

      if (!userStore.isLoggedIn) {
        useRouter().push("/login");
        return;
      }

      await checkPermissions();

      if (!state.value.unauthorized) {
        await Promise.all([fetchModules(), fetchGuildConfigs()]);
      }
    } catch (error) {
      console.error("Error initializing settings:", error);
    } finally {
      state.value.loading = false;
    }
  };

  // ── Dashboard Roles ──
  const saveDashboardRoles = async (roleIds: string[]) => {
    try {
      await $fetch("/api/servers/dashboard-roles", {
        method: "PATCH",
        body: {
          guild_id: guildId,
          dashboard_role_ids: roleIds,
        },
      });
      state.value.dashboardRoleIds = roleIds;
      toast.add({
        title: "Dashboard Roles Updated",
        description: "Users with the selected roles can now access this server's dashboard.",
        color: "success",
      });
      return true;
    } catch (error) {
      console.error("Error saving dashboard roles:", error);
      toast.add({
        title: "Error",
        description: "Failed to update dashboard roles.",
        color: "error",
      });
      return false;
    }
  };

  // ── Server Removal ──
  const removeServer = async () => {
    try {
      await $fetch(`/api/servers/${encodeURIComponent(guildId)}`, {
        method: "DELETE",
      });

      toast.add({
        title: "Server Removed",
        description: `${state.value.guild?.name || "Server"} has been removed from your dashboard.`,
        color: "success",
      });

      navigateTo("/");
      return true;
    } catch (error) {
      console.error("Error removing server:", error);
      toast.add({
        title: "Error",
        description: "Failed to remove server. Please try again.",
        color: "error",
      });
      return false;
    }
  };

  return {
    state,
    // Module helpers
    isModuleEnabled,
    hasModuleSettings,
    toggleModule,
    // Settings
    saveModuleSettings,
    getModuleConfig,
    // Loaders
    loadChannels,
    loadRoles,
    channelOptions,
    roleOptions,
    // Init
    initialize,
    fetchModules,
    fetchGuildConfigs,
    // Dashboard roles
    saveDashboardRoles,
    // Danger
    removeServer,
  };
}
