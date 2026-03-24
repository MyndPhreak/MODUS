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
        <div class="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <UIcon
            name="i-heroicons-shield-exclamation"
            class="text-blue-400 text-lg"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Moderation Settings</h2>
          <p class="text-xs text-gray-500">
            Configure the moderation module for this server
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('Moderation') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{
          isModuleEnabled("Moderation") ? "Module Active" : "Module Disabled"
        }}
      </UBadge>
    </div>

    <!-- Settings Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- General Configuration -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20"
            >
              <UIcon name="i-heroicons-cog-6-tooth" class="text-blue-400" />
            </div>
            <div>
              <h3 class="font-semibold text-white">General Configuration</h3>
              <p class="text-[10px] text-gray-500">
                Logging, exemptions &amp; behavior preferences
              </p>
            </div>
          </div>

          <!-- Mod Log Channel -->
          <UFormField
            label="Mod Log Channel"
            description="All moderation actions are logged here."
          >
            <div
              v-if="channelsLoading"
              class="flex items-center gap-3 py-2 text-gray-400"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="animate-spin text-blue-400"
              />
              <span class="text-sm">Loading channels...</span>
            </div>
            <USelectMenu
              v-else-if="channels.length > 0"
              v-model="moderationSettings.modLogChannelId"
              :items="[
                { label: 'None (disabled)', value: 'none' },
                ...channelOptions,
              ]"
              value-key="value"
              placeholder="Select a mod log channel..."
              icon="i-heroicons-hashtag"
              size="sm"
            />
            <UButton
              v-else
              variant="soft"
              color="neutral"
              size="xs"
              icon="i-heroicons-arrow-path"
              @click="loadChannels()"
            >
              Load Channels
            </UButton>
          </UFormField>

          <!-- Exempt Roles -->
          <UFormField
            label="Exempt Roles"
            description="Roles that bypass auto-moderation entirely."
          >
            <div
              v-if="rolesLoading"
              class="flex items-center gap-3 py-2 text-gray-400"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="animate-spin text-blue-400"
              />
              <span class="text-sm">Loading roles...</span>
            </div>
            <USelectMenu
              v-else-if="roleOptions.length > 0"
              v-model="moderationSettings.exemptRoleIds"
              :items="roleOptions"
              value-key="value"
              multiple
              placeholder="No exempt roles"
              size="sm"
            />
            <UButton
              v-else
              variant="soft"
              color="neutral"
              size="xs"
              icon="i-heroicons-arrow-path"
              @click="loadRoles()"
            >
              Load Roles
            </UButton>
          </UFormField>

          <!-- Behavior toggles -->
          <UFormField
            label="DM on Action"
            description="Send a DM to users when they are moderated."
          >
            <USwitch
              v-model="moderationSettings.dmOnAction"
              label="Notify users via DM"
            />
          </UFormField>

          <UFormField
            label="Delete Command Message"
            description="Delete the invoking /command message after it executes."
          >
            <USwitch
              v-model="moderationSettings.deleteCommandMessage"
              label="Auto-delete invocation"
            />
          </UFormField>
        </div>
      </div>

      <!-- Warning System -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
            >
              <UIcon
                name="i-heroicons-exclamation-triangle"
                class="text-yellow-400"
              />
            </div>
            <div>
              <h3 class="font-semibold text-white">Warning System</h3>
              <p class="text-[10px] text-gray-500">
                Auto-action when threshold is reached
              </p>
            </div>
          </div>

          <UFormField
            label="Warning Threshold"
            :description="
              moderationSettings.warnThreshold === 0
                ? 'Set to 0 to disable auto-actions.'
                : `After ${moderationSettings.warnThreshold} warning(s), the auto-action triggers.`
            "
          >
            <div class="flex items-center gap-3">
              <USlider
                v-model="moderationSettings.warnThreshold"
                :min="0"
                :max="10"
                :step="1"
                class="flex-1"
              />
            </div>
          </UFormField>

          <UFormField
            v-if="moderationSettings.warnThreshold > 0"
            label="Auto-Action"
            description="The action taken when a user reaches the warning threshold."
          >
            <USelectMenu
              v-model="moderationSettings.warnAction"
              :items="warnActionOptions"
              value-key="value"
            />
          </UFormField>

          <UFormField
            v-if="
              moderationSettings.warnThreshold > 0 &&
              moderationSettings.warnAction === 'timeout'
            "
            label="Auto-Timeout Duration"
            :description="`Timeout length: ${formatMinutes(moderationSettings.autoTimeoutDuration)}`"
          >
            <div class="flex items-center gap-3">
              <USlider
                v-model="moderationSettings.autoTimeoutDuration"
                :min="1"
                :max="1440"
                :step="1"
                class="flex-1"
              />
            </div>
          </UFormField>
        </div>
      </div>
    </div>

    <!-- Command Permissions (full width) -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none"
      />
      <div class="relative">
        <div class="flex items-center gap-2 mb-4">
          <div
            class="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20"
          >
            <UIcon name="i-heroicons-key" class="text-orange-400" />
          </div>
          <div>
            <h3 class="font-semibold text-white">Command Permissions</h3>
            <p class="text-[10px] text-gray-500">
              Choose which roles can use each command group
            </p>
          </div>
        </div>

        <div
          v-if="rolesLoading"
          class="flex items-center gap-3 py-2 text-gray-400"
        >
          <UIcon
            name="i-heroicons-arrow-path"
            class="animate-spin text-orange-400"
          />
          <span class="text-sm">Loading server roles...</span>
        </div>
        <div
          v-else-if="roleOptions.length > 0"
          class="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div v-for="group in commandPermissionGroups" :key="group.key">
            <UFormField
              :label="`${group.emoji} ${group.label}`"
              :description="group.commands"
            >
              <USelectMenu
                v-model="commandPermissions[group.key]"
                :items="roleOptions"
                value-key="value"
                multiple
                placeholder="Anyone with Discord permissions..."
              />
            </UFormField>
          </div>
        </div>
        <UButton
          v-else
          variant="soft"
          color="neutral"
          size="xs"
          icon="i-heroicons-arrow-path"
          @click="loadRoles()"
        >
          Load Roles
        </UButton>
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
        Save Moderation Settings
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const {
  state,
  isModuleEnabled,
  saveModuleSettings,
  getModuleConfig,
  loadChannels,
  loadRoles,
  channelOptions,
  roleOptions,
} = useServerSettings(guildId);

const channels = computed(() => state.value.channels);
const channelsLoading = computed(() => state.value.channelsLoading);
const rolesLoading = computed(() => state.value.rolesLoading);

const saving = ref(false);
const exemptRoleIdsInput = ref("");

const moderationSettings = ref({
  modLogChannelId: "none",
  warnThreshold: 3,
  warnAction: "timeout" as "timeout" | "kick" | "ban" | "none",
  autoTimeoutDuration: 60,
  dmOnAction: true,
  exemptRoleIds: [] as string[],
  deleteCommandMessage: false,
});

const commandPermissions = ref<Record<string, string[]>>({
  ban: [],
  kick: [],
  timeout: [],
  warn: [],
  purge: [],
  channel: [],
});

const commandPermissionGroups = [
  { key: "ban", label: "Ban & Unban", emoji: "🔨", commands: "/ban, /unban" },
  { key: "kick", label: "Kick", emoji: "👢", commands: "/kick" },
  {
    key: "timeout",
    label: "Timeout",
    emoji: "⏱️",
    commands: "/timeout, /untimeout",
  },
  {
    key: "warn",
    label: "Warnings",
    emoji: "⚠️",
    commands: "/warn, /warnings, /clearwarnings",
  },
  { key: "purge", label: "Purge Messages", emoji: "🗑️", commands: "/purge" },
  {
    key: "channel",
    label: "Channel Management",
    emoji: "🔒",
    commands: "/slowmode, /lock, /unlock",
  },
];

const warnActionOptions = [
  { label: "Timeout", value: "timeout" },
  { label: "Kick", value: "kick" },
  { label: "Ban", value: "ban" },
  { label: "None (warn only)", value: "none" },
];

const formatMinutes = (minutes: number): string => {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    return `${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d${remHours > 0 ? ` ${remHours}h` : ""}`;
};

const save = async () => {
  saving.value = true;
  const exemptRoles =
    roleOptions.value.length > 0
      ? moderationSettings.value.exemptRoleIds
      : exemptRoleIdsInput.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  await saveModuleSettings("moderation", {
    ...moderationSettings.value,
    modLogChannelId:
      moderationSettings.value.modLogChannelId === "none"
        ? ""
        : moderationSettings.value.modLogChannelId,
    exemptRoleIds: exemptRoles,
    commandPermissions: commandPermissions.value,
  });
  saving.value = false;
};

// Load existing settings + channels/roles
onMounted(() => {
  loadChannels();
  loadRoles();

  const saved = getModuleConfig("moderation");
  if (saved && Object.keys(saved).length > 0) {
    moderationSettings.value = {
      modLogChannelId: saved.modLogChannelId || "none",
      warnThreshold: saved.warnThreshold ?? 3,
      warnAction: saved.warnAction ?? "timeout",
      autoTimeoutDuration: saved.autoTimeoutDuration ?? 60,
      dmOnAction: saved.dmOnAction ?? true,
      exemptRoleIds: saved.exemptRoleIds ?? [],
      deleteCommandMessage: saved.deleteCommandMessage ?? false,
    };
    exemptRoleIdsInput.value =
      moderationSettings.value.exemptRoleIds.join(", ");

    if (saved.commandPermissions) {
      commandPermissions.value = {
        ban: saved.commandPermissions.ban ?? [],
        kick: saved.commandPermissions.kick ?? [],
        timeout: saved.commandPermissions.timeout ?? [],
        warn: saved.commandPermissions.warn ?? [],
        purge: saved.commandPermissions.purge ?? [],
        channel: saved.commandPermissions.channel ?? [],
      };
    }
  }
});
</script>
