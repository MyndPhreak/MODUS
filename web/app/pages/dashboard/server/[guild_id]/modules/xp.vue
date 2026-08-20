<template>
  <div class="p-6 lg:p-8 space-y-8 w-full">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
      <div class="flex items-center gap-4">
        <NuxtLink
          :to="`/dashboard/server/${guildId}/modules`"
          class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center shrink-0"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-5 h-5 text-gray-400" />
        </NuxtLink>
        <div class="flex items-center gap-3.5">
          <div
            class="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/10"
          >
            <UIcon name="i-heroicons-trophy" class="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold text-white tracking-tight">XP & Leveling System</h1>
              <UBadge
                :color="isModuleEnabled('xp') ? 'success' : 'neutral'"
                variant="soft"
                class="font-semibold text-xs"
              >
                {{ isModuleEnabled("xp") ? "Active" : "Disabled" }}
              </UBadge>
            </div>
            <p class="text-sm text-gray-400 mt-0.5">
              Configure XP earning rates, level-up announcements, and design custom rank cards
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 self-start sm:self-auto shrink-0">
        <NuxtLink
          :to="`/xp/${guildId}`"
          target="_blank"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition-all hover:scale-[1.02] shadow-sm"
        >
          <UIcon name="i-heroicons-globe-alt" class="w-4 h-4" />
          <span>Public Server Leaderboard</span>
          <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5 opacity-60" />
        </NuxtLink>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center p-1 bg-white/[0.04] border border-white/[0.08] rounded-xl self-start max-w-md">
      <button
        type="button"
        class="flex-1 flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
        :class="
          activeTab === 'general'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
            : 'text-gray-400 hover:text-white'
        "
        @click="activeTab = 'general'"
      >
        <UIcon name="i-heroicons-adjustments-horizontal" class="w-4 h-4" />
        <span>General Configuration</span>
      </button>
      <button
        type="button"
        class="flex-1 flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
        :class="
          activeTab === 'card'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
            : 'text-gray-400 hover:text-white'
        "
        @click="activeTab = 'card'"
      >
        <UIcon name="i-heroicons-paint-brush" class="w-4 h-4" />
        <span>Rank Card Designer</span>
      </button>
    </div>

    <!-- ======================================================== -->
    <!-- GENERAL SETTINGS TAB                                     -->
    <!-- ======================================================== -->
    <div v-if="activeTab === 'general'" class="space-y-8">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <!-- 1. XP Gain & Activity Rules -->
        <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-gray-900/90 via-gray-900/50 to-gray-950/90 backdrop-blur-xl p-6 sm:p-7 space-y-6 shadow-xl">
          <!-- Card Header -->
          <div class="flex items-center justify-between border-b border-white/10 pb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 class="text-base font-bold text-white">XP Earning Rules</h2>
                <p class="text-xs text-gray-400">Controls how members gain XP per valid chat message</p>
              </div>
            </div>
            <UBadge color="primary" variant="subtle" class="text-xs">
              ~{{ Math.round((settings.minXpPerMessage + settings.maxXpPerMessage) / 2) }} XP / msg avg
            </UBadge>
          </div>

          <!-- Min / Max XP Per Message -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-gray-200">XP Range per Message</label>
              <span class="text-xs text-indigo-300 font-mono font-medium">
                {{ settings.minXpPerMessage }} – {{ settings.maxXpPerMessage }} XP
              </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-2">
                <span class="text-[11px] font-medium text-gray-400 block">Minimum XP</span>
                <div class="flex items-center gap-2">
                  <UInput
                    v-model.number="settings.minXpPerMessage"
                    type="number"
                    :min="1"
                    :max="settings.maxXpPerMessage"
                    class="w-full"
                    size="md"
                  />
                  <span class="text-xs text-gray-500 shrink-0 font-medium">XP</span>
                </div>
              </div>
              <div class="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-2">
                <span class="text-[11px] font-medium text-gray-400 block">Maximum XP</span>
                <div class="flex items-center gap-2">
                  <UInput
                    v-model.number="settings.maxXpPerMessage"
                    type="number"
                    :min="settings.minXpPerMessage"
                    :max="500"
                    class="w-full"
                    size="md"
                  />
                  <span class="text-xs text-gray-500 shrink-0 font-medium">XP</span>
                </div>
              </div>
            </div>
            <p class="text-[11px] text-gray-500">
              Each message awards a randomized amount of XP between the minimum and maximum threshold.
            </p>
          </div>

          <!-- Cooldown -->
          <div class="space-y-3 pt-2 border-t border-white/5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-gray-200">Message Cooldown</label>
              <span class="text-xs text-indigo-300 font-mono font-medium">
                {{ formatCooldown(settings.cooldownSeconds) }}
              </span>
            </div>
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div class="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl p-3 flex-1">
                <UInput
                  v-model.number="settings.cooldownSeconds"
                  type="number"
                  :min="5"
                  :max="3600"
                  class="w-full"
                  size="md"
                />
                <span class="text-xs text-gray-500 shrink-0 font-medium">seconds</span>
              </div>

              <!-- Quick Presets -->
              <div class="flex items-center gap-1.5 shrink-0 bg-white/[0.02] border border-white/5 p-1 rounded-xl">
                <button
                  v-for="preset in [30, 60, 120, 300]"
                  :key="preset"
                  type="button"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  :class="settings.cooldownSeconds === preset ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-400 hover:text-white hover:bg-white/5'"
                  @click="settings.cooldownSeconds = preset"
                >
                  {{ preset >= 60 ? `${preset / 60}m` : `${preset}s` }}
                </button>
              </div>
            </div>
            <p class="text-[11px] text-gray-500">
              Prevents spam by only granting XP once per cooldown interval per user.
            </p>
          </div>

          <!-- Minimum Message Length -->
          <div class="space-y-3 pt-2 border-t border-white/5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold text-gray-200">Minimum Message Length</label>
              <span class="text-xs text-indigo-300 font-mono font-medium">
                {{ settings.minMessageLength }} characters
              </span>
            </div>
            <div class="bg-black/30 border border-white/5 rounded-xl p-3.5 flex items-center gap-3">
              <UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-5 h-5 text-gray-500 shrink-0" />
              <UInput
                v-model.number="settings.minMessageLength"
                type="number"
                :min="1"
                :max="100"
                class="flex-1"
                size="md"
              />
              <span class="text-xs text-gray-500 shrink-0 font-medium">characters minimum</span>
            </div>
            <p class="text-[11px] text-gray-500">
              Messages shorter than this character length (such as single emojis or "k") are ignored.
            </p>
          </div>
        </div>

        <!-- 2. Level-Up Announcements & Live Preview -->
        <div class="space-y-6">
          <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-gray-900/90 via-gray-900/50 to-gray-950/90 backdrop-blur-xl p-6 sm:p-7 space-y-6 shadow-xl">
            <!-- Card Header -->
            <div class="flex items-center gap-3 border-b border-white/10 pb-4">
              <div class="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <UIcon name="i-heroicons-megaphone" class="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 class="text-base font-bold text-white">Level-Up Announcements</h2>
                <p class="text-xs text-gray-400">Where and how the bot celebrates member level-ups</p>
              </div>
            </div>

            <!-- Target Channel -->
            <div class="space-y-2">
              <label class="text-xs font-semibold text-gray-200 block">Announcement Channel</label>
              <USelectMenu
                v-model="settings.announcementChannel"
                :items="channelItems"
                value-key="value"
                placeholder="💬 Post in the channel where user leveled up"
                :loading="state.channelsLoading"
                :clear="{ ariaLabel: 'Clear channel selection' }"
                size="md"
                class="w-full"
              />
              <p class="text-[11px] text-gray-500">
                Choose a specific broadcast channel, or leave empty to announce in the active conversation channel.
              </p>
            </div>

            <!-- Message Template -->
            <div class="space-y-2.5 pt-2 border-t border-white/5">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-gray-200">Celebration Message</label>
                <span class="text-[11px] text-gray-500">Click tags to insert</span>
              </div>
              <UInput
                v-model="settings.levelUpMessage"
                placeholder="🎉 Congratulations {user}, you reached Level {level}!"
                size="lg"
                class="w-full font-medium"
              />

              <!-- Clickable Variable Insert Chips -->
              <div class="flex flex-wrap gap-1.5 pt-1">
                <button
                  v-for="tag in ['{user}', '{username}', '{level}', '{server}']"
                  :key="tag"
                  type="button"
                  class="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-indigo-300 hover:text-white transition-all duration-150 flex items-center gap-1"
                  @click="insertVariable(tag)"
                >
                  <span class="text-indigo-400 font-bold">+</span>
                  <span>{{ tag }}</span>
                </button>
              </div>
            </div>

            <!-- Live Discord Chat Mock Preview -->
            <div class="space-y-2 pt-3 border-t border-white/5">
              <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5 text-indigo-400" />
                Live Discord Message Preview
              </span>

              <div class="rounded-xl border border-white/10 bg-[#313338] p-4 flex items-start gap-3.5 shadow-inner">
                <!-- Bot Avatar -->
                <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shrink-0 shadow-md">
                  <UIcon name="i-lucide-bot" class="w-5 h-5 text-white" />
                </div>
                <!-- Message Content -->
                <div class="flex-1 min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-sm text-white">MODUS</span>
                    <span class="bg-[#5865F2] text-white text-[10px] font-semibold px-1.5 py-0.2 rounded">BOT</span>
                    <span class="text-[11px] text-gray-400">Today at 4:20 PM</span>
                  </div>
                  <p class="text-sm text-gray-200 leading-relaxed break-words font-normal">
                    {{ previewRenderedMessage }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Interactive Progression Calculator Helper -->
      <div class="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-950/40 via-gray-900/60 to-gray-950/90 backdrop-blur-xl p-6 sm:p-7 space-y-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-calculator" class="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 class="text-base font-bold text-white">XP Level Progression Simulator</h3>
              <p class="text-xs text-gray-400">
                Formula: <span class="font-mono text-indigo-300">5×L² + 50×L + 100 XP</span> per level
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3 bg-black/40 border border-white/10 px-4 py-2 rounded-xl">
            <span class="text-xs text-gray-400 font-medium">Test Level:</span>
            <input
              type="range"
              v-model.number="calcLevel"
              min="1"
              max="100"
              class="w-32 accent-indigo-500 cursor-pointer"
            />
            <span class="font-bold font-mono text-base text-indigo-300 min-w-[2.5rem] text-right">
              Lv. {{ calcLevel }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-white/10">
          <div class="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-1">
            <span class="text-[11px] font-medium text-gray-400">Total Lifetime XP Needed</span>
            <p class="text-xl font-bold font-mono text-white">
              {{ simulatedLevelStats.totalXp.toLocaleString() }} <span class="text-xs text-gray-500 font-normal">XP</span>
            </p>
          </div>
          <div class="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-1">
            <span class="text-[11px] font-medium text-gray-400">XP to Reach Level {{ calcLevel + 1 }}</span>
            <p class="text-xl font-bold font-mono text-indigo-400">
              {{ simulatedLevelStats.xpForNext.toLocaleString() }} <span class="text-xs text-gray-500 font-normal">XP</span>
            </p>
          </div>
          <div class="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-1">
            <span class="text-[11px] font-medium text-gray-400">Estimated Messages Needed</span>
            <p class="text-xl font-bold font-mono text-emerald-400">
              ~{{ simulatedLevelStats.estimatedMessages.toLocaleString() }} <span class="text-xs text-gray-500 font-normal">messages</span>
            </p>
          </div>
        </div>
      </div>

      <!-- 4. Leaderboard Visibility & Privacy Settings -->
      <div class="rounded-2xl border border-white/10 bg-gradient-to-br from-gray-900/90 via-gray-900/50 to-gray-950/90 backdrop-blur-xl p-6 sm:p-7 space-y-5 shadow-xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
              <UIcon name="i-heroicons-lock-closed" class="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 class="text-base font-bold text-white">Leaderboard Visibility & Privacy</h2>
              <p class="text-xs text-gray-400">Control who can view your server's leaderboard on the web</p>
            </div>
          </div>
          <UBadge :color="settings.leaderboardVisibility === 'public' ? 'success' : settings.leaderboardVisibility === 'unlisted' ? 'warning' : 'neutral'" variant="subtle" class="capitalize text-xs">
            {{ settings.leaderboardVisibility }}
          </UBadge>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Private Option -->
          <div
            class="relative rounded-xl border p-4.5 cursor-pointer transition-all duration-200 flex flex-col justify-between"
            :class="
              settings.leaderboardVisibility === 'private'
                ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.02]'
            "
            @click="settings.leaderboardVisibility = 'private'"
          >
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-lock-closed" class="w-4 h-4 text-indigo-400" />
                  <span class="text-sm font-bold text-white">Private</span>
                </div>
                <UBadge color="primary" variant="subtle" size="xs">Default</UBadge>
              </div>
              <p class="text-xs text-gray-400 leading-relaxed">
                Leaderboards and ranks are only viewable inside Discord via bot commands (<code class="text-indigo-300">/rank</code>, <code class="text-indigo-300">/xp</code>). The web page is restricted and never indexed.
              </p>
            </div>
            <div class="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-[11px] text-gray-500">
              <UIcon name="i-heroicons-shield-check" class="w-3.5 h-3.5 text-emerald-400" />
              <span>Highest privacy protection</span>
            </div>
          </div>

          <!-- Unlisted Option -->
          <div
            class="relative rounded-xl border p-4.5 cursor-pointer transition-all duration-200 flex flex-col justify-between"
            :class="
              settings.leaderboardVisibility === 'unlisted'
                ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.02]'
            "
            @click="settings.leaderboardVisibility = 'unlisted'"
          >
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-link" class="w-4 h-4 text-amber-400" />
                <span class="text-sm font-bold text-white">Unlisted</span>
              </div>
              <p class="text-xs text-gray-400 leading-relaxed">
                Accessible to anyone with your direct leaderboard link. Protected with <code class="text-amber-300">noindex</code> so search engines will not crawl it, and hidden from global directory listings.
              </p>
            </div>
            <div class="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-[11px] text-gray-500">
              <UIcon name="i-heroicons-eye-slash" class="w-3.5 h-3.5 text-amber-400" />
              <span>Direct URL only</span>
            </div>
          </div>

          <!-- Public Option -->
          <div
            class="relative rounded-xl border p-4.5 cursor-pointer transition-all duration-200 flex flex-col justify-between"
            :class="
              settings.leaderboardVisibility === 'public'
                ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.02]'
            "
            @click="settings.leaderboardVisibility = 'public'"
          >
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-emerald-400" />
                <span class="text-sm font-bold text-white">Public</span>
              </div>
              <p class="text-xs text-gray-400 leading-relaxed">
                Publicly discoverable and indexable by search engines. Listed on the global server leaderboards directory for maximum community engagement.
              </p>
            </div>
            <div class="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 text-[11px] text-gray-500">
              <UIcon name="i-heroicons-magnifying-glass" class="w-3.5 h-3.5 text-emerald-400" />
              <span>Search & directory listed</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-3 text-xs text-gray-400">
          <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-indigo-400 shrink-0" />
          <span>
            <strong>Member Anonymity:</strong> Individual members can also hide their own profile and stats from the web leaderboard at any time using the <code class="text-indigo-300 font-mono">/xp privacy hidden:true</code> command.
          </span>
        </div>
      </div>

      <DashboardModuleAccessSection :guild-id="guildId" module-name="xp" />

      <!-- Action Bar -->
      <div class="flex items-center justify-between pt-4 border-t border-white/10">
        <button
          type="button"
          class="text-xs font-medium text-gray-400 hover:text-white transition-colors"
          @click="resetToDefaults"
        >
          Reset to recommended defaults
        </button>

        <UButton
          color="primary"
          size="lg"
          icon="i-heroicons-check"
          :loading="saving"
          @click="save()"
          class="min-w-[220px] font-bold shadow-lg shadow-primary-500/20"
        >
          Save XP Configuration
        </UButton>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- RANK CARD DESIGNER TAB                                   -->
    <!-- ======================================================== -->
    <RankCardEditor
      v-else
      :guild-id="guildId"
      v-model="settings.cardTemplate"
      class="h-full"
      @save="save"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import RankCardEditor from "~/components/RankCardEditor.vue";
import {
  DEFAULT_RANK_CARD_TEMPLATE,
  getCumulativeXpForLevel,
  type RankCardTemplate,
} from "~/utils/rank-cards";

const route = useRoute();
const guildId = route.params.guild_id as string;
const {
  state,
  isModuleEnabled,
  saveModuleSettings,
  getModuleConfig,
  loadChannels,
  channelOptions,
} = useServerSettings(guildId);
const { setFullBleed, reset: resetPageChrome } = usePageChrome();

const activeTab = ref<"general" | "card">("general");

watch(activeTab, (tab) => {
  if (tab === "card") {
    setFullBleed(true);
  } else {
    resetPageChrome();
  }
});
const saving = ref(false);
const calcLevel = ref(10);

const settings = ref({
  cooldownSeconds: 60,
  minXpPerMessage: 15,
  maxXpPerMessage: 25,
  minMessageLength: 5,
  announcementChannel: "",
  levelUpMessage: "🎉 Congratulations {user}, you leveled up to **Level {level}**!",
  leaderboardVisibility: "private" as "private" | "unlisted" | "public",
  cardTemplate: JSON.parse(JSON.stringify(DEFAULT_RANK_CARD_TEMPLATE)) as RankCardTemplate,
});

const channelItems = computed(() => channelOptions.value);

const formatCooldown = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return remSec > 0 ? `${mins}m ${remSec}s` : `${mins} minute${mins > 1 ? "s" : ""}`;
};

const insertVariable = (variable: string) => {
  if (!settings.value.levelUpMessage.includes(variable)) {
    settings.value.levelUpMessage = `${settings.value.levelUpMessage.trim()} ${variable}`;
  }
};

const previewRenderedMessage = computed(() => {
  const tpl = settings.value.levelUpMessage || "🎉 Congratulations {user}, you reached Level {level}!";
  return tpl
    .replace(/\{user\}/g, "@Alex")
    .replace(/\{username\}/g, "alex_dev")
    .replace(/\{level\}/g, "15")
    .replace(/\{server\}/g, state.value.guild?.name || "MODUS Community");
});

const simulatedLevelStats = computed(() => {
  const lvl = Math.max(1, calcLevel.value);
  const totalXp = getCumulativeXpForLevel(lvl);
  const xpForNext = 5 * lvl * lvl + 50 * lvl + 100;
  const avgXpPerMsg = Math.max(1, (settings.value.minXpPerMessage + settings.value.maxXpPerMessage) / 2);
  const estimatedMessages = Math.ceil(totalXp / avgXpPerMsg);

  return {
    totalXp,
    xpForNext,
    estimatedMessages,
  };
});

const resetToDefaults = () => {
  settings.value.cooldownSeconds = 60;
  settings.value.minXpPerMessage = 15;
  settings.value.maxXpPerMessage = 25;
  settings.value.minMessageLength = 5;
  settings.value.levelUpMessage = "🎉 Congratulations {user}, you leveled up to **Level {level}**!";
  settings.value.leaderboardVisibility = "private";
};

const save = async (customTemplate?: RankCardTemplate) => {
  saving.value = true;
  if (customTemplate) {
    settings.value.cardTemplate = customTemplate;
  }

  await saveModuleSettings("xp", {
    cooldownSeconds: settings.value.cooldownSeconds,
    minXpPerMessage: settings.value.minXpPerMessage,
    maxXpPerMessage: settings.value.maxXpPerMessage,
    minMessageLength: settings.value.minMessageLength,
    announcementChannel: settings.value.announcementChannel || null,
    levelUpMessage: settings.value.levelUpMessage,
    leaderboardVisibility: settings.value.leaderboardVisibility,
    cardTemplate: settings.value.cardTemplate,
  });

  saving.value = false;
};

onMounted(() => {
  const saved = getModuleConfig("xp");
  if (saved && Object.keys(saved).length > 0) {
    settings.value = {
      cooldownSeconds: saved.cooldownSeconds ?? 60,
      minXpPerMessage: saved.minXpPerMessage ?? 15,
      maxXpPerMessage: saved.maxXpPerMessage ?? 25,
      minMessageLength: saved.minMessageLength ?? 5,
      announcementChannel: saved.announcementChannel ?? "",
      levelUpMessage: saved.levelUpMessage ?? "🎉 Congratulations {user}, you leveled up to **Level {level}**!",
      leaderboardVisibility: saved.leaderboardVisibility ?? "private",
      cardTemplate: saved.cardTemplate ?? JSON.parse(JSON.stringify(DEFAULT_RANK_CARD_TEMPLATE)),
    };
  }
  loadChannels();
});

onUnmounted(() => {
  resetPageChrome();
});
</script>
