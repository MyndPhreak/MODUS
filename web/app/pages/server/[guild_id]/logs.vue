<template>
  <div class="p-6 lg:p-8 space-y-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2
          class="text-2xl font-bold mb-2 bg-gradient-to-r from-teal-400 to-emerald-500 bg-clip-text text-transparent"
        >
          Server Logs
        </h2>
        <p class="text-sm text-gray-400">
          View recent bot activity and moderation events for this server
        </p>
      </div>
      <UButton
        icon="i-heroicons-arrow-path"
        variant="soft"
        color="neutral"
        :loading="refreshing"
        @click="fetchLogs"
      >
        Refresh
      </UButton>
    </div>

    <!-- Filters -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent pointer-events-none"
      />
      <div class="relative flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-funnel" class="text-gray-400" />
          <span class="text-sm font-medium text-gray-300">Filter:</span>
        </div>
        <USelectMenu
          v-model="levelFilter"
          :items="levelOptions"
          value-key="value"
          placeholder="All levels"
          icon="i-heroicons-adjustments-horizontal"
          size="sm"
          class="w-40"
          clear
        />
        <UInput
          v-model="searchQuery"
          placeholder="Search logs..."
          icon="i-heroicons-magnifying-glass"
          size="sm"
          class="flex-1 min-w-48"
        />
      </div>
    </div>

    <!-- Logs Table -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-teal-500/3 to-transparent pointer-events-none"
      />

      <!-- Loading -->
      <div
        v-if="loading"
        class="relative flex items-center justify-center py-16 text-gray-400"
      >
        <UIcon
          name="i-heroicons-arrow-path"
          class="animate-spin text-2xl text-teal-400 mr-3"
        />
        <span class="text-sm">Loading logs…</span>
      </div>

      <!-- Empty -->
      <div
        v-else-if="filteredLogs.length === 0"
        class="relative text-center py-16"
      >
        <UIcon name="i-heroicons-inbox" class="text-5xl text-gray-600 mb-3" />
        <p class="text-gray-400">
          {{
            logs.length === 0
              ? "No logs recorded yet."
              : "No logs matching your filters."
          }}
        </p>
      </div>

      <!-- Logs List -->
      <div v-else class="relative divide-y divide-white/5">
        <div
          v-for="log in paginatedLogs"
          :key="log.$id"
          class="flex items-start gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
        >
          <div class="flex-shrink-0 mt-0.5">
            <div class="w-2 h-2 rounded-full" :class="levelColor(log.level)" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-sm font-medium text-white truncate">
                {{ log.source || "Event" }}
              </span>
              <UBadge
                :color="levelBadgeColor(log.level)"
                variant="soft"
                size="xs"
              >
                {{ log.level || "info" }}
              </UBadge>
            </div>
            <p class="text-xs text-gray-500 line-clamp-2">
              {{ log.message }}
            </p>
          </div>
          <span class="text-[10px] text-gray-600 whitespace-nowrap mt-1">
            {{ formatDate(log.$createdAt) }}
          </span>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="totalPages > 1"
        class="relative flex items-center justify-between px-5 py-3 border-t border-white/5"
      >
        <span class="text-xs text-gray-500">
          Showing {{ (currentPage - 1) * perPage + 1 }}–{{
            Math.min(currentPage * perPage, filteredLogs.length)
          }}
          of {{ filteredLogs.length }}
        </span>
        <div class="flex gap-1">
          <UButton
            icon="i-heroicons-chevron-left"
            size="xs"
            variant="ghost"
            :disabled="currentPage <= 1"
            @click="currentPage--"
          />
          <UButton
            icon="i-heroicons-chevron-right"
            size="xs"
            variant="ghost"
            :disabled="currentPage >= totalPages"
            @click="currentPage++"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useAppwrite } from "~/composables/useAppwrite";
import { Query } from "appwrite";

const route = useRoute();
const guildId = route.params.guild_id as string;

const loading = ref(true);
const refreshing = ref(false);
const logs = ref<any[]>([]);
const currentPage = ref(1);
const perPage = 25;

const searchQuery = ref("");
const levelFilter = ref<string | undefined>(undefined);

const levelOptions = [
  { label: "Info", value: "info" },
  { label: "Warning", value: "warn" },
  { label: "Error", value: "error" },
  { label: "Debug", value: "debug" },
];

const filteredLogs = computed(() => {
  let result = logs.value;
  if (levelFilter.value) {
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

const totalPages = computed(() =>
  Math.ceil(filteredLogs.value.length / perPage),
);
const paginatedLogs = computed(() =>
  filteredLogs.value.slice(
    (currentPage.value - 1) * perPage,
    currentPage.value * perPage,
  ),
);

const fetchLogs = async () => {
  refreshing.value = true;
  try {
    const { databases } = useAppwrite();
    const res = await databases.listDocuments("discord_bot", "logs", [
      Query.equal("guildId", guildId),
      Query.orderDesc("timestamp"),
      Query.limit(500),
    ]);
    logs.value = res.documents;
    currentPage.value = 1;
  } catch (error) {
    console.error("Error fetching logs:", error);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

const levelColor = (level: string) => {
  const map: Record<string, string> = {
    info: "bg-blue-400",
    warn: "bg-yellow-400",
    error: "bg-red-400",
    debug: "bg-gray-400",
  };
  return map[level] || "bg-gray-400";
};

const levelBadgeColor = (level: string): any => {
  const map: Record<string, string> = {
    info: "info",
    warn: "warning",
    error: "error",
    debug: "neutral",
  };
  return map[level] || "neutral";
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

onMounted(() => {
  fetchLogs();
});
</script>
