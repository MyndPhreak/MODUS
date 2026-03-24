<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/dashboard/server/${guildId}/modules`"
        class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <UIcon name="i-heroicons-arrow-left" class="text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div class="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20">
          <UIcon name="i-heroicons-bell-alert" class="text-pink-400 text-lg" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Social Alerts</h2>
          <p class="text-xs text-gray-500">
            Automated notifications for social media and external feeds
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('alerts') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("alerts") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Add Alert Card -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20"
          >
            <UIcon name="i-heroicons-plus" class="text-pink-400" />
          </div>
          <h3 class="font-semibold text-white">Add Alert Source</h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <UFormField label="Platform">
            <USelect
              v-model="newAlert.platform"
              :items="platformOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Handle / URL">
            <UInput
              v-model="newAlert.handle"
              placeholder="e.g. @username or URL"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Channel">
            <USelectMenu
              v-if="channelOptions.length > 0"
              v-model="newAlert.channelId"
              :items="channelOptions"
              value-key="value"
              placeholder="Select channel"
              class="w-full"
            />
            <div v-else class="text-xs text-gray-500 italic py-2">
              No channels available
            </div>
          </UFormField>
          <UFormField label="Custom Message">
            <UInput
              v-model="newAlert.message"
              placeholder="Optional ping message"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="flex justify-end">
          <UButton
            color="primary"
            size="sm"
            icon="i-heroicons-plus"
            :disabled="!newAlert.handle || !newAlert.channelId"
            @click="addAlert"
          >
            Add Alert
          </UButton>
        </div>
      </div>
    </div>

    <!-- Active Alerts List -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
          >
            <UIcon name="i-heroicons-list-bullet" class="text-violet-400" />
          </div>
          <h3 class="font-semibold text-white">Active Alerts</h3>
          <UBadge color="neutral" variant="soft" size="xs" class="ml-auto">
            {{ settings.alerts.length }}
          </UBadge>
        </div>

        <!-- Empty State -->
        <div
          v-if="settings.alerts.length === 0"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
          <div
            class="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3"
          >
            <UIcon
              name="i-heroicons-bell-alert"
              class="w-8 h-8 text-gray-600"
            />
          </div>
          <p class="text-gray-400 font-medium">No alerts configured</p>
          <p class="text-xs text-gray-600 mt-1">
            Add a social media source above to get started
          </p>
        </div>

        <!-- Alert Rows -->
        <div v-else class="space-y-2">
          <div
            v-for="(alert, index) in settings.alerts"
            :key="`${alert.platform}-${alert.handle}`"
            class="flex items-center gap-4 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group"
          >
            <!-- Platform Icon -->
            <div
              class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              :class="platformBadgeClass(alert.platform)"
            >
              <span class="text-base">{{ platformEmoji(alert.platform) }}</span>
            </div>

            <!-- Info -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium text-white truncate">
                  {{ alert.handle }}
                </p>
                <UBadge color="neutral" variant="soft" size="xs">
                  {{ platformLabel(alert.platform) }}
                </UBadge>
              </div>
              <p class="text-[10px] text-gray-500 mt-0.5">
                → {{ getChannelName(alert.channelId) }}
                <span v-if="alert.message"> · {{ alert.message }} </span>
              </p>
            </div>

            <!-- Remove -->
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-heroicons-trash"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              @click="removeAlert(index)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- How It Works -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
          >
            <UIcon
              name="i-heroicons-information-circle"
              class="text-indigo-400"
            />
          </div>
          <h3 class="font-semibold text-white">Supported Platforms</h3>
        </div>

        <div class="space-y-3 text-xs text-gray-400 leading-relaxed">
          <ul class="space-y-1.5 list-none">
            <li class="flex items-start gap-2">
              <span class="text-base leading-none mt-0.5">▶️</span>
              <span
                ><strong class="text-gray-300">YouTube</strong> — New video
                uploads. Enter the Channel ID (starts with
                <code class="text-pink-400">UC</code>) from the channel URL.
                Find it at youtube.com/channel/<code class="text-pink-400">UC...</code
                ></span
              >
            </li>
            <li class="flex items-start gap-2">
              <span class="text-base leading-none mt-0.5">📺</span>
              <span
                ><strong class="text-gray-300">Twitch</strong> — Stream
                online/offline events via EventSub push (real-time). Enter the
                streamer's login name (e.g.
                <code class="text-pink-400">shroud</code>).</span
              >
            </li>
            <li class="flex items-start gap-2">
              <span class="text-base leading-none mt-0.5">📡</span>
              <span
                ><strong class="text-gray-300">RSS Feed</strong> — Any RSS 2.0
                or Atom feed URL. Enter the full feed URL.</span
              >
            </li>
            <li class="flex items-start gap-2">
              <span class="text-base leading-none mt-0.5">🐙</span>
              <span
                ><strong class="text-gray-300">GitHub</strong> — Repository
                releases. Enter as
                <code class="text-pink-400">owner/repo</code> (e.g.
                <code class="text-pink-400">discord/discord-api-docs</code>).</span
              >
            </li>
          </ul>
          <p class="text-gray-500 flex items-center gap-1.5">
            <UIcon name="i-heroicons-clock" class="text-gray-600" />
            YouTube, RSS, and GitHub alerts are checked every 10 minutes.
            Twitch alerts are delivered in real-time via webhook.
          </p>
        </div>

      </div>
    </div>

    <!-- Save Button -->
    <div class="flex justify-end">
      <UButton
        color="primary"
        size="lg"
        icon="i-heroicons-check"
        :loading="saving"
        @click="save"
        class="min-w-[200px]"
      >
        Save Alert Settings
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

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

const saving = ref(false);

// ── Types ──

interface SocialAlert {
  platform: string;
  handle: string;
  channelId: string;
  message?: string;
}

interface AlertsSettingsForm {
  alerts: SocialAlert[];
}

const settings = ref<AlertsSettingsForm>({
  alerts: [],
});

// ── Form ──

const platformOptions = [
  { label: "▶️ YouTube", value: "youtube" },
  { label: "📺 Twitch", value: "twitch" },
  { label: "📡 RSS Feed", value: "rss" },
  { label: "🐙 GitHub", value: "github" },
];

const newAlert = reactive({
  platform: "youtube",
  handle: "",
  channelId: "",
  message: "",
});

const addAlert = () => {
  settings.value.alerts.push({
    platform: newAlert.platform,
    handle: newAlert.handle,
    channelId: newAlert.channelId,
    message: newAlert.message || undefined,
  });
  newAlert.handle = "";
  newAlert.channelId = "";
  newAlert.message = "";
};

const removeAlert = (index: number) => {
  settings.value.alerts.splice(index, 1);
};

// ── Helpers ──

function getChannelName(channelId: string): string {
  const ch = state.value.channels.find((c: any) => c.id === channelId);
  return ch ? `#${ch.name}` : `#${channelId}`;
}

function platformEmoji(p: string): string {
  const map: Record<string, string> = {
    youtube: "▶️",
    twitch: "📺",
    rss: "📡",
    github: "🐙",
  };
  return map[p] || "🔔";
}

function platformLabel(p: string): string {
  const map: Record<string, string> = {
    youtube: "YouTube",
    twitch: "Twitch",
    rss: "RSS",
    github: "GitHub",
  };
  return map[p] || p;
}

function platformBadgeClass(p: string): string {
  const map: Record<string, string> = {
    youtube: "bg-red-500/10 border border-red-500/20",
    twitch: "bg-purple-500/10 border border-purple-500/20",
    rss: "bg-orange-500/10 border border-orange-500/20",
    github: "bg-green-500/10 border border-green-500/20",
  };
  return map[p] || "bg-gray-500/10 border border-gray-500/20";
}

// ── Save ──

const save = async () => {
  saving.value = true;
  await saveModuleSettings("alerts", {
    alerts: settings.value.alerts,
  });
  saving.value = false;
};

// ── Init ──

onMounted(async () => {
  const saved = getModuleConfig("alerts");
  if (saved && Object.keys(saved).length > 0) {
    settings.value = {
      alerts: Array.isArray(saved.alerts) ? saved.alerts : [],
    };
  }
  await loadChannels();
});
</script>
