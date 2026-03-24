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
        <div
          class="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20"
        >
          <UIcon
            name="i-heroicons-speaker-wave"
            class="text-indigo-400 text-lg"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Temporary Voice Channels</h2>
          <p class="text-xs text-gray-500">
            Join-to-Create lobbies for personal voice channels
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('tempvoice') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("tempvoice") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Settings Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Naming & Limits -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
            >
              <UIcon
                name="i-heroicons-adjustments-horizontal"
                class="text-indigo-400"
              />
            </div>
            <div>
              <h3 class="font-semibold text-white">Channel Defaults</h3>
              <p class="text-[10px] text-gray-500">
                Configure how temp channels are named and limited
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <UFormField
              label="Naming Template"
              description="Use {username}, {displayname}, or {tag} as placeholders."
            >
              <UInput
                v-model="settings.namingTemplate"
                placeholder="{username}'s Channel"
                icon="i-heroicons-pencil"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Default User Limit"
              description="0 = unlimited. Users can override with /tempvoice limit."
            >
              <UInput
                v-model.number="settings.defaultUserLimit"
                type="number"
                :min="0"
                :max="99"
                placeholder="0"
                icon="i-heroicons-users"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Category Override"
              description="Leave blank to create channels in the same category as the lobby."
            >
              <UInput
                v-model="settings.categoryId"
                placeholder="Category ID (optional)"
                icon="i-heroicons-folder"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </div>

      <!-- Lobby Channels -->
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
              <UIcon name="i-heroicons-speaker-wave" class="text-violet-400" />
            </div>
            <div>
              <h3 class="font-semibold text-white">Lobby Channels</h3>
              <p class="text-[10px] text-gray-500">
                Voice channels that act as Join-to-Create triggers
              </p>
            </div>
          </div>

          <!-- Current Lobbies -->
          <div
            v-if="settings.lobbyChannelIds.length === 0"
            class="flex flex-col items-center justify-center py-8 text-center"
          >
            <div
              class="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-2"
            >
              <UIcon
                name="i-heroicons-speaker-wave"
                class="w-6 h-6 text-gray-600"
              />
            </div>
            <p class="text-xs text-gray-500">No lobby channels configured</p>
            <p class="text-[10px] text-gray-600 mt-0.5">
              Use <code class="text-indigo-400">/tempvoice lobby</code> in
              Discord or add IDs below
            </p>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="(channelId, index) in settings.lobbyChannelIds"
              :key="channelId"
              class="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 group"
            >
              <UIcon
                name="i-heroicons-speaker-wave"
                class="text-violet-400 text-sm shrink-0"
              />
              <span class="text-sm text-gray-300 flex-1 font-mono truncate">{{
                channelId
              }}</span>
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                icon="i-heroicons-x-mark"
                class="opacity-0 group-hover:opacity-100 transition-opacity"
                @click="removeLobby(index)"
              />
            </div>
          </div>

          <!-- Add Lobby -->
          <div class="flex gap-2">
            <UInput
              v-model="newLobbyId"
              placeholder="Voice channel ID"
              size="sm"
              class="flex-1"
              icon="i-heroicons-hashtag"
            />
            <UButton
              color="primary"
              size="sm"
              icon="i-heroicons-plus"
              :disabled="!newLobbyId"
              @click="addLobby"
            >
              Add
            </UButton>
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
          <h3 class="font-semibold text-white">How It Works</h3>
        </div>

        <div class="space-y-3 text-xs text-gray-400 leading-relaxed">
          <p>
            Members join a designated lobby voice channel, and the bot instantly
            creates a personal voice channel for them.
          </p>
          <ul class="space-y-1.5 list-none">
            <li class="flex items-start gap-2">
              <UIcon
                name="i-heroicons-plus-circle"
                class="text-indigo-400 mt-0.5 shrink-0"
              />
              <span
                ><strong class="text-gray-300">Auto-Create</strong> — Joining a
                lobby automatically creates and moves the user to their own
                VC.</span
              >
            </li>
            <li class="flex items-start gap-2">
              <UIcon
                name="i-heroicons-trash"
                class="text-rose-400 mt-0.5 shrink-0"
              />
              <span
                ><strong class="text-gray-300">Auto-Delete</strong> — When
                everyone leaves, the channel is removed automatically.</span
              >
            </li>
            <li class="flex items-start gap-2">
              <UIcon
                name="i-heroicons-wrench-screwdriver"
                class="text-amber-400 mt-0.5 shrink-0"
              />
              <span
                ><strong class="text-gray-300">Owner Controls</strong> — Rename,
                lock, unlock, set limits, and claim channels.</span
              >
            </li>
          </ul>
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
        Save TempVoice Settings
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
const newLobbyId = ref("");

// ── Settings ──

interface TempVoiceSettingsForm {
  lobbyChannelIds: string[];
  defaultUserLimit: number;
  namingTemplate: string;
  categoryId: string;
}

const settings = ref<TempVoiceSettingsForm>({
  lobbyChannelIds: [],
  defaultUserLimit: 0,
  namingTemplate: "{username}'s Channel",
  categoryId: "",
});

// ── Lobby management ──

const addLobby = () => {
  const id = newLobbyId.value.trim();
  if (id && !settings.value.lobbyChannelIds.includes(id)) {
    settings.value.lobbyChannelIds.push(id);
    newLobbyId.value = "";
  }
};

const removeLobby = (index: number) => {
  settings.value.lobbyChannelIds.splice(index, 1);
};

// ── Save ──

const save = async () => {
  saving.value = true;
  await saveModuleSettings("tempvoice", {
    lobbyChannelIds: settings.value.lobbyChannelIds,
    defaultUserLimit: settings.value.defaultUserLimit,
    namingTemplate: settings.value.namingTemplate,
    categoryId: settings.value.categoryId || undefined,
  });
  saving.value = false;
};

// ── Init ──

onMounted(async () => {
  const saved = getModuleConfig("tempvoice");
  if (saved && Object.keys(saved).length > 0) {
    settings.value = {
      lobbyChannelIds: Array.isArray(saved.lobbyChannelIds)
        ? saved.lobbyChannelIds
        : [],
      defaultUserLimit: saved.defaultUserLimit ?? 0,
      namingTemplate: saved.namingTemplate ?? "{username}'s Channel",
      categoryId: saved.categoryId ?? "",
    };
  }
});
</script>
