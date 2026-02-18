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

    <!-- Recordings List -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-red-500/3 to-transparent pointer-events-none"
      />
      <div class="relative">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div
              class="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20"
            >
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
          <UButton
            v-if="!loadingRecordings"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-heroicons-arrow-path"
            @click="fetchRecordings"
          >
            Refresh
          </UButton>
        </div>

        <!-- Loading -->
        <div
          v-if="loadingRecordings"
          class="flex items-center justify-center py-12 text-gray-400"
        >
          <UIcon
            name="i-heroicons-arrow-path"
            class="animate-spin text-red-400 mr-2"
          />
          Loading recordings...
        </div>

        <!-- Empty State -->
        <div
          v-else-if="recordings.length === 0"
          class="text-center py-12 text-gray-500"
        >
          <UIcon
            name="i-heroicons-microphone"
            class="text-4xl mb-3 text-gray-600"
          />
          <p>No recordings yet</p>
          <p class="text-xs mt-1">
            Use <code class="text-red-400">/record start</code> in a voice
            channel
          </p>
        </div>

        <!-- Recording Cards -->
        <div v-else class="space-y-3">
          <div
            v-for="rec in recordings"
            :key="rec.$id"
            class="bg-gray-800/50 border border-white/5 rounded-lg p-4 space-y-3 group hover:border-white/10 transition-colors"
          >
            <div class="flex items-center justify-between">
              <div>
                <h4 class="font-medium text-white text-sm">
                  {{ rec.title || rec.channel_name }}
                </h4>
                <div
                  class="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5"
                >
                  <span>{{ formatDateTime(rec.started_at) }}</span>
                  <span v-if="rec.duration">
                    {{ formatDuration(rec.duration) }}
                  </span>
                  <span v-if="rec.bitrate">{{ rec.bitrate }} kbps</span>
                  <span v-if="rec.participants">
                    {{ getParticipantCount(rec.participants) }} user{{
                      getParticipantCount(rec.participants) !== 1 ? "s" : ""
                    }}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <UButton
                  v-if="expandedRecording !== rec.$id"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-chevron-down"
                  @click="toggleExpand(rec.$id)"
                />
                <UButton
                  v-else
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-chevron-up"
                  @click="toggleExpand(rec.$id)"
                />
                <UButton
                  color="error"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-trash"
                  :loading="deletingId === rec.$id"
                  @click="confirmDelete(rec)"
                />
              </div>
            </div>

            <!-- Mixed Audio Player -->
            <div v-if="rec.mixed_file_id" class="space-y-2">
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-heroicons-speaker-wave"
                  class="text-red-400 text-xs"
                />
                <span class="text-[10px] text-gray-400 font-medium">
                  Mixed Audio
                </span>
              </div>
              <audio
                controls
                :src="getFileUrl(rec.mixed_file_id)"
                class="w-full h-8"
                preload="none"
              />
            </div>

            <!-- Expanded: Per-User Tracks -->
            <div
              v-if="expandedRecording === rec.$id"
              class="border-t border-white/5 pt-3 space-y-2"
            >
              <div
                v-if="loadingTracks"
                class="flex items-center gap-2 py-2 text-gray-500 text-sm"
              >
                <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
                Loading tracks...
              </div>
              <div
                v-else-if="activeTracks.length === 0"
                class="text-xs text-gray-500 italic py-2"
              >
                No individual tracks found
              </div>
              <div
                v-for="track in activeTracks"
                :key="track.$id"
                class="bg-gray-900/40 border border-white/5 rounded-lg p-3 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <UIcon
                      name="i-heroicons-user"
                      class="text-indigo-400 text-xs"
                    />
                    <span class="text-xs font-medium text-gray-300">
                      {{ track.username }}
                    </span>
                  </div>
                  <span
                    v-if="track.file_size"
                    class="text-[10px] text-gray-600 font-mono"
                  >
                    {{ formatFileSize(track.file_size) }}
                  </span>
                </div>
                <audio
                  controls
                  :src="getFileUrl(track.file_id)"
                  class="w-full h-8"
                  preload="none"
                />
              </div>
            </div>
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
import { ref, onMounted } from "vue";

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

const recordings = ref<any[]>([]);
const loadingRecordings = ref(true);
const expandedRecording = ref<string | null>(null);
const activeTracks = ref<any[]>([]);
const loadingTracks = ref(false);
const showDeleteConfirm = ref(false);
const recordingToDelete = ref<any>(null);
const deletingId = ref<string | null>(null);

const { databases } = useAppwrite();

// ── API Helpers ──

const appwriteEndpoint = useRuntimeConfig().public.appwriteEndpoint;
const appwriteProjectId = useRuntimeConfig().public.appwriteProjectId;

function getFileUrl(fileId: string): string {
  return `${appwriteEndpoint}/storage/buckets/recordings/files/${fileId}/view?project=${appwriteProjectId}`;
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

// ── Recordings CRUD ──

async function fetchRecordings() {
  loadingRecordings.value = true;
  try {
    const { Query } = await import("appwrite");
    const response = await databases.listDocuments(
      "discord_bot",
      "recordings",
      [
        Query.equal("guild_id", guildId),
        Query.orderDesc("started_at"),
        Query.limit(50),
      ],
    );
    recordings.value = response.documents;
  } catch (err) {
    console.error("Error fetching recordings:", err);
  } finally {
    loadingRecordings.value = false;
  }
}

async function toggleExpand(recordingId: string) {
  if (expandedRecording.value === recordingId) {
    expandedRecording.value = null;
    activeTracks.value = [];
    return;
  }

  expandedRecording.value = recordingId;
  loadingTracks.value = true;
  try {
    const { Query } = await import("appwrite");
    const response = await databases.listDocuments(
      "discord_bot",
      "recording_tracks",
      [Query.equal("recording_id", recordingId), Query.limit(100)],
    );
    activeTracks.value = response.documents;
  } catch (err) {
    console.error("Error fetching tracks:", err);
    activeTracks.value = [];
  } finally {
    loadingTracks.value = false;
  }
}

function confirmDelete(rec: any) {
  recordingToDelete.value = rec;
  showDeleteConfirm.value = true;
}

async function handleDelete() {
  if (!recordingToDelete.value) return;

  const rec = recordingToDelete.value;
  deletingId.value = rec.$id;

  try {
    const { Query } = await import("appwrite");
    // 1. Delete tracks + their files
    const tracksRes = await databases.listDocuments(
      "discord_bot",
      "recording_tracks",
      [Query.equal("recording_id", rec.$id), Query.limit(100)],
    );

    for (const track of tracksRes.documents) {
      try {
        await $fetch(`/api/recordings/delete-file`, {
          method: "POST",
          body: { fileId: track.file_id },
        });
      } catch {}
      await databases.deleteDocument(
        "discord_bot",
        "recording_tracks",
        track.$id,
      );
    }

    // 2. Delete mixed file
    if (rec.mixed_file_id) {
      try {
        await $fetch(`/api/recordings/delete-file`, {
          method: "POST",
          body: { fileId: rec.mixed_file_id },
        });
      } catch {}
    }

    // 3. Delete recording doc
    await databases.deleteDocument("discord_bot", "recordings", rec.$id);

    // 4. Remove from local state
    recordings.value = recordings.value.filter((r) => r.$id !== rec.$id);
    showDeleteConfirm.value = false;
    recordingToDelete.value = null;

    if (expandedRecording.value === rec.$id) {
      expandedRecording.value = null;
      activeTracks.value = [];
    }
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
