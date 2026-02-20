<template>
  <UContainer class="py-10">
    <div v-if="loading" class="flex justify-center py-20">
      <UProgress />
    </div>

    <div v-else-if="!isBotAdmin" class="text-center py-20">
      <UIcon
        name="i-heroicons-lock-closed"
        class="w-16 h-16 text-red-500 mx-auto mb-4"
      />
      <h1 class="text-3xl font-bold mb-2">Access Denied</h1>
      <p class="text-gray-500 mb-8">
        You do not have permission to access the Main Bot Admin Dashboard.
      </p>
      <UButton to="/" color="primary">Back to Dashboard</UButton>
    </div>

    <div v-else class="space-y-12">
      <div class="flex items-center gap-4">
        <UButton variant="ghost" icon="i-heroicons-arrow-left" to="/" />
        <h1 class="text-3xl font-bold">Main Bot Admin</h1>
      </div>

      <section>
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-2xl font-semibold">Global Command Modules</h2>
            <p class="text-sm text-gray-500">
              Enable or disable modules globally for all servers.
              Server-specific settings can still override these if the module is
              enabled here.
            </p>
          </div>
          <UButton
            icon="i-heroicons-arrow-path"
            variant="ghost"
            @click="fetchModules"
            :loading="modulesLoading"
          />
        </div>

        <div
          v-if="modules.length === 0"
          class="text-center py-10 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800"
        >
          <p class="text-gray-500">
            No modules found. Make sure the bot has registered them.
          </p>
        </div>

        <div
          v-else
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <UCard v-for="module in modules" :key="module.$id">
            <template #header>
              <div class="flex items-center justify-between">
                <span class="font-semibold">{{ module.name }}</span>
                <UBadge
                  :color="module.enabled ? 'success' : 'neutral'"
                  variant="soft"
                >
                  {{ module.enabled ? "Active" : "Disabled" }}
                </UBadge>
              </div>
            </template>

            <p
              class="text-gray-600 dark:text-gray-400 mb-4 h-12 overflow-hidden"
            >
              {{ module.description }}
            </p>

            <template #footer>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Globally Enabled</span>
                <USwitch
                  v-model="module.enabled"
                  @update:model-value="toggleModule(module)"
                  :loading="updating === module.$id"
                />
              </div>
            </template>
          </UCard>
        </div>
      </section>

      <section
        class="bg-primary-50 dark:bg-primary-900/10 rounded-xl p-8 border border-primary-100 dark:border-primary-800"
      >
        <h2 class="text-xl font-bold mb-4">Admin Access</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Admin access is managed via Appwrite user labels. Users with the
          <UBadge color="primary" variant="soft" size="xs">admin</UBadge>
          label have access to this dashboard.
        </p>
      </section>

      <!-- Global AI Settings -->
      <section>
        <div class="flex items-center gap-3 mb-4">
          <div
            class="p-2 rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20"
          >
            <UIcon
              name="i-heroicons-cpu-chip"
              class="w-5 h-5 text-violet-400"
            />
          </div>
          <div>
            <h2 class="text-2xl font-semibold">Global AI Settings</h2>
            <p class="text-sm text-gray-500">
              Default provider &amp; key used by all Premium guilds that haven't
              configured their own. Falls back to
              <code class="text-xs bg-gray-800 px-1 rounded">.env</code> if not
              set here.
            </p>
          </div>
        </div>

        <UCard>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <UFormField label="Default Provider">
              <USelectMenu
                v-model="globalAI.aiProvider"
                :items="aiProviderOptions"
                value-key="value"
                placeholder="Select provider..."
                :search-input="false"
              />
            </UFormField>

            <UFormField label="API Key">
              <UInput
                v-model="globalAI.aiApiKey"
                type="password"
                placeholder="sk-... or your provider key"
                icon="i-heroicons-lock-closed"
                autocomplete="off"
              />
            </UFormField>

            <UFormField label="Default Model">
              <div class="flex gap-2">
                <USelectMenu
                  v-model="globalAI.aiModel"
                  :items="globalAIModels"
                  :loading="globalAIModelsLoading"
                  :disabled="globalAIModelsLoading"
                  :search-input="{ placeholder: 'Search models...' }"
                  placeholder="Select or type a model..."
                  class="flex-1"
                />
                <UButton
                  icon="i-heroicons-arrow-path"
                  variant="ghost"
                  :loading="globalAIModelsLoading"
                  :disabled="!globalAI.aiApiKey"
                  title="Fetch available models"
                  @click="fetchGlobalAIModels"
                />
              </div>
              <p
                v-if="globalAIModelsWarning"
                class="text-xs text-amber-400 mt-1"
              >
                {{ globalAIModelsWarning }}
              </p>
            </UFormField>

            <UFormField label="Base URL">
              <UInput
                v-model="globalAI.aiBaseUrl"
                placeholder="http://localhost:11434/v1 (optional — Ollama/LM Studio only)"
                icon="i-heroicons-globe-alt"
              />
            </UFormField>
          </div>

          <div
            class="mt-4 pt-4 border-t border-gray-800 flex flex-wrap items-center gap-3"
          >
            <span class="text-xs text-gray-500">Get an API key:</span>
            <a
              v-for="link in aiProviderLinks"
              :key="link.name"
              :href="link.url"
              target="_blank"
              class="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
              >{{ link.name }}</a
            >
          </div>

          <template #footer>
            <div class="flex items-center justify-between">
              <p class="text-xs text-gray-500">
                <UIcon
                  name="i-heroicons-information-circle"
                  class="inline w-3.5 h-3.5 mb-0.5"
                />
                Stored in Appwrite — never exposed to guild admins.
              </p>
              <UButton
                icon="i-heroicons-check"
                :loading="savingGlobalAI"
                @click="saveGlobalAI"
              >
                Save Settings
              </UButton>
            </div>
          </template>
        </UCard>
      </section>

      <!-- Registered Servers -->
      <section>
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-2xl font-semibold">Registered Servers</h2>
            <p class="text-sm text-gray-500">
              Manage premium status for all servers using the bot. Premium
              unlocks hosted AI features.
            </p>
          </div>
          <UButton
            icon="i-heroicons-arrow-path"
            variant="ghost"
            @click="fetchServers"
            :loading="serversLoading"
          />
        </div>

        <div
          v-if="servers.length === 0 && !serversLoading"
          class="text-center py-10 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800"
        >
          <p class="text-gray-500">No servers registered yet.</p>
        </div>

        <div
          v-else
          class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          <UCard v-for="server in servers" :key="server.$id" class="relative">
            <template #header>
              <div class="flex items-center gap-3">
                <img
                  v-if="server.icon"
                  :src="`https://cdn.discordapp.com/icons/${server.guild_id}/${server.icon}.webp?size=64`"
                  class="w-10 h-10 rounded-xl object-cover"
                  :alt="server.name"
                />
                <div
                  v-else
                  class="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center"
                >
                  <UIcon
                    name="i-heroicons-server"
                    class="w-5 h-5 text-gray-400"
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold truncate">{{ server.name }}</p>
                  <p class="text-xs text-gray-500 font-mono truncate">
                    {{ server.guild_id }}
                  </p>
                </div>
                <UBadge
                  :color="server.status ? 'success' : 'neutral'"
                  variant="soft"
                  size="xs"
                >
                  {{ server.status ? "Online" : "Offline" }}
                </UBadge>
              </div>
            </template>

            <div class="space-y-2 text-sm text-gray-500">
              <div class="flex justify-between">
                <span>Members</span>
                <span class="text-gray-300">{{
                  server.member_count?.toLocaleString() ?? "—"
                }}</span>
              </div>
              <div class="flex justify-between">
                <span>Shard</span>
                <span class="text-gray-300">{{ server.shard_id ?? "—" }}</span>
              </div>
              <div class="flex justify-between">
                <span>Ping</span>
                <span class="text-gray-300">{{
                  server.ping ? `${server.ping}ms` : "—"
                }}</span>
              </div>
            </div>

            <template #footer>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon
                    name="i-heroicons-star"
                    class="w-4 h-4 text-amber-400"
                  />
                  <span class="text-sm font-medium">Premium</span>
                  <UBadge
                    v-if="server.premium"
                    color="warning"
                    variant="soft"
                    size="xs"
                  >
                    Active
                  </UBadge>
                </div>
                <USwitch
                  :model-value="server.premium === true"
                  @update:model-value="(v) => togglePremium(server, v)"
                  :loading="updatingPremium === server.$id"
                  color="warning"
                />
              </div>
            </template>
          </UCard>
        </div>
      </section>

      <!-- Live Bot Logs — Enhanced -->
      <section>
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-2xl font-semibold">Live Bot Logs</h2>
            <p class="text-sm text-gray-500">
              Real-time activity from the bot across all servers and shards.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-heroicons-trash"
              variant="ghost"
              color="neutral"
              @click="botLogs = []"
              title="Clear View"
            />
            <UButton
              icon="i-heroicons-arrow-path"
              variant="ghost"
              color="neutral"
              @click="fetchInitialLogs"
              :loading="logsRefreshing"
              title="Refresh"
            />
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <!-- Scope Filter -->
          <div class="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1">
            <UButton
              v-for="scope in logScopes"
              :key="scope.value"
              size="xs"
              :variant="adminLogScope === scope.value ? 'solid' : 'ghost'"
              :color="scope.color"
              @click="adminLogScope = scope.value"
              class="rounded-md text-xs font-bold"
            >
              {{ scope.label }}
            </UButton>
          </div>

          <!-- Level Filter -->
          <div class="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1">
            <UButton
              v-for="lvl in adminLogLevels"
              :key="lvl.value"
              size="xs"
              :variant="adminLogLevel === lvl.value ? 'solid' : 'ghost'"
              :color="lvl.color"
              @click="adminLogLevel = lvl.value"
              class="rounded-md text-xs font-bold uppercase tracking-wider"
            >
              {{ lvl.label }}
              <UBadge
                v-if="getAdminLogCount(lvl.value) > 0"
                variant="soft"
                :color="lvl.color"
                size="xs"
                class="ml-1"
              >
                {{ getAdminLogCount(lvl.value) }}
              </UBadge>
            </UButton>
          </div>

          <!-- Log count -->
          <span class="text-xs text-gray-500 font-mono ml-auto">
            {{ filteredBotLogs.length }} / {{ botLogs.length }} entries
          </span>
        </div>

        <!-- Terminal -->
        <div
          class="bg-gray-950 rounded-xl border border-gray-800/50 p-4 font-mono text-[11px] h-[500px] flex flex-col"
        >
          <div
            v-if="botLogs.length === 0"
            class="flex-1 flex items-center justify-center text-gray-600 italic"
          >
            <div class="text-center">
              <UIcon
                name="i-heroicons-signal"
                class="w-8 h-8 mx-auto mb-2 opacity-30"
              />
              <p>Waiting for logs...</p>
              <p class="text-[10px] mt-1 text-gray-700">
                Logs will stream in real-time as the bot processes events.
              </p>
            </div>
          </div>
          <div v-else class="flex-1 overflow-y-auto space-y-0.5">
            <div
              v-for="log in filteredBotLogs"
              :key="log.$id"
              class="flex gap-3 py-1 px-2 rounded hover:bg-white/5 transition-colors"
            >
              <span class="text-gray-600 whitespace-nowrap shrink-0">{{
                formatFullTime(log.timestamp)
              }}</span>
              <span
                :class="[
                  'font-black uppercase min-w-[45px] shrink-0',
                  log.level === 'error'
                    ? 'text-red-400'
                    : log.level === 'warn'
                      ? 'text-amber-400'
                      : 'text-blue-400',
                ]"
                >[{{ log.level }}]</span
              >
              <span
                v-if="log.shardId !== undefined"
                class="text-cyan-500/60 shrink-0"
                >S{{ log.shardId }}</span
              >
              <span
                v-if="log.guildId && log.guildId !== 'global'"
                class="text-violet-400/60 shrink-0 max-w-[120px] truncate"
                title="Guild ID"
                >[{{ log.guildId }}]</span
              >
              <span v-if="log.source" class="text-emerald-400/60 shrink-0"
                >[{{ log.source }}]</span
              >
              <span class="text-gray-300 break-words">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from "vue";
import { Query } from "appwrite";

const userStore = useUserStore();
const { databases } = useAppwrite();
const toast = useToast();
const config = useRuntimeConfig();

const loading = ref(true);
const modulesLoading = ref(false);
const modules = ref<any[]>([]);
const updating = ref<string | null>(null);
const botLogs = ref<any[]>([]);
const logSubscription = ref<(() => void) | null>(null);
const logsRefreshing = ref(false);

// Servers / Premium
const servers = ref<any[]>([]);
const serversLoading = ref(false);
const updatingPremium = ref<string | null>(null);

// Global AI config
const globalAI = ref({
  aiProvider: "Groq",
  aiApiKey: "",
  aiModel: "llama-3.3-70b-versatile",
  aiBaseUrl: "",
});
const savingGlobalAI = ref(false);
const globalAIModels = ref<string[]>([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
]);
const globalAIModelsLoading = ref(false);
const globalAIModelsWarning = ref("");

const aiProviderOptions = [
  { label: "Groq (Free · Recommended)", value: "Groq" },
  { label: "OpenAI", value: "OpenAI" },
  { label: "Google Gemini", value: "Google Gemini" },
  { label: "Anthropic Claude", value: "Anthropic Claude" },
  {
    label: "OpenAI Compatible (Ollama, LM Studio…)",
    value: "OpenAI Compatible",
  },
];

const aiProviderLinks = [
  { name: "Groq", url: "https://console.groq.com" },
  { name: "OpenAI", url: "https://platform.openai.com/api-keys" },
  { name: "Google Gemini", url: "https://aistudio.google.com/apikey" },
  { name: "Anthropic", url: "https://console.anthropic.com" },
];

// Admin log filters
const adminLogScope = ref("all");
const adminLogLevel = ref("all");

const logScopes = [
  { value: "all", label: "All Logs", color: "neutral" as const },
  { value: "global", label: "System", color: "primary" as const },
  { value: "guild", label: "Per-Server", color: "info" as const },
];

const adminLogLevels = [
  { value: "all", label: "All", color: "neutral" as const },
  { value: "info", label: "Info", color: "info" as const },
  { value: "warn", label: "Warn", color: "warning" as const },
  { value: "error", label: "Error", color: "error" as const },
];

const databaseId = "discord_bot";
const collectionId = "modules";

const isBotAdmin = computed(() => userStore.isAdmin);

const filteredBotLogs = computed(() => {
  let logs = [...botLogs.value];

  // Filter by scope
  if (adminLogScope.value === "global") {
    logs = logs.filter((l) => l.guildId === "global");
  } else if (adminLogScope.value === "guild") {
    logs = logs.filter((l) => l.guildId && l.guildId !== "global");
  }

  // Filter by level
  if (adminLogLevel.value !== "all") {
    logs = logs.filter((l) => l.level === adminLogLevel.value);
  }

  return logs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
});

const getAdminLogCount = (level: string) => {
  // Count within current scope
  let logs = botLogs.value;
  if (adminLogScope.value === "global") {
    logs = logs.filter((l) => l.guildId === "global");
  } else if (adminLogScope.value === "guild") {
    logs = logs.filter((l) => l.guildId && l.guildId !== "global");
  }

  if (level === "all") return logs.length;
  return logs.filter((l) => l.level === level).length;
};

const fetchModules = async () => {
  modulesLoading.value = true;
  try {
    const response = await databases.listDocuments(databaseId, collectionId);
    modules.value = response.documents;
  } catch (error) {
    console.error("Error fetching modules:", error);
  } finally {
    modulesLoading.value = false;
  }
};

const fetchServers = async () => {
  serversLoading.value = true;
  try {
    const response = await databases.listDocuments(databaseId, "servers", [
      Query.orderDesc("name"),
      Query.limit(100),
    ]);
    servers.value = response.documents;
  } catch (error) {
    console.error("Error fetching servers:", error);
  } finally {
    serversLoading.value = false;
  }
};

const loadGlobalAI = async () => {
  try {
    const response = await databases.listDocuments(
      databaseId,
      "guild_configs",
      [
        Query.equal("guildId", "__global__"),
        Query.equal("moduleName", "ai"),
        Query.limit(1),
      ],
    );
    if (response.total > 0 && response.documents[0]!.settings) {
      const saved = JSON.parse(response.documents[0]!.settings);
      globalAI.value = { ...globalAI.value, ...saved };
      // Fetch models once we have a key
      if (globalAI.value.aiApiKey) await fetchGlobalAIModels();
    }
  } catch (error) {
    console.error("Error loading global AI config:", error);
  }
};

const fetchGlobalAIModels = async () => {
  globalAIModelsLoading.value = true;
  globalAIModelsWarning.value = "";
  try {
    const res = await $fetch<{ models: string[]; warning?: string }>(
      "/api/ai/models",
      {
        method: "POST",
        body: {
          provider: globalAI.value.aiProvider,
          apiKey: globalAI.value.aiApiKey || "__validate_only__",
          baseUrl: globalAI.value.aiBaseUrl || undefined,
        },
      },
    );
    globalAIModels.value = res.models;
    if (res.warning) globalAIModelsWarning.value = res.warning;
    // If saved model is no longer in list, keep it anyway (manually typed)
  } catch (err) {
    globalAIModelsWarning.value =
      "Could not fetch models — check your API key.";
  } finally {
    globalAIModelsLoading.value = false;
  }
};

// Auto-fetch when provider or a valid key changes
watch(
  [() => globalAI.value.aiProvider, () => globalAI.value.aiApiKey],
  ([_provider, key]) => {
    if (key && key.length > 10) fetchGlobalAIModels();
  },
);

// Also re-fetch on provider change regardless of key (returns fallback list)
watch(
  () => globalAI.value.aiProvider,
  () => fetchGlobalAIModels(),
);

const saveGlobalAI = async () => {
  savingGlobalAI.value = true;
  try {
    // Check for existing doc
    const response = await databases.listDocuments(
      databaseId,
      "guild_configs",
      [
        Query.equal("guildId", "__global__"),
        Query.equal("moduleName", "ai"),
        Query.limit(1),
      ],
    );
    if (response.total > 0) {
      await databases.updateDocument(
        databaseId,
        "guild_configs",
        response.documents[0]!.$id,
        {
          settings: JSON.stringify(globalAI.value),
        },
      );
    } else {
      await databases.createDocument(databaseId, "guild_configs", "unique()", {
        guildId: "__global__",
        moduleName: "ai",
        enabled: true,
        settings: JSON.stringify(globalAI.value),
      });
    }
    toast.add({
      title: "Saved",
      description: "Global AI settings updated.",
      color: "success",
    });
  } catch (error) {
    console.error("Error saving global AI config:", error);
    toast.add({
      title: "Error",
      description: "Failed to save global AI settings.",
      color: "error",
    });
  } finally {
    savingGlobalAI.value = false;
  }
};

const togglePremium = async (server: any, premium: boolean) => {
  updatingPremium.value = server.$id;
  try {
    await databases.updateDocument(databaseId, "servers", server.$id, {
      premium,
    });
    server.premium = premium;
    toast.add({
      title: premium ? "Premium Enabled" : "Premium Removed",
      description: `${server.name} is now ${premium ? "premium" : "standard"}.`,
      color: premium ? "warning" : "neutral",
    });
  } catch (error) {
    console.error("Error toggling premium:", error);
    toast.add({
      title: "Error",
      description: "Failed to update premium status.",
      color: "error",
    });
  } finally {
    updatingPremium.value = null;
  }
};

const toggleModule = async (module: any) => {
  updating.value = module.$id;
  try {
    await databases.updateDocument(databaseId, collectionId, module.$id, {
      enabled: module.enabled,
    });
    toast.add({
      title: "Success",
      description: `Global status for ${module.name} updated.`,
      color: "success",
    });
  } catch (error) {
    console.error("Error updating module:", error);
    // Revert change on error
    module.enabled = !module.enabled;
    toast.add({
      title: "Error",
      description: "Failed to update global module status.",
      color: "error",
    });
  } finally {
    updating.value = null;
  }
};

onMounted(async () => {
  try {
    if (!userStore.isLoggedIn) {
      await userStore.fetchUserSession();
    }

    if (isBotAdmin.value) {
      await Promise.all([
        fetchModules(),
        fetchInitialLogs(),
        fetchServers(),
        loadGlobalAI(),
      ]);
      setupRealtimeLogs();
    }
  } catch (error) {
    console.error("Error in admin dashboard:", error);
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  if (logSubscription.value) logSubscription.value();
});

const fetchInitialLogs = async () => {
  logsRefreshing.value = true;
  try {
    // Fetch ALL logs (not just global) so admins see everything
    const response = await databases.listDocuments(databaseId, "logs", [
      Query.orderDesc("timestamp"),
      Query.limit(100),
    ]);
    botLogs.value = response.documents;
  } catch (error) {
    console.error("Error fetching logs:", error);
  } finally {
    logsRefreshing.value = false;
  }
};

const setupRealtimeLogs = () => {
  const { client } = useAppwrite();
  logSubscription.value = client.subscribe(
    `databases.${databaseId}.collections.logs.documents`,
    (response) => {
      if (response.events.some((e: string) => e.includes(".create"))) {
        const newLog = response.payload as any;
        // Admin sees ALL logs in real-time
        botLogs.value = [newLog, ...botLogs.value].slice(0, 200);
      }
    },
  );
};

const formatFullTime = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};
</script>
