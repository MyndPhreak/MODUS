<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2
          class="text-2xl font-bold mb-1 bg-gradient-to-r from-teal-400 to-emerald-500 bg-clip-text text-transparent"
        >
          Server Logs
        </h2>
        <p class="text-sm text-gray-400">
          Recent bot activity and moderation events for this server.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-heroicons-trash"
          variant="ghost"
          color="neutral"
          title="Clear View"
          class="rounded-xl border border-white/8"
          @click="logs = []"
        />
        <UButton
          icon="i-heroicons-arrow-path"
          variant="ghost"
          color="neutral"
          :loading="refreshing"
          title="Refresh"
          class="rounded-xl border border-white/8"
          @click="fetchLogs"
        />
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- Level Filter -->
      <div class="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1">
        <UButton
          v-for="lvl in logLevels"
          :key="lvl.value"
          size="xs"
          :variant="levelFilter === lvl.value ? 'solid' : 'ghost'"
          :color="lvl.color"
          class="rounded-md text-xs font-bold uppercase tracking-wider"
          @click="levelFilter = lvl.value"
        >
          {{ lvl.label }}
          <UBadge
            v-if="getLevelCount(lvl.value) > 0"
            variant="soft"
            :color="lvl.color"
            size="xs"
            class="ml-1"
          >
            {{ getLevelCount(lvl.value) }}
          </UBadge>
        </UButton>
      </div>

      <UInput
        v-model="searchQuery"
        placeholder="Search logs..."
        icon="i-heroicons-magnifying-glass"
        size="sm"
        class="w-56"
      />

      <!-- Log count -->
      <span class="text-xs text-gray-500 font-mono ml-auto">
        {{ filteredLogs.length }} / {{ logs.length }} entries
      </span>
    </div>

    <!-- Terminal -->
    <div
      class="bg-gray-950 rounded-xl border border-gray-800/50 p-4 font-mono text-[11px] h-[65vh] flex flex-col"
    >
      <div
        v-if="loading"
        class="flex-1 flex items-center justify-center text-gray-500"
      >
        <UIcon
          name="i-heroicons-arrow-path"
          class="w-5 h-5 animate-spin mr-2"
        />
        Loading logs…
      </div>
      <div
        v-else-if="logs.length === 0"
        class="flex-1 flex items-center justify-center text-gray-600 italic"
      >
        <div class="text-center">
          <UIcon
            name="i-heroicons-inbox"
            class="w-8 h-8 mx-auto mb-2 opacity-30"
          />
          <p>No logs recorded yet.</p>
        </div>
      </div>
      <div
        v-else-if="filteredLogs.length === 0"
        class="flex-1 flex items-center justify-center text-gray-600 italic"
      >
        <p>No logs matching your filters.</p>
      </div>
      <div v-else class="flex-1 overflow-y-auto space-y-0.5">
        <div
          v-for="log in filteredLogs"
          :key="log.$id"
          class="flex gap-3 py-1 px-2 rounded hover:bg-white/5 transition-colors"
        >
          <span class="text-gray-600 whitespace-nowrap shrink-0">{{
            formatTime(log.timestamp)
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
            v-if="log.shardId !== undefined && log.shardId !== null"
            class="text-cyan-500/60 shrink-0"
            >S{{ log.shardId }}</span
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
import { ref, computed, onMounted } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;

const loading = ref(true);
const refreshing = ref(false);
const logs = ref<any[]>([]);

const searchQuery = ref("");
const levelFilter = ref("all");

const logLevels = [
  { value: "all", label: "All", color: "neutral" as const },
  { value: "info", label: "Info", color: "info" as const },
  { value: "warn", label: "Warn", color: "warning" as const },
  { value: "error", label: "Error", color: "error" as const },
];

const filteredLogs = computed(() => {
  let result = logs.value;
  if (levelFilter.value !== "all") {
    result = result.filter((l) => l.level === levelFilter.value);
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter(
      (l) =>
        l.message?.toLowerCase().includes(q) ||
        l.source?.toLowerCase().includes(q),
    );
  }
  return result;
});

const getLevelCount = (level: string) => {
  if (level === "all") return logs.value.length;
  return logs.value.filter((l) => l.level === level).length;
};

const fetchLogs = async () => {
  refreshing.value = true;
  try {
    logs.value = await $fetch<any[]>(
      `/api/logs?guild_id=${encodeURIComponent(guildId)}&limit=500`,
    );
  } catch (error) {
    console.error("Error fetching logs:", error);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

const formatTime = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

onMounted(() => {
  fetchLogs();
});
</script>
