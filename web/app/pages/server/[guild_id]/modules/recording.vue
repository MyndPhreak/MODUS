<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-3">
        <div class="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <UIcon name="i-heroicons-microphone" class="text-red-400 text-lg" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Recording Settings</h2>
          <p class="text-xs text-gray-500">
            Configure voice channel recording for this server
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('Recording') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("Recording") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Settings Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Recording Quality -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-4">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20"
            >
              <UIcon name="i-heroicons-signal" class="text-red-400" />
            </div>
            <div>
              <h3 class="font-semibold text-white">Recording Quality</h3>
              <p class="text-[10px] text-gray-500">
                Higher bitrates produce better audio but larger files
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <button
              v-for="option in bitrateOptions"
              :key="option.value"
              type="button"
              class="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm transition-all duration-200"
              :class="
                recordingSettings.bitrate === option.value
                  ? 'bg-red-500/20 border border-red-500/40 text-red-300 ring-1 ring-red-500/30'
                  : 'bg-gray-800/50 border border-white/5 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
              "
              @click="recordingSettings.bitrate = option.value"
            >
              <div class="flex items-center gap-3">
                <UIcon
                  :name="
                    recordingSettings.bitrate === option.value
                      ? 'i-heroicons-check-circle-solid'
                      : 'i-heroicons-stop'
                  "
                  :class="
                    recordingSettings.bitrate === option.value
                      ? 'text-red-400'
                      : 'text-gray-600'
                  "
                />
                <div class="text-left">
                  <div class="font-medium">{{ option.label }}</div>
                  <div class="text-[10px] opacity-60">
                    {{ option.description }}
                  </div>
                </div>
              </div>
              <span class="text-xs font-mono opacity-60">
                {{ option.estimate }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- General Settings -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20"
            >
              <UIcon name="i-heroicons-cog-6-tooth" class="text-orange-400" />
            </div>
            <h3 class="font-semibold text-white">General</h3>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">
              Max Recording Duration:
              {{ formatDuration(recordingSettings.maxDuration) }}
            </label>
            <USlider
              v-model="recordingSettings.maxDuration"
              :min="300"
              :max="14400"
              :step="300"
            />
            <p class="text-[10px] text-gray-500 mt-1">
              Recordings automatically stop after this duration (5 min – 4
              hours)
            </p>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <label class="text-sm font-medium">TTS Announcement</label>
              <p class="text-[10px] text-gray-500">
                Announce recording start via text-to-speech
              </p>
            </div>
            <USwitch v-model="recordingSettings.ttsAnnounce" />
          </div>
        </div>
      </div>
    </div>

    <!-- Permissions Section (full width) -->
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
            <UIcon name="i-heroicons-shield-check" class="text-indigo-400" />
          </div>
          <div>
            <h3 class="font-semibold text-white">Recording Permissions</h3>
            <p class="text-[10px] text-gray-500">
              Only server admins and users/roles listed here can start
              recordings
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <!-- Allowed Roles -->
          <div>
            <label class="block text-sm font-medium mb-2">Allowed Roles</label>
            <div
              v-if="state.rolesLoading"
              class="flex items-center gap-2 py-2 text-gray-400"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="animate-spin text-indigo-400"
              />
              <span class="text-sm">Loading roles...</span>
            </div>
            <template v-else>
              <USelectMenu
                v-if="roleOptions.length > 0"
                v-model="recordingSettings.allowedRoleIds"
                :items="roleOptions"
                value-key="value"
                multiple
                placeholder="Select roles that can record..."
                size="sm"
              />
              <div v-else class="text-xs text-gray-500 italic py-2">
                No roles available. Make sure the bot is in this server.
              </div>
            </template>
            <div
              v-if="recordingSettings.allowedRoleIds.length > 0"
              class="flex flex-wrap gap-1.5 mt-2"
            >
              <UBadge
                v-for="roleId in recordingSettings.allowedRoleIds"
                :key="roleId"
                color="primary"
                variant="soft"
                size="xs"
              >
                {{ getRoleName(roleId) }}
                <button
                  class="ml-1 hover:text-red-400 transition-colors"
                  @click="removeRole(roleId)"
                >
                  ×
                </button>
              </UBadge>
            </div>
          </div>

          <!-- Allowed Users -->
          <div>
            <label class="block text-sm font-medium mb-2">
              Allowed User IDs
            </label>
            <div class="flex gap-2">
              <UInput
                v-model="newUserId"
                placeholder="Enter a Discord user ID"
                size="sm"
                class="flex-1"
                @keyup.enter="addUserId"
              />
              <UButton
                color="primary"
                variant="soft"
                size="sm"
                icon="i-heroicons-plus"
                @click="addUserId"
                :disabled="!newUserId.trim()"
              />
            </div>
            <p class="text-[10px] text-gray-500 mt-1">
              Right-click a user → Copy User ID
            </p>
            <div
              v-if="recordingSettings.allowedUserIds.length > 0"
              class="flex flex-wrap gap-1.5 mt-2"
            >
              <UBadge
                v-for="userId in recordingSettings.allowedUserIds"
                :key="userId"
                color="info"
                variant="soft"
                size="xs"
              >
                {{ userId }}
                <button
                  class="ml-1 hover:text-red-400 transition-colors"
                  @click="removeUser(userId)"
                >
                  ×
                </button>
              </UBadge>
            </div>
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
        Save Recording Settings
      </UButton>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- Recordings Table                                                   -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-red-500/3 to-transparent pointer-events-none"
      />

      <!-- Table Header Bar -->
      <div
        class="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 border-b border-white/5"
      >
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <UIcon name="i-heroicons-folder-open" class="text-red-400" />
          </div>
          <div>
            <h3 class="font-semibold text-white">Recordings</h3>
            <p class="text-[10px] text-gray-500">
              {{ recordings.length }} recording{{
                recordings.length !== 1 ? "s" : ""
              }}
              found
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 w-full sm:w-auto">
          <UInput
            v-model="searchQuery"
            placeholder="Search recordings..."
            icon="i-heroicons-magnifying-glass"
            size="sm"
            class="flex-1 sm:w-56"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-heroicons-arrow-path"
            :loading="loadingRecordings"
            @click="fetchRecordings"
          />
        </div>
      </div>

      <!-- Loading -->
      <div
        v-if="loadingRecordings"
        class="relative flex items-center justify-center py-16 text-gray-400"
      >
        <UIcon
          name="i-heroicons-arrow-path"
          class="animate-spin text-2xl text-red-400 mr-3"
        />
        <span class="text-sm">Loading recordings…</span>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="filteredRecordings.length === 0"
        class="relative text-center py-16"
      >
        <UIcon
          name="i-heroicons-microphone"
          class="text-5xl text-gray-600 mb-3"
        />
        <p class="text-gray-400">
          {{
            recordings.length === 0
              ? "No recordings yet"
              : "No recordings matching your search"
          }}
        </p>
        <p v-if="recordings.length === 0" class="text-xs text-gray-600 mt-1">
          Use <code class="text-red-400">/record start</code> in a voice channel
        </p>
      </div>

      <!-- Table -->
      <div v-else class="relative">
        <UTable
          :data="paginatedRecordings"
          :columns="tableColumns"
          :loading="loadingRecordings"
          :ui="{
            root: 'w-full',
            th: 'text-gray-400 text-xs font-medium uppercase tracking-wider',
            td: 'text-sm',
          }"
        >
          <template #expanded="{ row }">
            <div class="px-4 py-4 bg-gray-950/50">
              <!-- Loading tracks -->
              <div
                v-if="loadingTracks"
                class="flex items-center gap-2 py-6 justify-center text-gray-500 text-sm"
              >
                <UIcon
                  name="i-heroicons-arrow-path"
                  class="animate-spin text-red-400"
                />
                Loading tracks...
              </div>

              <!-- No tracks -->
              <div
                v-else-if="
                  expandedTracks.length === 0 && !row.original.mixed_file_id
                "
                class="text-xs text-gray-500 italic py-6 text-center"
              >
                No audio tracks found for this recording.
              </div>

              <!-- Multi-track Player -->
              <RecordingMultiTrackPlayer
                v-else-if="expandedTracks.length > 0"
                :tracks="expandedTracks"
                :mixed-file-id="row.original.mixed_file_id"
                :recording-title="
                  row.original.title || row.original.channel_name
                "
              />

              <!-- Only mixed, no individual tracks -->
              <div v-else-if="row.original.mixed_file_id" class="space-y-2">
                <div class="flex items-center gap-2">
                  <UIcon
                    name="i-heroicons-speaker-wave"
                    class="text-red-400 text-xs"
                  />
                  <span class="text-xs font-medium text-gray-300"
                    >Mixed Audio</span
                  >
                </div>
                <audio
                  controls
                  :src="getStreamUrl(row.original.mixed_file_id)"
                  class="w-full h-8"
                  preload="none"
                />
              </div>
            </div>
          </template>
        </UTable>

        <!-- Pagination -->
        <div
          v-if="totalPages > 1"
          class="flex items-center justify-between px-5 py-3 border-t border-white/5"
        >
          <span class="text-xs text-gray-500">
            Showing {{ (currentPage - 1) * perPage + 1 }}–{{
              Math.min(currentPage * perPage, filteredRecordings.length)
            }}
            of {{ filteredRecordings.length }}
          </span>
          <div class="flex gap-1">
            <UButton
              icon="i-heroicons-chevron-left"
              size="xs"
              variant="ghost"
              :disabled="currentPage <= 1"
              @click="currentPage--"
            />
            <UButton
              icon="i-heroicons-chevron-right"
              size="xs"
              variant="ghost"
              :disabled="currentPage >= totalPages"
              @click="currentPage++"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteConfirm">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-red-500/20 border border-red-500/30">
              <UIcon
                name="i-heroicons-exclamation-triangle"
                class="w-6 h-6 text-red-400"
              />
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">Delete Recording</h3>
              <p class="text-sm text-gray-400">This action cannot be undone</p>
            </div>
          </div>

          <p class="text-gray-300">
            Are you sure you want to delete
            <strong>{{
              recordingToDelete?.title || recordingToDelete?.channel_name
            }}</strong
            >? All audio tracks will be permanently deleted.
          </p>

          <div class="flex justify-end gap-3 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showDeleteConfirm = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              @click="handleDelete"
              :loading="deletingId !== null"
              icon="i-heroicons-trash"
            >
              Delete Recording
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { h, ref, computed, onMounted, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";

const route = useRoute();
const guildId = route.params.guild_id as string;
const {
  state,
  isModuleEnabled,
  saveModuleSettings,
  getModuleConfig,
  loadRoles,
  roleOptions,
} = useServerSettings(guildId);

const saving = ref(false);
const newUserId = ref("");

// ── Settings ──

const recordingSettings = ref({
  maxDuration: 14400,
  bitrate: 64,
  ttsAnnounce: true,
  allowedRoleIds: [] as string[],
  allowedUserIds: [] as string[],
});

const bitrateOptions = [
  {
    value: 32,
    label: "Low (Voice)",
    description: "Phone-call quality, smallest files",
    estimate: "~57 MB / 4hr",
  },
  {
    value: 64,
    label: "Standard",
    description: "Good voice quality — recommended",
    estimate: "~115 MB / 4hr",
  },
  {
    value: 128,
    label: "High",
    description: "Music-grade quality",
    estimate: "~230 MB / 4hr",
  },
  {
    value: 256,
    label: "Ultra",
    description: "Near-transparent quality",
    estimate: "~460 MB / 4hr",
  },
];

// ── Recordings State ──

type Recording = {
  $id: string;
  title?: string;
  channel_name: string;
  started_at: string;
  ended_at?: string;
  duration?: number;
  bitrate?: number;
  participants?: string;
  mixed_file_id?: string;
  recorded_by: string;
  guild_id: string;
};

const recordings = ref<Recording[]>([]);
const loadingRecordings = ref(true);
const expandedTracks = ref<any[]>([]);
const loadingTracks = ref(false);
const showDeleteConfirm = ref(false);
const recordingToDelete = ref<Recording | null>(null);
const deletingId = ref<string | null>(null);
const searchQuery = ref("");
const currentPage = ref(1);
const perPage = 10;

// ── Computed ──

const filteredRecordings = computed(() => {
  if (!searchQuery.value) return recordings.value;
  const q = searchQuery.value.toLowerCase();
  return recordings.value.filter(
    (r) =>
      r.title?.toLowerCase().includes(q) ||
      r.channel_name?.toLowerCase().includes(q),
  );
});

const totalPages = computed(() =>
  Math.ceil(filteredRecordings.value.length / perPage),
);

const paginatedRecordings = computed(() =>
  filteredRecordings.value.slice(
    (currentPage.value - 1) * perPage,
    currentPage.value * perPage,
  ),
);

// ── Stream URL (proxied through our server) ──

function getStreamUrl(fileId: string): string {
  return `/api/recordings/stream?file_id=${fileId}`;
}

// ── Formatting ──

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getParticipantCount(json: string): number {
  try {
    return JSON.parse(json).length;
  } catch {
    return 0;
  }
}

function getRoleName(roleId: string): string {
  const role = state.value.roles.find((r: any) => r.id === roleId);
  return role ? `@${role.name}` : roleId;
}

// ── Table Columns ──

const UBadge = resolveComponent("UBadge");
const UButton = resolveComponent("UButton");

const tableColumns: TableColumn<Recording>[] = [
  {
    accessorKey: "channel_name",
    header: "Recording",
    cell: ({ row }) => {
      const rec = row.original;
      const title = rec.title || rec.channel_name;
      return h("div", { class: "space-y-0.5" }, [
        h("div", { class: "font-medium text-white text-sm" }, title),
        h(
          "div",
          { class: "text-[10px] text-gray-500" },
          formatDateTime(rec.started_at),
        ),
      ]);
    },
  },
  {
    id: "duration",
    header: "Duration",
    cell: ({ row }) => {
      const rec = row.original;
      if (!rec.duration)
        return h("span", { class: "text-gray-600 text-xs" }, "–");
      return h(
        "span",
        { class: "text-xs font-mono text-gray-300" },
        formatDuration(rec.duration),
      );
    },
    meta: { class: { th: "w-24", td: "w-24" } },
  },
  {
    id: "bitrate",
    header: "Quality",
    cell: ({ row }) => {
      const rec = row.original;
      if (!rec.bitrate)
        return h("span", { class: "text-gray-600 text-xs" }, "–");
      return h(
        UBadge,
        { color: "neutral", variant: "subtle", size: "xs" },
        () => `${rec.bitrate} kbps`,
      );
    },
    meta: { class: { th: "w-24", td: "w-24" } },
  },
  {
    id: "participants",
    header: "Users",
    cell: ({ row }) => {
      const rec = row.original;
      if (!rec.participants)
        return h("span", { class: "text-gray-600 text-xs" }, "–");
      const count = getParticipantCount(rec.participants);
      return h(
        "div",
        { class: "flex items-center gap-1 text-xs text-gray-400" },
        [
          h(resolveComponent("UIcon"), {
            name: "i-heroicons-users",
            class: "text-[10px]",
          }),
          h("span", {}, `${count}`),
        ],
      );
    },
    meta: { class: { th: "w-20", td: "w-20" } },
  },
  {
    id: "playback",
    header: "Play",
    cell: ({ row }) => {
      const rec = row.original;
      if (!rec.mixed_file_id)
        return h("span", { class: "text-gray-600 text-[10px]" }, "No audio");
      return h(
        UButton,
        {
          color: "neutral",
          variant: "ghost",
          size: "xs",
          icon: row.getIsExpanded()
            ? "i-heroicons-chevron-up"
            : "i-heroicons-play",
          onClick: () => toggleExpand(row),
        },
        () => (row.getIsExpanded() ? "Hide" : "Play"),
      );
    },
    meta: { class: { th: "w-24 text-center", td: "w-24 text-center" } },
  },
  {
    id: "actions",
    header: "",
    enableHiding: false,
    cell: ({ row }) => {
      const rec = row.original;
      return h("div", { class: "flex items-center justify-end gap-1" }, [
        // Expand tracks (even if no mixed file)
        !rec.mixed_file_id
          ? h(UButton, {
              color: "neutral",
              variant: "ghost",
              size: "xs",
              icon: row.getIsExpanded()
                ? "i-heroicons-chevron-up"
                : "i-heroicons-chevron-down",
              onClick: () => toggleExpand(row),
            })
          : null,
        h(UButton, {
          color: "error",
          variant: "ghost",
          size: "xs",
          icon: "i-heroicons-trash",
          loading: deletingId.value === rec.$id,
          onClick: () => confirmDelete(rec),
        }),
      ]);
    },
    meta: { class: { th: "w-20 text-right", td: "w-20 text-right" } },
  },
];

// ── Role / User Management ──

function removeRole(roleId: string) {
  recordingSettings.value.allowedRoleIds =
    recordingSettings.value.allowedRoleIds.filter((id) => id !== roleId);
}

function addUserId() {
  const id = newUserId.value.trim();
  if (id && !recordingSettings.value.allowedUserIds.includes(id)) {
    recordingSettings.value.allowedUserIds.push(id);
    newUserId.value = "";
  }
}

function removeUser(userId: string) {
  recordingSettings.value.allowedUserIds =
    recordingSettings.value.allowedUserIds.filter((id) => id !== userId);
}

// ── Save ──

const save = async () => {
  saving.value = true;
  await saveModuleSettings("recording", recordingSettings.value);
  saving.value = false;
};

// ── Recordings CRUD (server-side API routes) ──

async function fetchRecordings() {
  loadingRecordings.value = true;
  try {
    const data = await $fetch<Recording[]>("/api/recordings/list", {
      params: { guild_id: guildId },
    });
    recordings.value = data;
    currentPage.value = 1;
  } catch (err) {
    console.error("Error fetching recordings:", err);
  } finally {
    loadingRecordings.value = false;
  }
}

async function toggleExpand(row: any) {
  if (row.getIsExpanded()) {
    row.toggleExpanded(false);
    expandedTracks.value = [];
    return;
  }

  // Collapse any other expanded row
  row.toggleExpanded(true);
  loadingTracks.value = true;
  expandedTracks.value = [];

  try {
    const data = await $fetch<any[]>("/api/recordings/tracks", {
      params: { recording_id: row.original.$id },
    });
    expandedTracks.value = data;
  } catch (err) {
    console.error("Error fetching tracks:", err);
    expandedTracks.value = [];
  } finally {
    loadingTracks.value = false;
  }
}

function confirmDelete(rec: Recording) {
  recordingToDelete.value = rec;
  showDeleteConfirm.value = true;
}

async function handleDelete() {
  if (!recordingToDelete.value) return;

  const rec = recordingToDelete.value;
  deletingId.value = rec.$id;

  try {
    await $fetch("/api/recordings/delete", {
      method: "POST",
      body: { recording_id: rec.$id, guild_id: guildId },
    });

    // Remove from local state
    recordings.value = recordings.value.filter((r) => r.$id !== rec.$id);
    showDeleteConfirm.value = false;
    recordingToDelete.value = null;
    expandedTracks.value = [];
  } catch (err) {
    console.error("Error deleting recording:", err);
  } finally {
    deletingId.value = null;
  }
}

// ── Init ──

onMounted(async () => {
  // Load saved settings
  const saved = getModuleConfig("recording");
  if (saved && Object.keys(saved).length > 0) {
    recordingSettings.value = {
      maxDuration: saved.maxDuration ?? 14400,
      bitrate: saved.bitrate ?? 64,
      ttsAnnounce: saved.ttsAnnounce ?? true,
      allowedRoleIds: saved.allowedRoleIds ?? [],
      allowedUserIds: saved.allowedUserIds ?? [],
    };
  }

  // Load roles for the permission selector
  await loadRoles();

  // Fetch existing recordings
  await fetchRecordings();
});
</script>
