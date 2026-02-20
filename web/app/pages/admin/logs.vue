<template>
  <div class="p-8 space-y-6 h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between flex-shrink-0">
      <div>
        <h1 class="text-2xl font-black text-white tracking-tight gradient-text">
          Live Bot Logs
        </h1>
        <p class="text-gray-400 text-sm mt-1">
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
          class="rounded-xl border border-white/8"
        />
        <UButton
          icon="i-heroicons-arrow-path"
          variant="ghost"
          color="neutral"
          @click="fetchInitialLogs"
          :loading="logsRefreshing"
          title="Refresh"
          class="rounded-xl border border-white/8"
        />
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 flex-shrink-0">
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
      class="bg-gray-950 rounded-xl border border-gray-800/50 p-4 font-mono text-[11px] flex-1 min-h-0 flex flex-col"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { Query } from "appwrite";

const { databases, client } = useAppwrite();

const botLogs = ref<any[]>([]);
const logsRefreshing = ref(false);
const logSubscription = ref<(() => void) | null>(null);

const adminLogScope = ref("all");
const adminLogLevel = ref("all");

const databaseId = "discord_bot";

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

const filteredBotLogs = computed(() => {
  let logs = [...botLogs.value];

  if (adminLogScope.value === "global") {
    logs = logs.filter((l) => l.guildId === "global");
  } else if (adminLogScope.value === "guild") {
    logs = logs.filter((l) => l.guildId && l.guildId !== "global");
  }

  if (adminLogLevel.value !== "all") {
    logs = logs.filter((l) => l.level === adminLogLevel.value);
  }

  return logs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
});

const getAdminLogCount = (level: string) => {
  let logs = botLogs.value;
  if (adminLogScope.value === "global") {
    logs = logs.filter((l) => l.guildId === "global");
  } else if (adminLogScope.value === "guild") {
    logs = logs.filter((l) => l.guildId && l.guildId !== "global");
  }
  if (level === "all") return logs.length;
  return logs.filter((l) => l.level === level).length;
};

const fetchInitialLogs = async () => {
  logsRefreshing.value = true;
  try {
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
  logSubscription.value = client.subscribe(
    `databases.${databaseId}.collections.logs.documents`,
    (response) => {
      if (response.events.some((e: string) => e.includes(".create"))) {
        const newLog = response.payload as any;
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

onMounted(async () => {
  await fetchInitialLogs();
  setupRealtimeLogs();
});

onUnmounted(() => {
  if (logSubscription.value) logSubscription.value();
});
</script>

<style scoped>
.gradient-text {
  background: linear-gradient(to bottom right, #ffffff 30%, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
