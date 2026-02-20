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
        <div class="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <UIcon
            name="i-heroicons-clipboard-document-list"
            class="text-cyan-400 text-lg"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Audit Logging</h2>
          <p class="text-xs text-gray-500">
            Track server events and send them to a dedicated channel
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('logging') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("logging") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Settings Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Audit Channel Selector -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-4">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20"
            >
              <UIcon name="i-heroicons-hashtag" class="text-cyan-400" />
            </div>
            <div>
              <h3 class="font-semibold text-white">Audit Channel</h3>
              <p class="text-[10px] text-gray-500">
                All enabled audit events will be posted to this channel
              </p>
            </div>
          </div>

          <!-- Channel loading -->
          <div
            v-if="state.channelsLoading"
            class="flex items-center gap-2 py-2 text-gray-400"
          >
            <UIcon
              name="i-heroicons-arrow-path"
              class="animate-spin text-cyan-400"
            />
            <span class="text-sm">Loading channels...</span>
          </div>
          <template v-else>
            <USelectMenu
              v-if="channelOptions.length > 0"
              v-model="settings.auditChannelId"
              :items="channelOptions"
              value-key="value"
              placeholder="Select a channel for audit logs..."
              searchable
              icon="i-heroicons-hashtag"
              size="md"
            />
            <div v-else class="text-xs text-gray-500 italic py-2">
              No channels available. Make sure the bot is in this server.
            </div>
          </template>

          <div
            v-if="settings.auditChannelId"
            class="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/5 border border-cyan-500/10"
          >
            <UIcon
              name="i-heroicons-check-circle"
              class="text-cyan-400 text-sm"
            />
            <span class="text-xs text-cyan-300">
              Audit events will post to
              <strong>{{ getChannelName(settings.auditChannelId) }}</strong>
            </span>
          </div>
        </div>
      </div>

      <!-- Info Card -->
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
              The Audit Logging module watches for server events in real-time
              and posts rich embeds to your designated channel.
            </p>
            <ul class="space-y-1.5 list-none">
              <li class="flex items-start gap-2">
                <UIcon
                  name="i-heroicons-chat-bubble-bottom-center-text"
                  class="text-yellow-400 mt-0.5 shrink-0"
                />
                <span
                  ><strong class="text-gray-300">Messages</strong> — Deleted
                  messages (with content + attachments) and edits
                  (before/after)</span
                >
              </li>
              <li class="flex items-start gap-2">
                <UIcon
                  name="i-heroicons-user-group"
                  class="text-green-400 mt-0.5 shrink-0"
                />
                <span
                  ><strong class="text-gray-300">Members</strong> — Joins and
                  leaves with account age and join date</span
                >
              </li>
              <li class="flex items-start gap-2">
                <UIcon
                  name="i-heroicons-shield-check"
                  class="text-purple-400 mt-0.5 shrink-0"
                />
                <span
                  ><strong class="text-gray-300">Roles</strong> — Creation,
                  updates (name/color changes), and deletion</span
                >
              </li>
              <li class="flex items-start gap-2">
                <UIcon
                  name="i-heroicons-folder"
                  class="text-teal-400 mt-0.5 shrink-0"
                />
                <span
                  ><strong class="text-gray-300">Channels</strong> — Channel
                  creation and deletion</span
                >
              </li>
              <li class="flex items-start gap-2">
                <UIcon
                  name="i-heroicons-link"
                  class="text-blue-400 mt-0.5 shrink-0"
                />
                <span
                  ><strong class="text-gray-300">Invites</strong> — Invite link
                  creation and deletion with creator info</span
                >
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Event Toggles -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-cyan-500/3 to-transparent pointer-events-none"
      />
      <div class="relative space-y-5">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20"
          >
            <UIcon
              name="i-heroicons-adjustments-horizontal"
              class="text-cyan-400"
            />
          </div>
          <div>
            <h3 class="font-semibold text-white">Event Categories</h3>
            <p class="text-[10px] text-gray-500">
              Toggle which events are posted to the audit channel
            </p>
          </div>
        </div>

        <div class="space-y-1">
          <div
            v-for="toggle in eventToggles"
            :key="toggle.key"
            class="flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-150"
            :class="
              (settings[toggle.key] as boolean)
                ? 'bg-white/[0.04] border border-white/[0.08]'
                : 'bg-transparent border border-transparent hover:bg-white/[0.02]'
            "
          >
            <div class="flex items-center gap-3">
              <div class="p-1.5 rounded-lg shrink-0" :class="toggle.iconBg">
                <UIcon
                  :name="toggle.icon"
                  class="text-sm"
                  :class="toggle.iconColor"
                />
              </div>
              <div>
                <div class="text-sm font-medium text-white">
                  {{ toggle.label }}
                </div>
                <div class="text-[11px] text-gray-500">
                  {{ toggle.description }}
                </div>
              </div>
            </div>
            <USwitch
              :model-value="settings[toggle.key]"
              @update:model-value="
                (val: boolean) => (settings[toggle.key] = val)
              "
            />
          </div>
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
        Save Logging Settings
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

type BooleanToggleKey =
  | "logMessages"
  | "logMembers"
  | "logRoles"
  | "logChannels"
  | "logInvites";

interface LoggingSettingsForm {
  auditChannelId: string;
  logMessages: boolean;
  logMembers: boolean;
  logRoles: boolean;
  logChannels: boolean;
  logInvites: boolean;
}

const settings = ref<LoggingSettingsForm>({
  auditChannelId: "",
  logMessages: false,
  logMembers: false,
  logRoles: false,
  logChannels: false,
  logInvites: false,
});

// ── Toggle definitions ──

const eventToggles = [
  {
    key: "logMessages" as BooleanToggleKey,
    label: "Message Events",
    description: "Log deleted messages (with content) and message edits",
    icon: "i-heroicons-chat-bubble-bottom-center-text",
    iconBg: "bg-yellow-500/10 border border-yellow-500/20",
    iconColor: "text-yellow-400",
  },
  {
    key: "logMembers" as BooleanToggleKey,
    label: "Member Events",
    description: "Log member joins and leaves with account details",
    icon: "i-heroicons-user-group",
    iconBg: "bg-green-500/10 border border-green-500/20",
    iconColor: "text-green-400",
  },
  {
    key: "logRoles" as BooleanToggleKey,
    label: "Role Events",
    description: "Log role creation, updates, and deletion",
    icon: "i-heroicons-shield-check",
    iconBg: "bg-purple-500/10 border border-purple-500/20",
    iconColor: "text-purple-400",
  },
  {
    key: "logChannels" as BooleanToggleKey,
    label: "Channel Events",
    description: "Log channel creation and deletion",
    icon: "i-heroicons-folder",
    iconBg: "bg-teal-500/10 border border-teal-500/20",
    iconColor: "text-teal-400",
  },
  {
    key: "logInvites" as BooleanToggleKey,
    label: "Invite Events",
    description: "Log invite link creation and deletion",
    icon: "i-heroicons-link",
    iconBg: "bg-blue-500/10 border border-blue-500/20",
    iconColor: "text-blue-400",
  },
];

// ── Helpers ──

function getChannelName(channelId: string): string {
  const ch = state.value.channels.find((c: any) => c.id === channelId);
  return ch ? `#${ch.name}` : channelId;
}

// ── Save ──

const save = async () => {
  saving.value = true;
  await saveModuleSettings("logging", {
    auditChannelId: settings.value.auditChannelId,
    logMessages: settings.value.logMessages,
    logMembers: settings.value.logMembers,
    logRoles: settings.value.logRoles,
    logChannels: settings.value.logChannels,
    logInvites: settings.value.logInvites,
  });
  saving.value = false;
};

// ── Init ──

onMounted(async () => {
  // Load saved settings
  const saved = getModuleConfig("logging");
  if (saved && Object.keys(saved).length > 0) {
    settings.value = {
      auditChannelId: saved.auditChannelId ?? "",
      logMessages: saved.logMessages ?? false,
      logMembers: saved.logMembers ?? false,
      logRoles: saved.logRoles ?? false,
      logChannels: saved.logChannels ?? false,
      logInvites: saved.logInvites ?? false,
    };
  }

  // Load channels for the channel selector
  await loadChannels();
});
</script>
