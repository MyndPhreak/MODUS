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
        <h2 class="text-xl font-bold mb-4">Admin IDs Configuration</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Current Bot Admin IDs are managed via the code. In the future, these
          can be moved to Appwrite Configuration.
        </p>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="id in adminIds"
            :key="id"
            color="primary"
            variant="soft"
            >{{ id }}</UBadge
          >
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

// Fetch from runtime config
const adminIds = computed(() => {
  const ids = config.public.botAdminIds || "";
  return ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
});

const isBotAdmin = computed(() => {
  if (!userStore.discordId) return false;
  return adminIds.value.includes(userStore.discordId);
});

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
      await fetchModules();
      await fetchInitialLogs();
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
