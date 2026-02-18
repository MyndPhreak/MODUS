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
    return ["music", "moderation", "recording"].includes(
      moduleName.toLowerCase(),
    );
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

      if (discordGuilds && discordGuilds.length > 0) {
        const currentGuild = discordGuilds.find((g: any) => g.id === guildId);
        if (currentGuild) {
          const ADMIN_PERMISSION = 0x8;
          const permissions = BigInt(currentGuild.permissions);
          if (
            (permissions & BigInt(ADMIN_PERMISSION)) ===
            BigInt(ADMIN_PERMISSION)
          ) {
            state.value.guild = currentGuild;
            return;
          } else {
            state.value.unauthorized = true;
            return;
          }
        }
      }

      try {
        const serverDoc = await databases.getDocument(
          databaseId,
          "servers",
          guildId,
        );
        if (serverDoc.ownerId === userStore.user?.$id) {
          state.value.guild = {
            id: serverDoc.$id,
            name: serverDoc.name,
            icon: null,
            owner: true,
            permissions: "8",
          };
          return;
        }
      } catch {
        // Document not found or permission denied
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
    // Danger
    removeServer,
  };
}
