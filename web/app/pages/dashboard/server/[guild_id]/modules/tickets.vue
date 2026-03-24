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
        <div class="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
          <UIcon name="i-heroicons-ticket" class="text-sky-400 text-lg" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Ticket System</h2>
          <p class="text-xs text-gray-500">
            Private thread-based support ticketing
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('tickets') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("tickets") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Panel Configuration -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-5">
        <div class="flex items-center gap-2 mb-1">
          <div class="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <UIcon name="i-heroicons-megaphone" class="text-sky-400" />
          </div>
          <div>
            <h3 class="font-semibold text-white">Panel Configuration</h3>
            <p class="text-[10px] text-gray-500">
              Where the "Open Ticket" button is posted
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Panel Channel -->
          <UFormField
            label="Panel Channel"
            description="The channel where members click the 'Open Ticket' button."
          >
            <div
              v-if="state.channelsLoading"
              class="flex items-center gap-2 py-2 text-gray-400"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="animate-spin text-sky-400"
              />
              <span class="text-sm">Loading channels…</span>
            </div>
            <USelectMenu
              v-else
              v-model="settings.panelChannelId"
              :items="channelOptions"
              value-key="value"
              placeholder="Channel for the ticket panel…"
              searchable
              icon="i-heroicons-hashtag"
              class="w-full"
            />
          </UFormField>

          <!-- Default Thread Parent -->
          <UFormField
            label="Default Thread Channel"
            description="Private threads are created here. Defaults to the panel channel."
          >
            <USelectMenu
              v-if="!state.channelsLoading"
              v-model="settings.defaultParentChannelId"
              :items="channelOptions"
              value-key="value"
              placeholder="Channel that hosts ticket threads…"
              searchable
              icon="i-heroicons-chat-bubble-left-right"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Panel Embed -->
        <div class="border-t border-white/5 pt-4 space-y-4">
          <p class="text-xs font-semibold text-gray-400">Panel Embed</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UFormField label="Title" class="md:col-span-2">
              <UInput
                v-model="settings.panelEmbed.title"
                placeholder="🎫 Support Tickets"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Accent Color">
              <div class="flex items-center gap-2">
                <input
                  v-model="settings.panelEmbed.color"
                  type="color"
                  class="w-9 h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent shrink-0"
                />
                <UInput
                  v-model="settings.panelEmbed.color"
                  placeholder="#5865F2"
                  icon="i-heroicons-swatch"
                  class="w-full"
                />
              </div>
            </UFormField>

            <UFormField label="Description" class="md:col-span-3">
              <UTextarea
                v-model="settings.panelEmbed.description"
                placeholder="Need help? Click a button below to open a private support ticket with our staff."
                :rows="2"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </div>
    </div>

    <!-- Ticket Types -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div
              class="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
            >
              <UIcon name="i-heroicons-squares-2x2" class="text-violet-400" />
            </div>
            <div>
              <h3 class="font-semibold text-white">Ticket Types</h3>
              <p class="text-[10px] text-gray-500">
                Leave empty for a single generic "Open Ticket" button. Up to 5
                types show as buttons; 6–25 use a dropdown.
              </p>
            </div>
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-heroicons-plus"
            :disabled="settings.types.length >= 25"
            @click="addType"
          >
            Add Type
          </UButton>
        </div>

        <div
          v-if="settings.types.length === 0"
          class="text-xs text-gray-500 italic py-2"
        >
          No types configured — a single "Open Ticket" button will be shown.
        </div>

        <div class="space-y-3">
          <div
            v-for="(type, i) in settings.types"
            :key="type.id"
            class="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-gray-300">
                Type {{ i + 1 }}
              </span>
              <UButton
                size="xs"
                color="error"
                variant="ghost"
                icon="i-heroicons-trash"
                @click="removeType(i)"
              />
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <UFormField label="Name" class="md:col-span-2">
                <UInput
                  v-model="type.name"
                  placeholder="General Support"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Emoji" hint="Optional">
                <UInput
                  v-model="type.emoji"
                  placeholder="🎫"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Button Style">
                <USelectMenu
                  v-model="type.buttonStyle"
                  :items="buttonStyleOptions"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Description"
                description="Shown in the dropdown when there are 6+ types. Max 100 chars."
                class="md:col-span-4"
              >
                <UInput
                  v-model="type.description"
                  placeholder="Open a general support ticket"
                  :maxlength="100"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Thread Parent Channel"
                description="Overrides the default thread channel for this type."
                class="md:col-span-2"
              >
                <USelectMenu
                  v-if="!state.channelsLoading"
                  v-model="type.parentChannelId"
                  :items="[
                    { label: '— Use default —', value: '' },
                    ...channelOptions,
                  ]"
                  value-key="value"
                  placeholder="Use default…"
                  searchable
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Staff Role Override"
                description="Overrides global staff roles for this ticket type."
                class="md:col-span-2"
              >
                <USelectMenu
                  v-if="!state.rolesLoading"
                  v-model="type.staffRoleIds[0]"
                  :items="[
                    { label: '— Use global —', value: '' },
                    ...roleOptions,
                  ]"
                  value-key="value"
                  placeholder="Use global staff roles…"
                  searchable
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Staff & Transcript -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Staff Roles -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-4">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20"
            >
              <UIcon name="i-heroicons-user-group" class="text-blue-400" />
            </div>
            <div>
              <h3 class="font-semibold text-white">Global Staff Roles</h3>
              <p class="text-[10px] text-gray-500">
                These roles can view, claim, and close any ticket
              </p>
            </div>
          </div>

          <div
            v-if="state.rolesLoading"
            class="flex items-center gap-2 py-2 text-gray-400"
          >
            <UIcon
              name="i-heroicons-arrow-path"
              class="animate-spin text-blue-400"
            />
            <span class="text-sm">Loading roles…</span>
          </div>
          <template v-else>
            <!-- Multi-role selection via individual dropdowns -->
            <div class="space-y-2">
              <div
                v-for="(roleId, i) in settings.staffRoleIds"
                :key="i"
                class="flex items-center gap-2"
              >
                <USelectMenu
                  :model-value="roleId"
                  :items="roleOptions"
                  value-key="value"
                  searchable
                  class="flex-1"
                  @update:model-value="
                    (v: string) => (settings.staffRoleIds[i] = v)
                  "
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-heroicons-x-mark"
                  @click="settings.staffRoleIds.splice(i, 1)"
                />
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-heroicons-plus"
                @click="settings.staffRoleIds.push('')"
              >
                Add Role
              </UButton>
            </div>

            <div
              v-if="settings.staffRoleIds.filter(Boolean).length > 0"
              class="flex flex-wrap gap-1 pt-1"
            >
              <span
                v-for="id in settings.staffRoleIds.filter(Boolean)"
                :key="id"
                class="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300"
              >
                @{{ getRoleName(id) }}
              </span>
            </div>
          </template>
        </div>
      </div>

      <!-- Transcript Settings -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
            >
              <UIcon
                name="i-heroicons-document-text"
                class="text-emerald-400"
              />
            </div>
            <div>
              <h3 class="font-semibold text-white">Transcripts</h3>
              <p class="text-[10px] text-gray-500">
                Markdown file delivered on ticket close
              </p>
            </div>
          </div>

          <UFormField
            label="Transcript Log Channel"
            description="Bot posts the transcript here when a ticket closes."
          >
            <USelectMenu
              v-if="!state.channelsLoading"
              v-model="settings.transcriptChannelId"
              :items="[{ label: '— None —', value: '' }, ...channelOptions]"
              value-key="value"
              placeholder="No log channel…"
              searchable
              icon="i-heroicons-hashtag"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="DM Transcript to Opener"
            description="Sends the markdown transcript file directly to the ticket opener."
          >
            <USwitch
              v-model="settings.dmTranscript"
              color="success"
              label="Send DM on ticket close"
            />
          </UFormField>
        </div>
      </div>
    </div>

    <!-- Behaviour -->
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
            <UIcon name="i-heroicons-cog-6-tooth" class="text-amber-400" />
          </div>
          <h3 class="font-semibold text-white">Behaviour</h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField
            label="Max Open Tickets Per User"
            description="Maximum concurrent open tickets per user. Set to 0 for unlimited."
          >
            <UInput
              v-model.number="settings.maxTicketsPerUser"
              type="number"
              :min="0"
              :max="10"
              icon="i-heroicons-hashtag"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Thread Naming Template"
            description="Available variables: {count}, {username}, {type}"
          >
            <UInput
              v-model="settings.namingTemplate"
              placeholder="ticket-{count}-{username}"
              icon="i-heroicons-pencil"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>
    </div>

    <!-- Feature Summary -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-3">
        <div class="flex items-center gap-2">
          <div
            class="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
          >
            <UIcon
              name="i-heroicons-information-circle"
              class="text-indigo-400"
            />
          </div>
          <h3 class="font-semibold text-white">Features</h3>
        </div>
        <div
          class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-400"
        >
          <div v-for="f in features" :key="f" class="flex items-center gap-1.5">
            <UIcon
              name="i-heroicons-check-circle"
              class="text-emerald-400 shrink-0"
            />
            {{ f }}
          </div>
        </div>
      </div>
    </div>

    <!-- Save -->
    <div class="flex justify-end">
      <UButton
        color="primary"
        size="lg"
        icon="i-heroicons-check"
        :loading="saving"
        class="min-w-[200px]"
        @click="save"
      >
        Save Ticket Settings
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { nanoid } from "nanoid";

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

const saving = ref(false);

// ── Settings model ──────────────────────────────────────────────────────────

interface TicketTypeForm {
  id: string;
  name: string;
  emoji: string;
  description: string;
  parentChannelId: string;
  staffRoleIds: string[];
  buttonStyle: string;
}

interface TicketsForm {
  panelChannelId: string;
  defaultParentChannelId: string;
  transcriptChannelId: string;
  dmTranscript: boolean;
  maxTicketsPerUser: number;
  namingTemplate: string;
  types: TicketTypeForm[];
  staffRoleIds: string[];
  panelEmbed: { title: string; description: string; color: string };
}

const settings = ref<TicketsForm>({
  panelChannelId: "",
  defaultParentChannelId: "",
  transcriptChannelId: "",
  dmTranscript: true,
  maxTicketsPerUser: 1,
  namingTemplate: "ticket-{count}-{username}",
  types: [],
  staffRoleIds: [],
  panelEmbed: { title: "", description: "", color: "#5865F2" },
});

// ── Constants ────────────────────────────────────────────────────────────────

const buttonStyleOptions = ["Primary", "Secondary", "Success", "Danger"];

const features = [
  "Private Threads",
  "Multiple Ticket Types",
  "Claim / Unclaim",
  "Set Priority",
  "Add / Remove Users",
  "Rename Thread",
  "Markdown Transcripts",
  "Log Channel",
  "DM Transcript",
  "In-place Panel Update",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRoleName(roleId: string): string {
  const r = state.value.roles?.find((r: any) => r.id === roleId);
  return r ? r.name : roleId;
}

function addType() {
  settings.value.types.push({
    id: nanoid(8),
    name: "",
    emoji: "",
    description: "",
    parentChannelId: "",
    staffRoleIds: [],
    buttonStyle: "Primary",
  });
}

function removeType(index: number) {
  settings.value.types.splice(index, 1);
}

// ── Save ─────────────────────────────────────────────────────────────────────

const save = async () => {
  saving.value = true;

  // Sanitise: remove empty role IDs
  const cleanRoleIds = settings.value.staffRoleIds.filter(Boolean);

  const cleanTypes = settings.value.types
    .filter((t) => t.name.trim())
    .map((t) => ({
      ...t,
      staffRoleIds: t.staffRoleIds.filter(Boolean),
      parentChannelId: t.parentChannelId || undefined,
    }));

  await saveModuleSettings("tickets", {
    panelChannelId: settings.value.panelChannelId || undefined,
    defaultParentChannelId: settings.value.defaultParentChannelId || undefined,
    transcriptChannelId: settings.value.transcriptChannelId || undefined,
    dmTranscript: settings.value.dmTranscript,
    maxTicketsPerUser: settings.value.maxTicketsPerUser,
    namingTemplate:
      settings.value.namingTemplate || "ticket-{count}-{username}",
    types: cleanTypes,
    staffRoleIds: cleanRoleIds,
    panelEmbed:
      settings.value.panelEmbed.title || settings.value.panelEmbed.description
        ? settings.value.panelEmbed
        : undefined,
  });

  saving.value = false;
};

// ── Init ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  const saved = getModuleConfig("tickets");
  if (saved && Object.keys(saved).length > 0) {
    settings.value = {
      panelChannelId: saved.panelChannelId ?? "",
      defaultParentChannelId: saved.defaultParentChannelId ?? "",
      transcriptChannelId: saved.transcriptChannelId ?? "",
      dmTranscript: saved.dmTranscript ?? true,
      maxTicketsPerUser: saved.maxTicketsPerUser ?? 1,
      namingTemplate: saved.namingTemplate ?? "ticket-{count}-{username}",
      types: (saved.types ?? []).map((t: any) => ({
        id: t.id ?? nanoid(8),
        name: t.name ?? "",
        emoji: t.emoji ?? "",
        description: t.description ?? "",
        parentChannelId: t.parentChannelId ?? "",
        staffRoleIds: t.staffRoleIds ?? [],
        buttonStyle: t.buttonStyle ?? "Primary",
      })),
      staffRoleIds: saved.staffRoleIds ?? [],
      panelEmbed: {
        title: saved.panelEmbed?.title ?? "",
        description: saved.panelEmbed?.description ?? "",
        color: saved.panelEmbed?.color ?? "#5865F2",
      },
    };
  }

  await Promise.all([loadChannels(), loadRoles()]);
});
</script>
