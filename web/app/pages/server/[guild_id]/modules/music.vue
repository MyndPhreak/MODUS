<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/server/${guildId}/modules`"
        class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <UIcon name="i-heroicons-arrow-left" class="text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div
          class="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20"
        >
          <UIcon
            name="i-heroicons-musical-note"
            class="text-violet-400 text-lg"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Music Settings</h2>
          <p class="text-xs text-gray-500">
            Configure the music module for this server
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('Music') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("Music") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Settings Cards -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Playback Section -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5 space-y-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
            >
              <UIcon name="i-heroicons-play" class="text-violet-400" />
            </div>
            <h3 class="font-semibold text-white">Playback</h3>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">
              Default Volume: {{ musicSettings.defaultVolume }}%
            </label>
            <USlider
              v-model="musicSettings.defaultVolume"
              :min="1"
              :max="100"
              :step="1"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Max Queue Size</label>
            <UInput
              v-model.number="musicSettings.maxQueueSize"
              type="number"
              :min="1"
              :max="1000"
              size="sm"
            />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <label class="text-sm font-medium">Update Channel Topic</label>
              <p class="text-[10px] text-gray-500">
                Show current song in voice channel topic
              </p>
            </div>
            <USwitch v-model="musicSettings.updateChannelTopic" />
          </div>
        </div>
      </div>

      <!-- Permissions Section -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5 space-y-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
            >
              <UIcon name="i-heroicons-key" class="text-indigo-400" />
            </div>
            <h3 class="font-semibold text-white">Permissions</h3>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">DJ Role ID</label>
            <UInput
              v-model="musicSettings.djRoleId"
              placeholder="Leave empty for no restriction"
              size="sm"
            />
            <p class="text-[10px] text-gray-500 mt-1">
              Only users with this role can control music. Leave empty to allow
              everyone.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Audio Effects Section (full width) -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none"
      />
      <div class="relative">
        <div class="flex items-center gap-2 mb-4">
          <div
            class="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
          >
            <UIcon name="i-heroicons-sparkles" class="text-violet-400" />
          </div>
          <div>
            <h4 class="text-sm font-semibold text-white">Audio Effects</h4>
            <p class="text-[10px] text-gray-500">
              Auto-applied when music starts playing
            </p>
          </div>
          <UBadge
            v-if="musicSettings.activeFilters.length > 0"
            color="primary"
            variant="soft"
            size="xs"
            class="ml-auto"
          >
            {{ musicSettings.activeFilters.length }} active
          </UBadge>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          <button
            v-for="(info, key) in availableFilters"
            :key="key"
            type="button"
            class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 text-left"
            :class="
              musicSettings.activeFilters.includes(key as string)
                ? 'bg-violet-500/20 border border-violet-500/40 text-violet-300 ring-1 ring-violet-500/30'
                : 'bg-gray-800/50 border border-white/5 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
            "
            @click="toggleFilter(key as string)"
          >
            <span class="text-base leading-none">{{ info.emoji }}</span>
            <div class="min-w-0">
              <div class="truncate">{{ info.label }}</div>
              <div class="text-[9px] opacity-60 truncate">
                {{ info.description }}
              </div>
            </div>
            <UIcon
              v-if="musicSettings.activeFilters.includes(key as string)"
              name="i-heroicons-check-circle-solid"
              class="ml-auto text-violet-400 shrink-0"
            />
          </button>
        </div>

        <button
          v-if="musicSettings.activeFilters.length > 0"
          type="button"
          class="w-full mt-3 text-[10px] text-gray-500 hover:text-red-400 transition-colors py-1"
          @click="musicSettings.activeFilters = []"
        >
          Clear all effects
        </button>
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
        Save Music Settings
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { state, isModuleEnabled, saveModuleSettings, getModuleConfig } =
  useServerSettings(guildId);

const saving = ref(false);

const musicSettings = ref({
  defaultVolume: 50,
  djRoleId: "",
  updateChannelTopic: false,
  maxQueueSize: 200,
  activeFilters: [] as string[],
});

// Available audio filters
const availableFilters: Record<
  string,
  { label: string; emoji: string; description: string }
> = {
  bassboost: {
    label: "Bass Boost",
    emoji: "🔊",
    description: "Enhances low frequencies",
  },
  bassboost_high: {
    label: "Bass Boost (Heavy)",
    emoji: "💥",
    description: "Extreme bass enhancement",
  },
  nightcore: {
    label: "Nightcore",
    emoji: "🌙",
    description: "Higher pitch + faster tempo",
  },
  vaporwave: {
    label: "Vaporwave",
    emoji: "🌊",
    description: "Slowed down + lower pitch",
  },
  "8D": {
    label: "8D Audio",
    emoji: "🎧",
    description: "Rotating spatial audio",
  },
  karaoke: {
    label: "Karaoke",
    emoji: "🎤",
    description: "Reduces vocal frequencies",
  },
  tremolo: {
    label: "Tremolo",
    emoji: "〰️",
    description: "Wavering volume effect",
  },
  vibrato: {
    label: "Vibrato",
    emoji: "🎻",
    description: "Wavering pitch effect",
  },
  lofi: {
    label: "Lo-Fi",
    emoji: "📻",
    description: "Warm, low-fidelity sound",
  },
  phaser: {
    label: "Phaser",
    emoji: "🔮",
    description: "Sweeping phase effect",
  },
  chorus: {
    label: "Chorus",
    emoji: "👥",
    description: "Rich, layered vocal effect",
  },
  flanger: {
    label: "Flanger",
    emoji: "✨",
    description: "Jet-like sweeping effect",
  },
  treble: {
    label: "Treble Boost",
    emoji: "🔔",
    description: "Enhances high frequencies",
  },
  normalizer: {
    label: "Normalizer",
    emoji: "📊",
    description: "Levels out volume",
  },
  fadein: {
    label: "Fade In",
    emoji: "🌅",
    description: "Gradually increases volume",
  },
  surrounding: {
    label: "Surround",
    emoji: "🔈",
    description: "Spatial surround sound",
  },
};

const toggleFilter = (key: string) => {
  const idx = musicSettings.value.activeFilters.indexOf(key);
  if (idx >= 0) {
    musicSettings.value.activeFilters.splice(idx, 1);
  } else {
    musicSettings.value.activeFilters.push(key);
  }
};

const save = async () => {
  saving.value = true;
  await saveModuleSettings("music", musicSettings.value);
  saving.value = false;
};

// Load existing settings
onMounted(() => {
  const saved = getModuleConfig("music");
  if (saved && Object.keys(saved).length > 0) {
    musicSettings.value = {
      defaultVolume: saved.defaultVolume ?? 50,
      djRoleId: saved.djRoleId ?? "",
      updateChannelTopic: saved.updateChannelTopic ?? false,
      maxQueueSize: saved.maxQueueSize ?? 200,
      activeFilters: saved.activeFilters ?? [],
    };
  }
});
</script>
