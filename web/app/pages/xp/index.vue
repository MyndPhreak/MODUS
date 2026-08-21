<template>
  <div class="py-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-12 mt-12">
    <!-- HERO SECTION -->
    <div class="text-center space-y-4 pt-4">
      <div
        class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-wider shadow-lg"
      >
        <UIcon name="i-heroicons-globe-alt" class="w-4 h-4" />
        Public Server Directory
      </div>

      <h1 class="text-4xl sm:text-6xl font-black text-white tracking-tight">
        Server XP Leaderboards
      </h1>
      <p class="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto">
        Discover top Discord communities powered by MODUS ranked by cumulative
        server XP, active leveling members, and community message activity.
      </p>

      <!-- Global Stats Cards -->
      <div class="flex flex-wrap items-center justify-center gap-4 pt-4">
        <div
          class="px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex items-center gap-3 shadow-xl"
        >
          <div
            class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center"
          >
            <UIcon
              name="i-heroicons-server-stack"
              class="text-indigo-400 text-xl"
            />
          </div>
          <div class="text-left">
            <p
              class="text-[10px] text-zinc-500 font-bold uppercase tracking-wider"
            >
              Public Servers
            </p>
            <p class="text-lg font-black text-white">
              {{ formatNumber(data?.stats?.totalGuilds || 0) }}
            </p>
          </div>
        </div>

        <div
          class="px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex items-center gap-3 shadow-xl"
        >
          <div
            class="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center"
          >
            <UIcon name="i-heroicons-bolt" class="text-purple-400 text-xl" />
          </div>
          <div class="text-left">
            <p
              class="text-[10px] text-zinc-500 font-bold uppercase tracking-wider"
            >
              Cumulative Server XP
            </p>
            <p class="text-lg font-black text-white">
              {{ formatNumber(data?.stats?.totalXp || 0) }}
            </p>
          </div>
        </div>

        <div
          class="px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex items-center gap-3 shadow-xl"
        >
          <div
            class="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center"
          >
            <UIcon name="i-heroicons-users" class="text-pink-400 text-xl" />
          </div>
          <div class="text-left">
            <p
              class="text-[10px] text-zinc-500 font-bold uppercase tracking-wider"
            >
              Active Members
            </p>
            <p class="text-lg font-black text-white">
              {{ formatNumber(data?.stats?.totalUsers || 0) }}
            </p>
          </div>
        </div>

        <div
          class="px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex items-center gap-3 shadow-xl"
        >
          <div
            class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center"
          >
            <UIcon
              name="i-heroicons-chat-bubble-left-right"
              class="text-amber-400 text-xl"
            />
          </div>
          <div class="text-left">
            <p
              class="text-[10px] text-zinc-500 font-bold uppercase tracking-wider"
            >
              Messages Tracked
            </p>
            <p class="text-lg font-black text-white">
              {{ formatNumber(data?.stats?.totalMessages || 0) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- YOUR SERVERS -->
    <div v-if="userStore.initialized && userStore.isLoggedIn && myServers.length > 0" class="space-y-4">
      <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
        <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-indigo-400" />
        Your Servers
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NuxtLink
          v-for="server in myServers"
          :key="server.guildId"
          :to="`/xp/${server.guildId}`"
          class="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-indigo-500/30 hover:bg-white/[0.06] transition-all group"
        >
          <div
            class="w-11 h-11 rounded-xl bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center"
          >
            <img
              v-if="server.icon"
              :src="getServerIconUrl(server.guildId, server.icon)"
              :alt="server.name"
              class="w-full h-full object-cover"
            />
            <UIcon
              v-else
              name="i-heroicons-server-stack"
              class="w-5 h-5 text-indigo-400"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-bold text-white text-sm truncate group-hover:text-indigo-300 transition-colors">
              {{ server.name }}
            </p>
            <p class="text-xs text-zinc-400">
              <template v-if="server.rankedYet">
                Level {{ server.level }} • {{ formatNumber(server.xp) }} XP
              </template>
              <template v-else>Not ranked yet</template>
            </p>
          </div>
          <UBadge
            v-if="server.visibility !== 'public'"
            color="neutral"
            variant="subtle"
            size="xs"
            class="shrink-0"
          >
            {{ server.visibility === "private" ? "Private" : "Unlisted" }}
          </UBadge>
        </NuxtLink>
      </div>
    </div>

    <!-- YOUR SERVERS: LOGGED OUT PROMPT -->
    <div
      v-else-if="userStore.initialized && !userStore.isLoggedIn"
      class="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/10"
    >
      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-user-circle" class="w-6 h-6 text-indigo-400 shrink-0" />
        <p class="text-sm text-zinc-300">
          Log in with Discord to jump straight to the servers you're already ranked in.
        </p>
      </div>
      <UButton
        :href="`/api/auth/discord?returnTo=${encodeURIComponent('/xp')}`"
        external
        color="primary"
        variant="soft"
        size="sm"
        icon="i-simple-icons-discord"
        class="shrink-0"
      >
        Log In with Discord
      </UButton>
    </div>

    <!-- TOP 3 SERVERS PODIUM (if page === 1 and no active search) -->
    <div
      v-if="page === 1 && !searchQuery && podium.length >= 3"
      class="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-4"
    >
      <!-- 2nd Place (Silver) -->
      <div
        class="order-2 md:order-1 relative rounded-2xl p-6 border border-slate-400/20 bg-gradient-to-b from-slate-800/40 via-slate-900/60 to-zinc-950/80 backdrop-blur-xl space-y-4 text-center hover:scale-[1.02] transition-all shadow-xl hover:shadow-slate-500/10"
      >
        <div
          class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-slate-400/20 border border-slate-400/40 text-slate-300 text-xs font-bold flex items-center gap-1"
        >
          🥈 #2 Server
        </div>
        <div
          class="w-20 h-20 mx-auto rounded-2xl ring-4 ring-slate-400/40 p-1 bg-zinc-900 overflow-hidden mt-2 flex items-center justify-center"
        >
          <img
            v-if="podium[1]?.icon"
            :src="getServerIconUrl(podium[1]?.guildId, podium[1]?.icon)"
            :alt="podium[1]?.name"
            class="w-full h-full rounded-xl object-cover"
          />
          <UIcon
            v-else
            name="i-heroicons-server-stack"
            class="w-10 h-10 text-slate-400"
          />
        </div>
        <div>
          <h3 class="font-bold text-white text-lg truncate">
            {{ podium[1]?.name }}
          </h3>
          <p class="text-xs text-slate-400 font-semibold">
            {{ formatNumber(podium[1]?.totalXp) }} XP
          </p>
          <span
            class="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-white/5 text-[11px] text-zinc-400 font-medium"
          >
            {{ formatNumber(podium[1]?.activeMembers) }} members •
            {{ formatNumber(podium[1]?.totalMessages) }} msgs
          </span>
        </div>
        <div class="pt-2">
          <UButton
            :to="`/xp/${podium[1]?.guildId}`"
            color="neutral"
            variant="outline"
            size="sm"
            class="w-full justify-center"
          >
            View Server Leaderboard
          </UButton>
        </div>
      </div>

      <!-- 1st Place (Gold) -->
      <div
        class="order-1 md:order-2 relative rounded-2xl p-7 border-2 border-amber-400/50 bg-gradient-to-b from-amber-500/20 via-zinc-900/80 to-zinc-950/95 backdrop-blur-xl space-y-4 text-center hover:scale-[1.03] transition-all shadow-2xl shadow-amber-500/10 md:-translate-y-4"
      >
        <div
          class="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-lg shadow-amber-500/30"
        >
          <UIcon name="i-heroicons-trophy" class="w-3.5 h-3.5" />
          🏆 #1 Champion
        </div>
        <div
          class="w-24 h-24 mx-auto rounded-2xl ring-4 ring-amber-400 p-1 bg-zinc-900 overflow-hidden mt-3 shadow-lg shadow-amber-500/20 flex items-center justify-center"
        >
          <img
            v-if="podium[0]?.icon"
            :src="getServerIconUrl(podium[0]?.guildId, podium[0]?.icon)"
            :alt="podium[0]?.name"
            class="w-full h-full rounded-xl object-cover"
          />
          <UIcon
            v-else
            name="i-heroicons-server-stack"
            class="w-12 h-12 text-amber-400"
          />
        </div>
        <div>
          <h3 class="font-black text-white text-xl truncate">
            {{ podium[0]?.name }}
          </h3>
          <p class="text-sm text-amber-300 font-bold">
            {{ formatNumber(podium[0]?.totalXp) }} Total XP
          </p>
          <span
            class="inline-block mt-1.5 px-3 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-xs text-amber-300 font-semibold"
          >
            {{ formatNumber(podium[0]?.activeMembers) }} members •
            {{ formatNumber(podium[0]?.totalMessages) }} msgs
          </span>
        </div>
        <div class="pt-2">
          <UButton
            :to="`/xp/${podium[0]?.guildId}`"
            color="primary"
            size="md"
            class="w-full justify-center font-bold shadow-lg shadow-indigo-500/20"
          >
            View Server Leaderboard
          </UButton>
        </div>
      </div>

      <!-- 3rd Place (Bronze) -->
      <div
        class="order-3 relative rounded-2xl p-6 border border-amber-700/30 bg-gradient-to-b from-amber-950/20 via-zinc-900/60 to-zinc-950/80 backdrop-blur-xl space-y-4 text-center hover:scale-[1.02] transition-all shadow-xl hover:shadow-amber-900/10"
      >
        <div
          class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-700/20 border border-amber-700/40 text-amber-500 text-xs font-bold flex items-center gap-1"
        >
          🥉 #3 Server
        </div>
        <div
          class="w-20 h-20 mx-auto rounded-2xl ring-4 ring-amber-700/40 p-1 bg-zinc-900 overflow-hidden mt-2 flex items-center justify-center"
        >
          <img
            v-if="podium[2]?.icon"
            :src="getServerIconUrl(podium[2]?.guildId, podium[2]?.icon)"
            :alt="podium[2]?.name"
            class="w-full h-full rounded-xl object-cover"
          />
          <UIcon
            v-else
            name="i-heroicons-server-stack"
            class="w-10 h-10 text-amber-600"
          />
        </div>
        <div>
          <h3 class="font-bold text-white text-lg truncate">
            {{ podium[2]?.name }}
          </h3>
          <p class="text-xs text-amber-400 font-semibold">
            {{ formatNumber(podium[2]?.totalXp) }} XP
          </p>
          <span
            class="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-white/5 text-[11px] text-zinc-400 font-medium"
          >
            {{ formatNumber(podium[2]?.activeMembers) }} members •
            {{ formatNumber(podium[2]?.totalMessages) }} msgs
          </span>
        </div>
        <div class="pt-2">
          <UButton
            :to="`/xp/${podium[2]?.guildId}`"
            color="neutral"
            variant="outline"
            size="sm"
            class="w-full justify-center"
          >
            View Server Leaderboard
          </UButton>
        </div>
      </div>
    </div>

    <!-- SERVER LEADERBOARD DIRECTORY & SEARCH -->
    <div
      class="rounded-3xl border border-white/10 bg-zinc-900/50 backdrop-blur-2xl p-6 sm:p-8 space-y-6 shadow-2xl"
    >
      <!-- Table Header & Controls -->
      <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6"
      >
        <div>
          <h2 class="text-xl font-bold text-white tracking-tight">
            All Public Discord Servers
          </h2>
          <p class="text-xs text-zinc-400">
            Click any server to browse its individual member leaderboard
          </p>
        </div>

        <div class="flex items-center gap-3">
          <div class="w-full sm:w-72">
            <UInput
              v-model="searchQuery"
              icon="i-heroicons-magnifying-glass"
              placeholder="Search public servers..."
              size="md"
              class="w-full"
            />
          </div>
        </div>
      </div>

      <!-- Servers List -->
      <div class="space-y-2">
        <NuxtLink
          v-for="server in data?.servers || []"
          :key="server.guildId"
          :to="`/xp/${server.guildId}`"
          class="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 hover:bg-white/[0.05] transition-all duration-150 group"
        >
          <!-- Rank Badge -->
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 border"
            :class="rankBadgeClass(server.rank)"
          >
            #{{ server.rank }}
          </div>

          <!-- Server Icon -->
          <div
            class="w-12 h-12 rounded-xl bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center"
          >
            <img
              v-if="server.icon"
              :src="getServerIconUrl(server.guildId, server.icon)"
              :alt="server.name"
              class="w-full h-full object-cover"
            />
            <UIcon
              v-else
              name="i-heroicons-server-stack"
              class="w-6 h-6 text-indigo-400"
            />
          </div>

          <!-- Server Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span
                class="font-bold text-white text-base truncate group-hover:text-indigo-300 transition-colors"
              >
                {{ server.name }}
              </span>
              <UBadge
                color="primary"
                variant="subtle"
                size="xs"
                class="hidden sm:inline-flex"
              >
                Public
              </UBadge>
            </div>
            <div class="flex items-center gap-3 text-xs text-zinc-400 mt-0.5">
              <span class="flex items-center gap-1">
                <UIcon name="i-heroicons-users" class="w-3.5 h-3.5 text-zinc-500" />
                {{ formatNumber(server.activeMembers) }} members
              </span>
              <span>•</span>
              <span class="flex items-center gap-1">
                <UIcon
                  name="i-heroicons-chat-bubble-left-right"
                  class="w-3.5 h-3.5 text-zinc-500"
                />
                {{ formatNumber(server.totalMessages) }} messages
              </span>
            </div>
          </div>

          <!-- Cumulative XP -->
          <div class="text-right shrink-0">
            <p class="font-black text-white text-sm sm:text-base tabular-nums">
              {{ formatNumber(server.totalXp) }}
              <span class="text-[10px] font-bold text-indigo-400 uppercase ml-0.5"
                >XP</span
              >
            </p>
            <p class="text-[10px] text-zinc-500">
              Total Community XP
            </p>
          </div>

          <UIcon
            name="i-heroicons-chevron-right"
            class="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors shrink-0"
          />
        </NuxtLink>

        <div
          v-if="!data?.servers?.length"
          class="text-center py-16 text-zinc-500 space-y-3"
        >
          <UIcon
            name="i-heroicons-server-stack"
            class="w-12 h-12 mx-auto text-zinc-600"
          />
          <div class="space-y-1">
            <p class="text-base font-bold text-zinc-300">No public servers found</p>
            <p class="text-xs text-zinc-500 max-w-sm mx-auto">
              Server owners can opt their server in by setting Leaderboard Visibility to <strong>Public</strong> in the MODUS dashboard!
            </p>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="data && data.totalPages > 1"
        class="flex items-center justify-between pt-4 border-t border-white/10"
      >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-heroicons-chevron-left"
          :disabled="page <= 1"
          @click="page--"
        >
          Previous
        </UButton>

        <span class="text-xs font-semibold text-zinc-400">
          Page <strong class="text-white">{{ page }}</strong> of
          <strong class="text-white">{{ data.totalPages }}</strong>
        </span>

        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          trailing-icon="i-heroicons-chevron-right"
          :disabled="page >= data.totalPages"
          @click="page++"
        >
          Next
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

definePageMeta({
  layout: "landing",
});

const page = ref(1);
const searchQuery = ref("");

const { data } = await useFetch("/api/xp/global", {
  query: {
    page,
    search: searchQuery,
  },
  watch: [page, searchQuery],
});

const userStore = useUserStore();
const myServers = ref<
  Array<{
    guildId: string;
    name: string;
    icon: string | null;
    visibility: "private" | "unlisted" | "public";
    xp: number;
    level: number;
    rankedYet: boolean;
  }>
>([]);
watch(
  () => userStore.initialized,
  async (ready) => {
    if (!ready || !userStore.isLoggedIn) return;
    // Reuse the guild list already fetched during session hydration
    // (userStore.init() -> /api/discord/me) instead of asking Discord
    // again — /users/@me/guilds is tightly rate-limited, and a second
    // near-simultaneous call to it reliably 429s.
    const guildIds = userStore.userGuilds.map((g) => g.id);
    if (guildIds.length === 0) return;
    try {
      myServers.value = await $fetch("/api/xp/my-servers", {
        query: { guildIds: guildIds.join(",") },
      });
    } catch {
      myServers.value = [];
    }
  },
  { immediate: true },
);

const podium = computed(() => {
  return data.value?.top3 || [];
});

function getServerIconUrl(guildId?: string, icon?: string | null) {
  if (!guildId || !icon) return undefined;
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=128`;
}

function formatNumber(n?: number | null) {
  return (n || 0).toLocaleString("en-US");
}

function rankBadgeClass(rank: number) {
  switch (rank) {
    case 1:
      return "bg-amber-400/20 text-amber-300 border-amber-400/40";
    case 2:
      return "bg-slate-300/20 text-slate-200 border-slate-300/40";
    case 3:
      return "bg-amber-700/20 text-amber-500 border-amber-700/40";
    default:
      return "bg-white/5 text-zinc-400 border border-white/5";
  }
}

useHead({
  title: "Server XP Leaderboards • MODUS",
});
</script>
