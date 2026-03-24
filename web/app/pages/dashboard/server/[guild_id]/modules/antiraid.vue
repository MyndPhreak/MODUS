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
        <div class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <UIcon
            name="i-heroicons-shield-check"
            class="text-rose-400 text-lg"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Anti-Raid Protection</h2>
          <p class="text-xs text-gray-500">
            Detect and mitigate rapid join floods automatically
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('antiraid') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("antiraid") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Settings Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Threshold & Window -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20"
            >
              <UIcon
                name="i-heroicons-adjustments-horizontal"
                class="text-rose-400"
              />
            </div>
            <div>
              <h3 class="font-semibold text-white">Detection Thresholds</h3>
              <p class="text-[10px] text-gray-500">
                Configure when Anti-Raid should trigger
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <UFormField
              label="Join Threshold"
              hint="Number of joins required to trigger Anti-Raid (minimum 2)."
            >
              <UInput
                v-model.number="settings.joinThreshold"
                type="number"
                :min="2"
                placeholder="5"
                icon="i-heroicons-user-plus"
              />
            </UFormField>

            <UFormField
              label="Time Window (seconds)"
              hint="Time window to count joins in seconds (1–300)."
            >
              <UInput
                v-model.number="settings.timeWindow"
                type="number"
                :min="1"
                :max="300"
                placeholder="10"
                icon="i-heroicons-clock"
              />
            </UFormField>
          </div>

          <!-- Preview -->
          <div
            v-if="settings.joinThreshold && settings.timeWindow"
            class="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-500/10"
          >
            <UIcon
              name="i-heroicons-information-circle"
              class="text-rose-400 text-sm shrink-0"
            />
            <span class="text-xs text-rose-300">
              Triggers when
              <strong>{{ settings.joinThreshold }} users</strong> join within
              <strong>{{ settings.timeWindow }} seconds</strong>
            </span>
          </div>
        </div>
      </div>

      <!-- Action & Alert Channel -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
            >
              <UIcon
                name="i-heroicons-exclamation-triangle"
                class="text-amber-400"
              />
            </div>
            <div>
              <h3 class="font-semibold text-white">Response Action</h3>
              <p class="text-[10px] text-gray-500">
                What happens when a raid is detected
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <UFormField
              label="Action"
              hint="What automated action to take when a raid is detected."
            >
              <USelect
                v-model="settings.action"
                :items="actionOptions"
              />
            </UFormField>

            <UFormField
              label="Alert Channel"
              hint="Channel where raid detection alerts are posted (optional)."
            >
              <div
                v-if="state.channelsLoading"
                class="flex items-center gap-2 py-2 text-gray-400"
              >
                <UIcon
                  name="i-heroicons-arrow-path"
                  class="animate-spin text-rose-400"
                />
                <span class="text-sm">Loading channels...</span>
              </div>
              <template v-else>
                <USelectMenu
                  v-if="channelOptions.length > 0"
                  v-model="settings.alertChannelId"
                  :items="channelOptions"
                  value-key="value"
                  placeholder="Select an alert channel (optional)"
                  searchable
                  icon="i-heroicons-hashtag"
                />
                <div v-else class="text-xs text-gray-500 italic py-2">
                  No channels available
                </div>
              </template>
            </UFormField>
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
            Anti-Raid monitors join velocity in real-time and automatically
            responds when a flood is detected.
          </p>
          <ul class="space-y-1.5 list-none">
            <li class="flex items-start gap-2">
              <UIcon
                name="i-heroicons-lock-closed"
                class="text-rose-400 mt-0.5 shrink-0"
              />
              <span
                ><strong class="text-gray-300">Lockdown</strong> — Revokes
                Send Messages for @everyone across all text channels. Use
                <code class="text-rose-400">/antiraid unlock</code> to
                restore.</span
              >
            </li>
            <li class="flex items-start gap-2">
              <UIcon
                name="i-heroicons-arrow-right-on-rectangle"
                class="text-amber-400 mt-0.5 shrink-0"
              />
              <span
                ><strong class="text-gray-300">Kick</strong> — Kicks recent
                joins that have no assigned roles (only @everyone).</span
              >
            </li>
            <li class="flex items-start gap-2">
              <UIcon
                name="i-heroicons-no-symbol"
                class="text-red-400 mt-0.5 shrink-0"
              />
              <span
                ><strong class="text-gray-300">Ban</strong> — Bans recent
                joins that have no assigned roles. Most aggressive
                option.</span
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
        Save Anti-Raid Settings
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

// ── Settings ──

interface AntiRaidSettingsForm {
  joinThreshold: number;
  timeWindow: number;
  action: string;
  alertChannelId: string;
}

const settings = ref<AntiRaidSettingsForm>({
  joinThreshold: 5,
  timeWindow: 10,
  action: "lockdown",
  alertChannelId: "",
});

const actionOptions = [
  { label: "🔒 Lockdown Server", value: "lockdown" },
  { label: "👢 Kick Raiders", value: "kick" },
  { label: "🔨 Ban Raiders", value: "ban" },
];

// ── Save ──

const save = async () => {
  saving.value = true;
  await saveModuleSettings("antiraid", {
    joinThreshold: settings.value.joinThreshold,
    timeWindow: settings.value.timeWindow,
    action: settings.value.action,
    alertChannelId: settings.value.alertChannelId || undefined,
  });
  saving.value = false;
};

// ── Init ──

onMounted(async () => {
  const saved = getModuleConfig("antiraid");
  if (saved && Object.keys(saved).length > 0) {
    settings.value = {
      joinThreshold: saved.joinThreshold ?? 5,
      timeWindow: saved.timeWindow ?? 10,
      action: saved.action ?? "lockdown",
      alertChannelId: saved.alertChannelId ?? "",
    };
  }
  await loadChannels();
});
</script>
