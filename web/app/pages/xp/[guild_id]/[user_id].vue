<template>
  <div
    class="min-h-screen text-white pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto"
  >
    <!-- Breadcrumb & Back Navigation -->
    <div class="flex items-center justify-between gap-4 mb-8">
      <NuxtLink
        :to="`/xp/${guildId}`"
        class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 hover:text-white border border-white/5 transition-all shadow-sm group"
      >
        <UIcon
          name="i-heroicons-arrow-left"
          class="w-4 h-4 text-zinc-400 group-hover:-translate-x-0.5 transition-transform"
        />
        Back to {{ data?.guild?.name || "Leaderboard" }}
      </NuxtLink>

      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-link"
          @click="copyProfileLink"
        >
          {{ copied ? "Link Copied!" : "Share Profile" }}
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="pending" class="space-y-6">
      <div
        class="h-64 rounded-3xl bg-white/5 border border-white/10 animate-pulse"
      />
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          v-for="i in 4"
          :key="i"
          class="h-28 rounded-2xl bg-white/5 border border-white/10 animate-pulse"
        />
      </div>
    </div>

    <!-- Error State / Not Found -->
    <div
      v-else-if="error || !data?.user"
      class="text-center py-20 px-6 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl max-w-lg mx-auto space-y-4"
    >
      <div
        class="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center"
      >
        <UIcon name="i-heroicons-user-minus" class="w-8 h-8 text-red-400" />
      </div>
      <h2 class="text-xl font-bold text-white">Member Profile Unavailable</h2>
      <p class="text-sm text-zinc-400">
        {{
          (error?.data as { statusMessage?: string } | undefined)?.statusMessage ||
          error?.statusMessage ||
          "This member has no recorded XP or has chosen to keep their profile private."
        }}
      </p>
      <NuxtLink :to="`/xp/${guildId}`">
        <UButton color="primary" variant="solid" class="mt-2">
          Return to Leaderboard
        </UButton>
      </NuxtLink>
    </div>

    <!-- Main Profile Content -->
    <div v-else class="space-y-8">
      <!-- Profile Header Hero Banner -->
      <div
        class="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-indigo-950/40 via-zinc-900/70 to-zinc-950/90 backdrop-blur-2xl p-6 sm:p-10 shadow-2xl shadow-indigo-950/40"
      >
        <!-- Background Ambient Glow -->
        <div
          class="absolute -right-20 -top-20 w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none"
        />
        <div
          class="absolute -left-20 -bottom-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"
        />

        <div
          class="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8 text-center md:text-left"
        >
          <!-- Avatar with Rank Border -->
          <div class="relative shrink-0">
            <div
              class="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl p-1.5 bg-zinc-900 ring-4 overflow-hidden shadow-2xl transition-transform hover:scale-105"
              :class="avatarRingClass(data.user.rank)"
            >
              <img
                :src="getAvatarUrl(data.user.userId, data.user.avatar)"
                :alt="data.user.username"
                class="w-full h-full rounded-2xl object-cover"
              />
            </div>
            <!-- Rank Ribbon -->
            <div
              class="absolute -bottom-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-black shadow-lg flex items-center gap-1 whitespace-nowrap border"
              :class="rankBadgeClass(data.user.rank)"
            >
              <span v-if="data.user.rank === 1">👑 Rank #1</span>
              <span v-else-if="data.user.rank === 2">🥈 Rank #2</span>
              <span v-else-if="data.user.rank === 3">🥉 Rank #3</span>
              <span v-else>Rank #{{ data.user.rank }}</span>
            </div>
          </div>

          <!-- User Info & Level Hero -->
          <div class="flex-1 space-y-3 min-w-0">
            <div class="space-y-1">
              <div
                class="flex flex-wrap items-center justify-center md:justify-start gap-2.5"
              >
                <h1
                  class="text-2xl sm:text-4xl font-black text-white tracking-tight truncate"
                >
                  {{ data.user.username }}
                </h1>
                <span
                  class="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                >
                  Level {{ data.user.level }}
                </span>
              </div>
              <p
                class="text-xs sm:text-sm text-zinc-400 flex items-center justify-center md:justify-start gap-1.5"
              >
                <span class="w-2 h-2 rounded-full bg-emerald-500" />
                Active member in
                <strong class="text-zinc-200">{{ data.guild.name }}</strong>
              </p>
            </div>

            <!-- Next Level Progress Bar -->
            <div class="space-y-2 pt-2 max-w-xl">
              <div
                class="flex justify-between items-center text-xs font-semibold"
              >
                <span class="text-zinc-400">Level Progression</span>
                <span class="text-indigo-400 font-bold"
                  >{{ data.user.progressPercent }}% Complete</span
                >
              </div>
              <div
                class="w-full h-3 rounded-full bg-white/10 overflow-hidden p-0.5 border border-white/5"
              >
                <div
                  class="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-700 shadow-sm"
                  :style="{ width: `${data.user.progressPercent}%` }"
                />
              </div>
              <div class="flex justify-between text-[11px] text-zinc-500">
                <span
                  >{{ formatNumber(data.user.xpInCurrentLevel) }} XP
                  earned</span
                >
                <span
                  >{{ formatNumber(data.user.xpNeededForNextLevel) }} XP needed
                  for Level {{ data.user.level + 1 }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <!-- Rank Card -->
        <div
          class="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-1 text-center sm:text-left hover:border-white/20 transition-colors"
        >
          <div
            class="flex items-center justify-center sm:justify-between text-zinc-400 mb-2"
          >
            <span class="text-xs font-bold uppercase tracking-wider"
              >Server Rank</span
            >
            <UIcon
              name="i-heroicons-trophy"
              class="w-4 h-4 text-amber-400 hidden sm:block"
            />
          </div>
          <p class="text-2xl sm:text-3xl font-black text-white">
            #{{ data.user.rank }}
          </p>
          <p class="text-[11px] text-zinc-500 truncate">
            Top
            {{ calculateTopPercent(data.user.rank, data.totalTrackedMembers) }}%
            of members
          </p>
        </div>

        <!-- Level Card -->
        <div
          class="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-1 text-center sm:text-left hover:border-white/20 transition-colors"
        >
          <div
            class="flex items-center justify-center sm:justify-between text-zinc-400 mb-2"
          >
            <span class="text-xs font-bold uppercase tracking-wider"
              >Level</span
            >
            <UIcon
              name="i-heroicons-sparkles"
              class="w-4 h-4 text-indigo-400 hidden sm:block"
            />
          </div>
          <p class="text-2xl sm:text-3xl font-black text-white">
            {{ data.user.level }}
          </p>
          <p class="text-[11px] text-zinc-500 truncate">
            {{ formatNumber(data.user.xp) }} Lifetime XP
          </p>
        </div>

        <!-- Messages Card -->
        <div
          class="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-1 text-center sm:text-left hover:border-white/20 transition-colors"
        >
          <div
            class="flex items-center justify-center sm:justify-between text-zinc-400 mb-2"
          >
            <span class="text-xs font-bold uppercase tracking-wider"
              >Messages</span
            >
            <UIcon
              name="i-heroicons-chat-bubble-left-right"
              class="w-4 h-4 text-purple-400 hidden sm:block"
            />
          </div>
          <p class="text-2xl sm:text-3xl font-black text-white">
            {{ formatNumber(data.user.messageCount) }}
          </p>
          <p class="text-[11px] text-zinc-500 truncate">Messages recorded</p>
        </div>

        <!-- Characters Card -->
        <div
          class="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-1 text-center sm:text-left hover:border-white/20 transition-colors"
        >
          <div
            class="flex items-center justify-center sm:justify-between text-zinc-400 mb-2"
          >
            <span class="text-xs font-bold uppercase tracking-wider"
              >Characters</span
            >
            <UIcon
              name="i-heroicons-document-text"
              class="w-4 h-4 text-pink-400 hidden sm:block"
            />
          </div>
          <p class="text-2xl sm:text-3xl font-black text-white">
            {{ formatNumber(data.user.charCount) }}
          </p>
          <p class="text-[11px] text-zinc-500 truncate">Characters typed</p>
        </div>
      </div>

      <!-- Visual Discord Rank Card Preview -->
      <div
        class="rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-6 sm:p-8 space-y-6"
      >
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
              <UIcon
                name="i-heroicons-sparkles"
                class="w-5 h-5 text-indigo-400"
              />
              Discord Visual Rank Card
            </h2>
            <p class="text-xs text-zinc-400 mt-0.5">
              Rendered visual banner generated for
              <code class="text-indigo-300">/rank</code> in Discord
            </p>
          </div>
          <a
            :href="rankCardRenderUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 hover:text-white border border-white/5 transition-all self-start sm:self-auto"
          >
            <UIcon
              name="i-heroicons-arrow-top-right-on-square"
              class="w-4 h-4"
            />
            Open Full Size
          </a>
        </div>

        <div
          class="rounded-2xl border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center p-2 shadow-inner"
        >
          <img
            :src="rankCardRenderUrl"
            :alt="`${data.user.username}'s Rank Card`"
            class="w-full max-w-2xl h-auto rounded-xl object-contain shadow-lg"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

definePageMeta({
  layout: "landing",
});

interface XpUserProfileResponse {
  guild: {
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
  };
  user: {
    userId: string;
    guildId: string;
    username: string;
    avatar: string | null;
    xp: number;
    level: number;
    rank: number;
    messageCount: number;
    charCount: number;
    lastXpGainAt: Date | string | null;
    notificationPref: string;
    optedIn: boolean;
    hiddenFromLeaderboard: boolean;
    progressPercent: number;
    currentLevelBaseXp: number;
    nextLevelBaseXp: number;
    xpInCurrentLevel: number;
    xpNeededForNextLevel: number;
  };
  totalTrackedMembers: number;
}

const route = useRoute();
const guildId = computed(() => String(route.params.guild_id));
const userId = computed(() => String(route.params.user_id));

const { data, pending, error } = await useFetch<XpUserProfileResponse>(
  () => `/api/xp/${guildId.value}/${userId.value}`,
);

const copied = ref(false);

function copyProfileLink() {
  if (typeof window === "undefined") return;
  navigator.clipboard.writeText(window.location.href);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function getAvatarUrl(uid?: string, avatar?: string | null) {
  if (avatar) {
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
      return avatar;
    }
    const ext = avatar.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${uid}/${avatar}.${ext}?size=128`;
  }
  if (!uid) return "https://cdn.discordapp.com/embed/avatars/0.png";
  try {
    const num = Number((BigInt(uid) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${num}.png`;
  } catch {
    const num = (parseInt(uid.slice(-2), 10) || 0) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${num}.png`;
  }
}

const rankCardRenderUrl = computed(() => {
  if (!data.value?.user) return "";
  return `/api/xp/${guildId.value}/${userId.value}/card`;
});

function formatNumber(n?: number) {
  return (n || 0).toLocaleString("en-US");
}

function calculateTopPercent(rank: number, total: number) {
  if (!total || total <= 0) return 1;
  const pct = Math.ceil((rank / total) * 100);
  return Math.max(1, Math.min(100, pct));
}

function avatarRingClass(rank: number) {
  switch (rank) {
    case 1:
      return "ring-amber-400 shadow-amber-500/20";
    case 2:
      return "ring-slate-300 shadow-slate-400/20";
    case 3:
      return "ring-amber-700 shadow-amber-800/20";
    default:
      return "ring-indigo-500/40 shadow-indigo-500/10";
  }
}

function rankBadgeClass(rank: number) {
  switch (rank) {
    case 1:
      return "bg-amber-400/20 text-amber-300 border-amber-400/50 shadow-amber-500/30";
    case 2:
      return "bg-slate-300/20 text-slate-200 border-slate-300/50 shadow-slate-400/30";
    case 3:
      return "bg-amber-700/20 text-amber-500 border-amber-700/50 shadow-amber-800/30";
    default:
      return "bg-zinc-900/90 text-zinc-300 border-white/10 shadow-black/40";
  }
}

useHead(() => {
  const username = data.value?.user?.username || "Member";
  const guildName = data.value?.guild?.name || "Server";
  return {
    title: `${username} • ${guildName} XP Rank • MODUS`,
    meta: [
      {
        name: "description",
        content: `View ${username}'s XP ranking, level progression, and stats in ${guildName}.`,
      },
    ],
  };
});
</script>
