<template>
  <div class="py-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-12 mt-12">
    <!-- PRIVATE LEADERBOARD NOTICE -->
    <div
      v-if="data?.isPrivate"
      class="py-20 text-center space-y-6 max-w-lg mx-auto"
    >
      <div
        class="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-xl"
      >
        <UIcon name="i-heroicons-lock-closed" class="w-8 h-8" />
      </div>
      
      <!-- Gated: Requires Discord Login -->
      <div v-if="data?.requiresAuth" class="space-y-4">
        <div class="space-y-2">
          <h2 class="text-2xl font-bold text-white tracking-tight">
            Members-Only Leaderboard
          </h2>
          <p class="text-sm text-zinc-400 leading-relaxed">
            This server's leaderboard is private and only visible to verified server members. Log in with Discord to verify your membership and view your server's rankings.
          </p>
        </div>
        <div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <UButton
            href="/auth/discord"
            external
            color="primary"
            size="lg"
            icon="i-simple-icons-discord"
            class="font-semibold shadow-lg shadow-indigo-500/20"
          >
            Log In with Discord
          </UButton>
          <UButton
            to="/xp"
            color="neutral"
            variant="ghost"
            size="lg"
            icon="i-heroicons-arrow-left"
          >
            Explore Public Leaderboards
          </UButton>
        </div>
      </div>

      <!-- Logged in but not a member of this server -->
      <div v-else-if="data?.notMember" class="space-y-4">
        <div class="space-y-2">
          <h2 class="text-2xl font-bold text-white tracking-tight">
            Server Membership Required
          </h2>
          <p class="text-sm text-zinc-400 leading-relaxed">
            You are logged in, but you don't have active XP or membership in this server. Join the Discord server and chat to earn XP and view member rankings!
          </p>
        </div>
        <div class="pt-2">
          <UButton
            to="/xp"
            color="neutral"
            variant="outline"
            icon="i-heroicons-arrow-left"
          >
            Explore Public Leaderboards
          </UButton>
        </div>
      </div>

      <!-- Generic Private fallback -->
      <div v-else class="space-y-4">
        <div class="space-y-2">
          <h2 class="text-2xl font-bold text-white tracking-tight">
            This Leaderboard is Private
          </h2>
          <p class="text-sm text-zinc-400 leading-relaxed">
            The server owner has configured this leaderboard to be viewable only by server members internally via bot commands (<code class="text-indigo-300 font-mono">/rank</code>, <code class="text-indigo-300 font-mono">/xp leaderboard</code>).
          </p>
        </div>
        <div class="pt-2">
          <UButton
            to="/xp"
            color="neutral"
            variant="outline"
            icon="i-heroicons-arrow-left"
          >
            Explore Public Leaderboards
          </UButton>
        </div>
      </div>
    </div>

    <!-- PUBLIC / UNLISTED LEADERBOARD VIEW -->
    <template v-else>
      <!-- HERO SECTION -->
      <div class="text-center space-y-4 pt-4">
        <div
          class="inline-flex items-center justify-center p-1.5 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 border border-white/10 shadow-2xl backdrop-blur-xl mb-2"
        >
          <div
            class="w-20 h-20 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center"
          >
            <img
              v-if="data?.guild?.icon"
              :src="guildIconUrl"
              :alt="data.guild.name"
              class="w-full h-full object-cover"
            />
            <UIcon
              v-else
              name="i-heroicons-server-stack"
              class="w-10 h-10 text-indigo-400"
            />
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-center gap-2">
            <div
              class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider"
            >
              <UIcon name="i-heroicons-trophy" class="w-3.5 h-3.5" />
              Server Leaderboard
            </div>
            <div
              v-if="data?.visibility === 'unlisted'"
              class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-medium"
            >
              <UIcon name="i-heroicons-link" class="w-3 h-3" />
              Unlisted
            </div>
          </div>
          <h1 class="text-3xl sm:text-5xl font-black text-white tracking-tight">
            {{ data?.guild?.name || "Server Leaderboard" }}
          </h1>
          <p class="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto">
            Top active members ranked by message activity and XP. Chat in the
            server to climb the leaderboard!
          </p>
        </div>

      <!-- Quick Stats Badges -->
      <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
        <div
          class="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center gap-2.5"
        >
          <UIcon name="i-heroicons-users" class="text-indigo-400 text-lg" />
          <div class="text-left">
            <p
              class="text-[10px] text-zinc-500 font-bold uppercase tracking-wider"
            >
              Ranked Members
            </p>
            <p class="text-sm font-black text-white">
              {{ formatNumber(data?.stats?.totalTrackedMembers || 0) }}
            </p>
          </div>
        </div>

        <div
          class="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center gap-2.5"
        >
          <UIcon name="i-heroicons-bolt" class="text-purple-400 text-lg" />
          <div class="text-left">
            <p
              class="text-[10px] text-zinc-500 font-bold uppercase tracking-wider"
            >
              Total XP Earned
            </p>
            <p class="text-sm font-black text-white">
              {{ formatNumber(data?.stats?.totalXp || 0) }}
            </p>
          </div>
        </div>

        <div
          class="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center gap-2.5"
        >
          <UIcon
            name="i-heroicons-chat-bubble-left-right"
            class="text-pink-400 text-lg"
          />
          <div class="text-left">
            <p
              class="text-[10px] text-zinc-500 font-bold uppercase tracking-wider"
            >
              Messages Counted
            </p>
            <p class="text-sm font-black text-white">
              {{ formatNumber(data?.stats?.totalMessages || 0) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- TOP 3 PODIUM (if page === 1 and no active search) -->
    <div
      v-if="page === 1 && !searchQuery && podium.length >= 3"
      class="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-4"
    >
      <!-- 2nd Place (Silver) -->
      <NuxtLink
        :to="`/xp/${guildId}/${podium[1]?.userId}`"
        class="order-2 md:order-1 relative rounded-2xl p-6 border border-slate-400/20 bg-gradient-to-b from-slate-800/40 via-slate-900/60 to-zinc-950/80 backdrop-blur-xl space-y-4 text-center cursor-pointer hover:scale-[1.02] transition-all shadow-xl hover:shadow-slate-500/10"
      >
        <div
          class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-slate-400/20 border border-slate-400/40 text-slate-300 text-xs font-bold flex items-center gap-1"
        >
          🥈 #2 Silver
        </div>
        <div
          class="w-20 h-20 mx-auto rounded-full ring-4 ring-slate-400/40 p-1 bg-zinc-900 overflow-hidden mt-2"
        >
          <img
            :src="getAvatarUrl(podium[1]?.userId, podium[1]?.avatar)"
            :alt="podium[1]?.username"
            class="w-full h-full rounded-full object-cover"
          />
        </div>
        <div>
          <h3 class="font-bold text-white text-lg truncate">
            {{ podium[1]?.username }}
          </h3>
          <p class="text-xs text-slate-400 font-semibold">
            Level {{ podium[1]?.level }} • {{ formatNumber(podium[1]?.xp) }} XP
          </p>
        </div>
        <div class="space-y-1">
          <div class="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              class="h-full bg-slate-300 rounded-full"
              :style="{ width: `${podium[1]?.progressPercent}%` }"
            />
          </div>
          <p class="text-[10px] text-zinc-500">
            {{ podium[1]?.progressPercent }}% to Level
            {{ (podium[1]?.level || 0) + 1 }}
          </p>
        </div>
      </NuxtLink>

      <!-- 1st Place (Gold) -->
      <NuxtLink
        :to="`/xp/${guildId}/${podium[0]?.userId}`"
        class="order-1 md:order-2 relative rounded-2xl p-8 border border-amber-400/30 bg-gradient-to-b from-amber-900/30 via-zinc-900/80 to-zinc-950/90 backdrop-blur-2xl space-y-5 text-center cursor-pointer hover:scale-[1.03] transition-all shadow-2xl shadow-amber-500/10 hover:shadow-amber-500/20 md:-translate-y-4"
      >
        <div
          class="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-amber-400/20 border border-amber-400/50 text-amber-300 text-sm font-black flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
        >
          👑 #1 Champion
        </div>
        <div
          class="w-24 h-24 mx-auto rounded-full ring-4 ring-amber-400/60 p-1 bg-zinc-900 overflow-hidden mt-3 shadow-lg shadow-amber-400/20"
        >
          <img
            :src="getAvatarUrl(podium[0]?.userId, podium[0]?.avatar)"
            :alt="podium[0]?.username"
            class="w-full h-full rounded-full object-cover"
          />
        </div>
        <div>
          <h3 class="font-black text-white text-xl truncate">
            {{ podium[0]?.username }}
          </h3>
          <span
            class="inline-block px-2.5 py-0.5 mt-1 rounded-md bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-bold"
          >
            Level {{ podium[0]?.level }} • {{ formatNumber(podium[0]?.xp) }} XP
          </span>
        </div>
        <div class="space-y-1.5">
          <div class="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-amber-400 to-amber-200 rounded-full"
              :style="{ width: `${podium[0]?.progressPercent}%` }"
            />
          </div>
          <p class="text-xs text-amber-400/80 font-medium">
            {{ podium[0]?.progressPercent }}% to Level
            {{ (podium[0]?.level || 0) + 1 }}
          </p>
        </div>
      </NuxtLink>

      <!-- 3rd Place (Bronze) -->
      <NuxtLink
        :to="`/xp/${guildId}/${podium[2]?.userId}`"
        class="order-3 relative rounded-2xl p-6 border border-amber-700/30 bg-gradient-to-b from-amber-950/30 via-zinc-900/60 to-zinc-950/80 backdrop-blur-xl space-y-4 text-center cursor-pointer hover:scale-[1.02] transition-all shadow-xl hover:shadow-amber-900/10"
      >
        <div
          class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-700/20 border border-amber-700/40 text-amber-500 text-xs font-bold flex items-center gap-1"
        >
          🥉 #3 Bronze
        </div>
        <div
          class="w-20 h-20 mx-auto rounded-full ring-4 ring-amber-700/40 p-1 bg-zinc-900 overflow-hidden mt-2"
        >
          <img
            :src="getAvatarUrl(podium[2]?.userId, podium[2]?.avatar)"
            :alt="podium[2]?.username"
            class="w-full h-full rounded-full object-cover"
          />
        </div>
        <div>
          <h3 class="font-bold text-white text-lg truncate">
            {{ podium[2]?.username }}
          </h3>
          <p class="text-xs text-amber-600 font-semibold">
            Level {{ podium[2]?.level }} • {{ formatNumber(podium[2]?.xp) }} XP
          </p>
        </div>
        <div class="space-y-1">
          <div class="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              class="h-full bg-amber-600 rounded-full"
              :style="{ width: `${podium[2]?.progressPercent}%` }"
            />
          </div>
          <p class="text-[10px] text-zinc-500">
            {{ podium[2]?.progressPercent }}% to Level
            {{ (podium[2]?.level || 0) + 1 }}
          </p>
        </div>
      </NuxtLink>
    </div>

    <!-- MAIN LEADERBOARD CARD -->
    <div
      class="relative rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900/80 via-zinc-950/90 to-black backdrop-blur-2xl p-6 sm:p-8 shadow-2xl space-y-6"
    >
      <!-- Search & Filters -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="w-full sm:w-80 relative">
          <UInput
            v-model="searchQuery"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search member by username or ID..."
            size="md"
            class="w-full"
            :ui="{
              base: 'bg-white/5 border-white/10 focus:border-indigo-500 text-white placeholder-zinc-500 rounded-xl',
            }"
          />
        </div>

        <div class="text-xs text-zinc-400 flex items-center gap-2">
          <span
            >Showing <strong>{{ data?.users?.length || 0 }}</strong> of
            <strong>{{ formatNumber(data?.total || 0) }}</strong> ranked
            members</span
          >
        </div>
      </div>

      <!-- Leaderboard List / Table -->
      <div class="space-y-2">
        <NuxtLink
          v-for="user in data?.users"
          :key="user.id"
          :to="`/xp/${guildId}/${user.userId}`"
          class="flex items-center gap-4 p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all cursor-pointer group"
        >
          <!-- Rank Badge -->
          <div
            class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm"
            :class="rankBadgeClass(user.rank)"
          >
            <span v-if="user.rank === 1">🥇</span>
            <span v-else-if="user.rank === 2">🥈</span>
            <span v-else-if="user.rank === 3">🥉</span>
            <span v-else>#{{ user.rank }}</span>
          </div>

          <!-- Avatar -->
          <div
            class="w-10 h-10 sm:w-11 sm:h-11 rounded-full ring-2 ring-white/10 group-hover:ring-indigo-500/50 p-0.5 bg-zinc-900 shrink-0 overflow-hidden transition-colors"
          >
            <img
              :src="getAvatarUrl(user.userId, user.avatar)"
              :alt="user.username"
              class="w-full h-full rounded-full object-cover"
            />
          </div>

          <!-- Username & Subtitle -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p
                class="font-bold text-white text-sm sm:text-base truncate group-hover:text-indigo-300 transition-colors"
              >
                {{ user.username }}
              </p>
              <UBadge
                color="primary"
                variant="subtle"
                size="xs"
                class="hidden sm:inline-flex"
              >
                Level {{ user.level }}
              </UBadge>
            </div>
            <p class="text-xs text-zinc-500 truncate sm:hidden">
              Level {{ user.level }} • {{ formatNumber(user.xp) }} XP
            </p>
          </div>

          <!-- Progress Bar (Desktop) -->
          <div class="hidden md:block w-48 space-y-1">
            <div
              class="flex justify-between text-[11px] text-zinc-400 font-medium"
            >
              <span>Progress</span>
              <span>{{ user.progressPercent }}%</span>
            </div>
            <div class="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                :style="{ width: `${user.progressPercent}%` }"
              />
            </div>
          </div>

          <!-- XP Count -->
          <div class="text-right shrink-0">
            <p class="font-black text-white text-sm sm:text-base tabular-nums">
              {{ formatNumber(user.xp) }}
              <span class="text-[10px] font-bold text-zinc-500 uppercase ml-0.5"
                >XP</span
              >
            </p>
            <p class="text-[10px] text-zinc-500 hidden sm:block">
              {{ formatNumber(user.messageCount) }} messages
            </p>
          </div>

          <UIcon
            name="i-heroicons-chevron-right"
            class="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors shrink-0"
          />
        </NuxtLink>

        <div
          v-if="!data?.users?.length"
          class="text-center py-12 text-zinc-500"
        >
          <UIcon
            name="i-heroicons-trophy"
            class="w-10 h-10 mx-auto mb-2 opacity-40"
          />
          <p class="text-base font-bold text-zinc-400">No members found</p>
          <p class="text-xs text-zinc-600">
            Try adjusting your search query or start chatting in the server
          </p>
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

    <!-- USER DETAIL MODAL -->
    <UModal v-model="isModalOpen">
      <template #content>
        <div
          class="p-6 bg-zinc-950 border border-white/10 rounded-2xl space-y-6 text-center"
        >
          <div v-if="selectedUser" class="space-y-4">
            <div
              class="w-20 h-20 mx-auto rounded-full ring-4 ring-indigo-500/40 p-1 bg-zinc-900 overflow-hidden"
            >
              <img
                :src="getAvatarUrl(selectedUser.userId, selectedUser.avatar)"
                :alt="selectedUser.username"
                class="w-full h-full rounded-full object-cover"
              />
            </div>
            <div>
              <h3 class="text-xl font-black text-white">
                {{ selectedUser.username }}
              </h3>
              <p class="text-xs text-zinc-400">
                Rank #{{ selectedUser.rank }} in {{ data?.guild?.name }}
              </p>
            </div>

            <div class="grid grid-cols-3 gap-2 py-2">
              <div class="p-3 rounded-xl bg-white/5 border border-white/5">
                <p class="text-[10px] text-zinc-500 font-bold uppercase">
                  Level
                </p>
                <p class="text-lg font-black text-indigo-400">
                  {{ selectedUser.level }}
                </p>
              </div>
              <div class="p-3 rounded-xl bg-white/5 border border-white/5">
                <p class="text-[10px] text-zinc-500 font-bold uppercase">
                  Total XP
                </p>
                <p class="text-lg font-black text-purple-400">
                  {{ formatNumber(selectedUser.xp) }}
                </p>
              </div>
              <div class="p-3 rounded-xl bg-white/5 border border-white/5">
                <p class="text-[10px] text-zinc-500 font-bold uppercase">
                  Messages
                </p>
                <p class="text-lg font-black text-pink-400">
                  {{ formatNumber(selectedUser.messageCount) }}
                </p>
              </div>
            </div>

            <div
              class="space-y-2 text-left p-4 rounded-xl bg-white/[0.02] border border-white/5"
            >
              <div class="flex justify-between text-xs font-semibold">
                <span class="text-zinc-400">Next Level Progress</span>
                <span class="text-indigo-400"
                  >{{ selectedUser.progressPercent }}%</span
                >
              </div>
              <div
                class="w-full h-2.5 rounded-full bg-white/10 overflow-hidden"
              >
                <div
                  class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                  :style="{ width: `${selectedUser.progressPercent}%` }"
                />
              </div>
              <p class="text-[11px] text-zinc-500">
                {{ formatNumber(selectedUser.xpInCurrentLevel) }} /
                {{ formatNumber(selectedUser.xpNeededForNextLevel) }} XP to
                Level {{ selectedUser.level + 1 }}
              </p>
            </div>

            <div class="pt-2">
              <NuxtLink
                :to="`/xp/${guildId}/${selectedUser.userId}`"
                class="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-white border border-indigo-500/30 font-semibold text-xs transition-all shadow-sm group"
              >
                <span>View Full Member Profile</span>
                <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </NuxtLink>
            </div>
          </div>
        </div>
      </template>
    </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";

// Use the sleek Landing page layout requested by the user
definePageMeta({
  layout: "landing",
});

const route = useRoute();
const guildId = computed(() => String(route.params.guild_id));

const page = ref(1);
const searchQuery = ref("");
const selectedUser = ref<any | null>(null);
const isModalOpen = ref(false);

const { data } = await useFetch(() => `/api/xp/${guildId.value}/leaderboard`, {
  query: {
    page,
    search: searchQuery,
  },
  watch: [page, searchQuery],
});

const guildIconUrl = computed(() => {
  const icon = data.value?.guild?.icon;
  if (!icon) return undefined;
  return `https://cdn.discordapp.com/icons/${guildId.value}/${icon}.png?size=128`;
});

const podium = computed(() => {
  return data.value?.top3 || [];
});

function getAvatarUrl(userId?: string, avatar?: string | null) {
  if (avatar) {
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
      return avatar;
    }
    const ext = avatar.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=128`;
  }
  if (!userId) return "https://cdn.discordapp.com/embed/avatars/0.png";
  try {
    const num = Number((BigInt(userId) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${num}.png`;
  } catch {
    const num = (parseInt(userId.slice(-2), 10) || 0) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${num}.png`;
  }
}

function formatNumber(n: number) {
  return (n || 0).toLocaleString("en-US");
}

function rankBadgeClass(rank: number) {
  switch (rank) {
    case 1:
      return "bg-amber-400/20 text-amber-300 border border-amber-400/40";
    case 2:
      return "bg-slate-300/20 text-slate-200 border border-slate-300/40";
    case 3:
      return "bg-amber-700/20 text-amber-500 border border-amber-700/40";
    default:
      return "bg-white/5 text-zinc-400 border border-white/5";
  }
}

function openUserCard(user: any) {
  selectedUser.value = user;
  isModalOpen.value = true;
}

useHead(() => {
  const isUnlisted = data.value?.visibility === "unlisted";
  const isPrivate = data.value?.isPrivate || data.value?.visibility === "private";
  return {
    title: `${data.value?.guild?.name || "XP"} Leaderboard • MODUS`,
    meta: [
      ...(isUnlisted || isPrivate
        ? [{ name: "robots", content: "noindex, nofollow" }]
        : []),
    ],
  };
});
</script>
