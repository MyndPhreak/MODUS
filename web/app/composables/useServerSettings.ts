import { Query } from "appwrite";

export interface ServerSettingsState {
  guild: any;
  modules: any[];
  guildConfigs: any[];
  channels: any[];
  channelsLoading: boolean;
  roles: any[];
  rolesLoading: boolean;
  loading: boolean;
  unauthorized: boolean;
  dashboardRoleIds: string[];
  isServerOwnerOrAdmin: boolean;
}

const databaseId = "discord_bot";
const modulesCollectionId = "modules";
const guildConfigsCollectionId = "guild_configs";

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

  const { databases } = useAppwrite();
  const userStore = useUserStore();
  const toast = useToast();

  // ── Module Helpers ──
  const isModuleEnabled = (moduleName: string) => {
    const config = state.value.guildConfigs.find(
      (c) => c.moduleName === moduleName.toLowerCase(),
    );
    return config ? config.enabled : true;
  };

  const hasModuleSettings = (moduleName: string): boolean => {
    return [
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
    ].includes(moduleName.toLowerCase());
  };

  const toggleModule = async (moduleName: string, enabled: boolean) => {
    try {
      const existingConfig = state.value.guildConfigs.find(
        (c) => c.moduleName === moduleName.toLowerCase(),
      );

      if (existingConfig) {
        const updated = await databases.updateDocument(
          databaseId,
          guildConfigsCollectionId,
          existingConfig.$id,
          { enabled },
        );
        const index = state.value.guildConfigs.findIndex(
          (c) => c.$id === existingConfig.$id,
        );
        state.value.guildConfigs[index] = updated;
      } else {
        const created = await databases.createDocument(
          databaseId,
          guildConfigsCollectionId,
          "unique()",
          {
            guildId,
            moduleName: moduleName.toLowerCase(),
            enabled,
            settings: "{}",
          },
        );
        state.value.guildConfigs.push(created);
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
    try {
      const config = state.value.guildConfigs.find(
        (c) => c.moduleName === moduleName.toLowerCase(),
      );
      const settingsJson = JSON.stringify(settingsPayload);

      if (config) {
        const updated = await databases.updateDocument(
          databaseId,
          guildConfigsCollectionId,
          config.$id,
          { settings: settingsJson },
        );
        const index = state.value.guildConfigs.findIndex(
          (c) => c.$id === config.$id,
        );
        state.value.guildConfigs[index] = updated;
      } else {
        const created = await databases.createDocument(
          databaseId,
          guildConfigsCollectionId,
          "unique()",
          {
            guildId,
            moduleName: moduleName.toLowerCase(),
            enabled: true,
            settings: settingsJson,
          },
        );
        state.value.guildConfigs.push(created);
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
      const response = (await $fetch("/api/discord/channels", {
        params: { guild_id: guildId },
      })) as any;
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
      const response = (await $fetch("/api/discord/roles", {
        params: { guild_id: guildId },
      })) as any;
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
      const response = await databases.listDocuments(
        databaseId,
        modulesCollectionId,
      );
      state.value.modules = response.documents;
    } catch (error) {
      console.error("Error fetching modules:", error);
    }
  };

  const fetchGuildConfigs = async () => {
    try {
      const response = await databases.listDocuments(
        databaseId,
        guildConfigsCollectionId,
        [Query.equal("guildId", guildId)],
      );
      state.value.guildConfigs = response.documents;
    } catch (error) {
      console.error("Error fetching guild configs:", error);
    }
  };

  const checkPermissions = async () => {
    try {
      let discordGuilds: any[] = [];

      try {
        const response = await fetch("/api/discord/guilds");
        if (response.ok) {
          discordGuilds = await response.json();
        }
      } catch {
        // Server API failed
      }

      if (!discordGuilds || discordGuilds.length === 0) {
        discordGuilds = userStore.userGuilds;
      }

      // Check Discord ADMINISTRATOR permission first
      let currentGuild: any = null;
      let hasDiscordAdmin = false;
      if (discordGuilds && discordGuilds.length > 0) {
        currentGuild = discordGuilds.find((g: any) => g.id === guildId);
        if (currentGuild) {
          const ADMIN_PERMISSION = 0x8;
          const permissions = BigInt(currentGuild.permissions);
          hasDiscordAdmin =
            (permissions & BigInt(ADMIN_PERMISSION)) ===
            BigInt(ADMIN_PERMISSION);
        }
      }

      // Load Appwrite server document for ownership + dashboard role data
      let serverDoc: any = null;
      try {
        serverDoc = await databases.getDocument(
          databaseId,
          "servers",
          guildId,
        );
        // Populate dashboard role IDs for the settings UI
        state.value.dashboardRoleIds = Array.isArray(
          serverDoc.dashboard_role_ids,
        )
          ? serverDoc.dashboard_role_ids
          : [];
      } catch {
        // Document not found or permission denied
      }

      // Discord ADMINISTRATOR → full access
      if (hasDiscordAdmin) {
        state.value.isServerOwnerOrAdmin = true;
        state.value.guild = currentGuild;
        return;
      }

      // Appwrite owner / admin_user_ids → full access
      if (serverDoc) {
        const userId = userStore.user?.$id;
        const isOwner = serverDoc.owner_id === userId;
        const isAdmin =
          Array.isArray(serverDoc.admin_user_ids) &&
          userId &&
          serverDoc.admin_user_ids.includes(userId);

        if (isOwner || isAdmin) {
          state.value.isServerOwnerOrAdmin = true;
          state.value.guild = currentGuild || {
            id: serverDoc.$id,
            name: serverDoc.name,
            icon: null,
            owner: isOwner,
            permissions: "8",
          };
          return;
        }

        // Fallback: check dashboard_role_ids — specific Discord roles
        // that the server owner has granted dashboard access to
        if (
          state.value.dashboardRoleIds.length > 0 &&
          userStore.discordId
        ) {
          try {
            const memberResponse = await $fetch<{ roles: string[] }>(
              "/api/discord/member-roles",
              {
                params: {
                  guild_id: guildId,
                  discord_uid: userStore.discordId,
                },
              },
            );

            const userRoles = memberResponse.roles || [];
            const hasRole = userRoles.some((r) =>
              state.value.dashboardRoleIds.includes(r),
            );

            if (hasRole) {
              state.value.guild = currentGuild || {
                id: serverDoc.$id,
                name: serverDoc.name,
                icon: serverDoc.icon || null,
                owner: false,
                permissions: "0",
              };
              return;
            }
          } catch {
            // Bot may not be in the guild or member not found
          }
        }
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
      for (const config of state.value.guildConfigs) {
        try {
          await databases.deleteDocument(
            databaseId,
            guildConfigsCollectionId,
            config.$id,
          );
        } catch (err) {
          console.warn("Failed to delete config:", config.$id, err);
        }
      }

      await databases.deleteDocument(databaseId, "servers", guildId);

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
