<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2
          class="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent"
        >
          Embed Builder
        </h2>
        <p class="text-sm text-gray-400 mt-1">
          Build and send rich embed messages, or save them as reusable presets
          and tags
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="outline"
          color="neutral"
          icon="i-heroicons-bookmark"
          @click="openSaveDialog('preset')"
          :disabled="!hasAnyContent"
        >
          Save as Preset
        </UButton>
        <UButton
          variant="outline"
          color="neutral"
          icon="i-heroicons-tag"
          @click="openSaveDialog('tag')"
          :disabled="!hasAnyContent"
        >
          Save as Tag
        </UButton>
      </div>
    </div>

    <!-- Split Layout: Form + Preview -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Left Column: Form -->
      <div class="space-y-4">
        <!-- Channel Selector -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent pointer-events-none"
          />
          <div class="relative">
            <div class="flex items-center gap-2 mb-3">
              <div
                class="p-1.5 rounded-lg bg-primary-500/10 border border-primary-500/20"
              >
                <UIcon
                  name="i-heroicons-hashtag"
                  class="text-primary-400 text-sm"
                />
              </div>
              <h3 class="text-sm font-semibold text-white">Target Channel</h3>
              <span
                v-if="loadedFromPreset"
                class="ml-auto text-xs text-primary-400 flex items-center gap-1"
              >
                <UIcon name="i-heroicons-bookmark" class="text-xs" />
                Editing preset: {{ loadedFromPreset }}
              </span>
            </div>
            <div
              v-if="channelsLoading"
              class="flex items-center gap-2 py-2 text-gray-400"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="animate-spin text-primary-400 text-sm"
              />
              <span class="text-sm">Loading channels...</span>
            </div>
            <div v-else-if="channels.length === 0" class="py-2">
              <p class="text-sm text-gray-400">
                No text channels found. Make sure the bot is in this server.
              </p>
            </div>
            <USelectMenu
              v-else
              v-model="targetChannelId"
              :items="channelOptions"
              value-key="value"
              placeholder="Select a channel..."
              icon="i-heroicons-hashtag"
              size="lg"
              class="w-full"
            />
          </div>
        </div>

        <EmbedEditor v-model="embedForm" />

        <!-- Action Buttons -->
        <div class="flex items-center justify-between gap-3 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            @click="resetEmbedForm"
            icon="i-heroicons-arrow-path"
          >
            {{ loadedFromPreset ? "Discard Changes" : "Reset" }}
          </UButton>
          <div class="flex items-center gap-2 flex-1 justify-end">
            <UButton
              v-if="loadedFromPreset && editingPresetId"
              variant="outline"
              color="primary"
              icon="i-heroicons-check"
              :loading="savingPreset"
              @click="updateLoadedPreset"
            >
              Save Changes
            </UButton>
            <UButton
              color="primary"
              size="lg"
              icon="i-heroicons-paper-airplane"
              :loading="sendingEmbed"
              :disabled="!targetChannelId || !hasAnyContent"
              @click="sendEmbed"
            >
              Send Embed
            </UButton>
          </div>
        </div>
      </div>

      <!-- Right Column: Live Preview (Sticky) -->
      <div class="xl:sticky xl:top-6 xl:h-fit">
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
          />
          <div class="relative">
            <div class="flex items-center gap-2 mb-3">
              <div
                class="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
              >
                <UIcon name="i-heroicons-eye" class="text-indigo-400 text-sm" />
              </div>
              <h3 class="text-sm font-semibold text-white">Live Preview</h3>
              <UBadge variant="soft" color="success" class="ml-auto" size="xs">
                <span class="flex items-center gap-1">
                  <span
                    class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"
                  />
                  Live
                </span>
              </UBadge>
            </div>

            <EmbedPreview :form="embedForm" :context="mdContext" />
          </div>
        </div>
      </div>
    </div>

    <!-- Saved Embeds (Presets) -->
    <div class="pt-4">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-heroicons-bookmark"
            class="text-primary-400 text-lg"
          />
          <h3 class="text-lg font-semibold text-white">Saved Embeds</h3>
          <UBadge v-if="presets.length > 0" color="neutral" variant="soft" size="xs">
            {{ presets.length }}
          </UBadge>
        </div>
        <UButton
          v-if="!presetsLoading && presets.length > 0"
          icon="i-heroicons-arrow-path"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="fetchPresets"
        >
          Refresh
        </UButton>
      </div>

      <div v-if="presetsLoading" class="flex items-center justify-center py-8">
        <UIcon
          name="i-heroicons-arrow-path"
          class="w-6 h-6 animate-spin text-primary-400"
        />
      </div>

      <div
        v-else-if="presets.length === 0"
        class="rounded-xl border border-white/10 bg-gray-900/50 p-6 text-center"
      >
        <UIcon
          name="i-heroicons-bookmark"
          class="text-3xl text-gray-600 mb-2"
        />
        <p class="text-sm text-gray-400">
          No saved embeds yet. Build one above and click
          <span class="text-primary-400">Save as Preset</span> to keep it here
          for reuse.
        </p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="preset in presets"
          :key="preset.$id"
          class="group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 transition-all hover:border-white/20"
        >
          <div
            class="absolute top-0 left-0 right-0 h-1"
            :style="{ backgroundColor: presetColor(preset) }"
          />
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <code
                class="text-sm font-semibold text-white bg-gray-800/60 px-2 py-0.5 rounded truncate"
                :title="preset.name"
                >{{ preset.name }}</code
              >
            </div>
            <p
              class="text-xs text-gray-400 truncate mb-2"
              :title="presetSubtitle(preset)"
            >
              {{ presetSubtitle(preset) }}
            </p>
            <p
              v-if="preset.description"
              class="text-xs text-gray-500 italic line-clamp-2 mb-2"
            >
              {{ preset.description }}
            </p>
          </div>
          <div class="flex items-center gap-1 mt-2">
            <UButton
              icon="i-heroicons-arrow-down-tray"
              size="xs"
              variant="soft"
              color="primary"
              title="Load into editor"
              @click="loadPreset(preset)"
            >
              Load
            </UButton>
            <UButton
              icon="i-heroicons-trash"
              size="xs"
              variant="ghost"
              color="error"
              title="Delete preset"
              @click="confirmDeletePreset(preset)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Save Dialog (Preset or Tag) ═══ -->
    <UModal v-model:open="saveOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-white">
              {{ saveMode === "preset" ? "Save as Preset" : "Save as Tag" }}
            </h3>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="saveOpen = false"
            />
          </div>
          <p class="text-sm text-gray-400">
            <template v-if="saveMode === 'preset'">
              Presets are private to the dashboard — they let you reload and
              tweak this embed later without committing to a
              <code class="text-primary-400">/tag</code> name.
            </template>
            <template v-else>
              Tags are posted in Discord with
              <code class="text-primary-400">/tag name</code>.
            </template>
          </p>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1.5">
              {{ saveMode === "preset" ? "Preset Name" : "Tag Name" }}
            </label>
            <UInput
              v-model="saveName"
              :placeholder="
                saveMode === 'preset' ? 'e.g. monthly-announcement' : 'e.g. welcome-rules'
              "
              size="lg"
              class="w-full"
            />
            <p class="text-xs text-gray-500 mt-1">
              Lowercase, hyphens only.
            </p>
          </div>
          <div v-if="saveMode === 'preset'">
            <label class="block text-sm font-medium text-gray-300 mb-1.5">
              Description
              <span class="text-gray-500 text-xs font-normal">(optional)</span>
            </label>
            <UInput
              v-model="saveDescription"
              placeholder="e.g. used for monthly product updates"
              size="lg"
              class="w-full"
            />
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <UButton variant="ghost" color="neutral" @click="saveOpen = false">
              Cancel
            </UButton>
            <UButton
              color="primary"
              :icon="
                saveMode === 'preset' ? 'i-heroicons-bookmark' : 'i-heroicons-tag'
              "
              :loading="saveBusy"
              :disabled="!saveName.trim()"
              @click="confirmSave"
            >
              {{ saveMode === "preset" ? "Save Preset" : "Save Tag" }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ═══ Delete Preset Confirmation ═══ -->
    <UModal v-model:open="deletePresetOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div
              class="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20"
            >
              <UIcon name="i-heroicons-trash" class="text-red-400 text-xl" />
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">Delete Preset</h3>
              <p class="text-sm text-gray-400">
                Delete
                <code class="text-red-400">{{ deletingPreset?.name }}</code
                >? This can't be undone.
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="deletePresetOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              icon="i-heroicons-trash"
              :loading="deletingPresetBusy"
              @click="deletePreset"
            >
              Delete
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
  emptyEmbedForm,
  fromEmbedData,
  hasEmbedContent,
  toEmbedPayload,
  type EmbedForm,
} from "~/utils/embed-form";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { state, loadChannels, loadRoles, channelOptions } =
  useServerSettings(guildId);
const toast = useToast();

const channels = computed(() => state.value.channels);
const channelsLoading = computed(() => state.value.channelsLoading);
const roles = computed(() => state.value.roles);

const mdContext = computed(() => ({
  channels: channels.value.map((c: any) => ({ id: c.id, name: c.name })),
  roles: roles.value.map((r: any) => ({
    id: r.id,
    name: r.name,
    color: r.color,
  })),
}));

// ── Form state ──────────────────────────────────────────────────────────
const embedForm = ref<EmbedForm>(emptyEmbedForm());
const targetChannelId = ref<string | { value: string } | "">("");
const sendingEmbed = ref(false);
const loadedFromPreset = ref<string | null>(null);
const editingPresetId = ref<string | null>(null);

const hasAnyContent = computed(() => hasEmbedContent(embedForm.value));

function resolveChannelId(): string {
  const v = targetChannelId.value;
  if (!v) return "";
  if (typeof v === "object" && v !== null && "value" in v) return v.value;
  return String(v);
}

function resetEmbedForm() {
  embedForm.value = emptyEmbedForm();
  loadedFromPreset.value = null;
  editingPresetId.value = null;
}

async function sendEmbed() {
  const channelId = resolveChannelId();
  if (!channelId) {
    toast.add({
      title: "Error",
      description: "Please select a channel.",
      color: "error",
    });
    return;
  }
  if (!hasAnyContent.value) {
    toast.add({
      title: "Error",
      description: "Embed must have at least a title, description, or fields.",
      color: "error",
    });
    return;
  }

  sendingEmbed.value = true;
  try {
    await $fetch("/api/discord/send-embed", {
      method: "POST",
      body: {
        guild_id: guildId,
        channel_id: channelId,
        embed: toEmbedPayload(embedForm.value),
      },
    });

    const channelName =
      channels.value.find((c: any) => c.id === channelId)?.name || "channel";
    toast.add({
      title: "Embed Sent!",
      description: `Successfully sent to #${channelName}.`,
      color: "success",
    });
  } catch (error: any) {
    console.error("Error sending embed:", error);
    toast.add({
      title: "Failed to Send",
      description:
        error?.data?.statusMessage || error?.message || "Unknown error.",
      color: "error",
    });
  } finally {
    sendingEmbed.value = false;
  }
}

// ── Save dialog (preset OR tag) ─────────────────────────────────────────
const saveOpen = ref(false);
const saveMode = ref<"preset" | "tag">("preset");
const saveName = ref("");
const saveDescription = ref("");
const saveBusy = ref(false);

function openSaveDialog(mode: "preset" | "tag") {
  saveMode.value = mode;
  saveName.value = "";
  saveDescription.value = "";
  saveOpen.value = true;
}

async function confirmSave() {
  saveBusy.value = true;
  try {
    const embed = toEmbedPayload(embedForm.value);
    await $fetch("/api/tags/create", {
      method: "POST",
      body: {
        guild_id: guildId,
        name: saveName.value,
        embed_data: embed,
        is_template: saveMode.value === "preset",
        description:
          saveMode.value === "preset" && saveDescription.value
            ? saveDescription.value
            : undefined,
      },
    });
    toast.add({
      title: saveMode.value === "preset" ? "Preset Saved" : "Tag Saved",
      description:
        saveMode.value === "preset"
          ? `Saved "${saveName.value}". It'll appear below under Saved Embeds.`
          : `Saved "${saveName.value}". Use /tag ${saveName.value} to post it.`,
      color: "success",
    });
    saveOpen.value = false;
    if (saveMode.value === "preset") await fetchPresets();
  } catch (error: any) {
    console.error("Error saving:", error);
    toast.add({
      title: "Error",
      description:
        error?.data?.statusMessage || error?.message || "Failed to save.",
      color: "error",
    });
  } finally {
    saveBusy.value = false;
  }
}

// ── Presets list ────────────────────────────────────────────────────────
const presets = ref<any[]>([]);
const presetsLoading = ref(true);
const savingPreset = ref(false);

async function fetchPresets() {
  presetsLoading.value = true;
  try {
    const response = await $fetch<any>("/api/tags/list", {
      params: { guild_id: guildId },
    });
    const all = response.documents || [];
    presets.value = all.filter((t: any) => t.is_template === true);
  } catch (error) {
    console.error("Error fetching presets:", error);
  } finally {
    presetsLoading.value = false;
  }
}

function presetSubtitle(preset: any): string {
  if (!preset.embed_data) return "No embed data";
  try {
    const data = JSON.parse(preset.embed_data);
    return (
      data.title ||
      (data.description ? String(data.description).slice(0, 60) : "") ||
      "Embed"
    );
  } catch {
    return "Embed";
  }
}

function presetColor(preset: any): string {
  if (!preset.embed_data) return "#5865f2";
  try {
    const data = JSON.parse(preset.embed_data);
    if (typeof data.color === "number") {
      return `#${data.color.toString(16).padStart(6, "0")}`;
    }
  } catch {}
  return "#5865f2";
}

function loadPreset(preset: any) {
  embedForm.value = fromEmbedData(preset.embed_data);
  loadedFromPreset.value = preset.name;
  editingPresetId.value = preset.$id;
  toast.add({
    title: "Preset Loaded",
    description: `"${preset.name}" is now in the editor. Edits won't be saved until you click Save Changes.`,
    color: "info",
  });
}

async function updateLoadedPreset() {
  if (!editingPresetId.value) return;
  savingPreset.value = true;
  try {
    const embed = toEmbedPayload(embedForm.value);
    await $fetch("/api/tags/update", {
      method: "PUT",
      body: {
        tag_id: editingPresetId.value,
        guild_id: guildId,
        embed_data: embed,
      },
    });
    toast.add({
      title: "Preset Updated",
      description: `Saved changes to "${loadedFromPreset.value}".`,
      color: "success",
    });
    await fetchPresets();
  } catch (error: any) {
    console.error("Error updating preset:", error);
    toast.add({
      title: "Error",
      description:
        error?.data?.statusMessage || error?.message || "Failed to update.",
      color: "error",
    });
  } finally {
    savingPreset.value = false;
  }
}

// ── Delete preset ───────────────────────────────────────────────────────
const deletePresetOpen = ref(false);
const deletingPreset = ref<any>(null);
const deletingPresetBusy = ref(false);

function confirmDeletePreset(preset: any) {
  deletingPreset.value = preset;
  deletePresetOpen.value = true;
}

async function deletePreset() {
  if (!deletingPreset.value) return;
  deletingPresetBusy.value = true;
  try {
    await $fetch("/api/tags/delete", {
      method: "POST",
      body: {
        tag_id: deletingPreset.value.$id,
        guild_id: guildId,
      },
    });
    toast.add({
      title: "Preset Deleted",
      description: `"${deletingPreset.value.name}" has been removed.`,
      color: "success",
    });
    if (editingPresetId.value === deletingPreset.value.$id) {
      loadedFromPreset.value = null;
      editingPresetId.value = null;
    }
    deletePresetOpen.value = false;
    await fetchPresets();
  } catch (error: any) {
    console.error("Error deleting preset:", error);
    toast.add({
      title: "Error",
      description:
        error?.data?.statusMessage || "Failed to delete preset.",
      color: "error",
    });
  } finally {
    deletingPresetBusy.value = false;
  }
}

onMounted(() => {
  loadChannels();
  loadRoles();
  fetchPresets();
});
</script>
