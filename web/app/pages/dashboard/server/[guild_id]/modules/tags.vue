<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div>
        <h2
          class="text-2xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent"
        >
          Tags & Snippets
        </h2>
        <p class="text-sm text-gray-400 mt-1">
          Create reusable text or embed tags that staff can post with
          <code
            class="px-1.5 py-0.5 rounded bg-gray-800 text-primary-400 text-xs"
            >/tag name</code
          >
        </p>
      </div>
      <UButton
        icon="i-heroicons-plus"
        size="lg"
        color="primary"
        @click="openEditor(null)"
      >
        New Tag
      </UButton>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-8 h-8 animate-spin text-primary-400"
      />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="tags.length === 0"
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-12 text-center"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none"
      />
      <div class="relative">
        <UIcon name="i-heroicons-tag" class="text-5xl text-gray-600 mb-4" />
        <h3 class="text-lg font-semibold text-white mb-2">No tags yet</h3>
        <p class="text-sm text-gray-400 mb-6 max-w-md mx-auto">
          Create your first tag to give staff quick access to pre-set messages
          and embeds.
        </p>
        <UButton
          icon="i-heroicons-plus"
          color="primary"
          @click="openEditor(null)"
        >
          Create First Tag
        </UButton>
      </div>
    </div>

    <!-- Tags List -->
    <div v-else class="space-y-3">
      <div
        v-for="tag in tags"
        :key="tag.$id"
        class="relative group overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl transition-all hover:border-white/20"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-amber-500/3 to-transparent pointer-events-none"
        />
        <div class="relative p-5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <!-- Type Badge -->
              <div
                class="p-2.5 rounded-lg flex-shrink-0"
                :class="
                  tag.embed_data
                    ? 'bg-indigo-500/10 border border-indigo-500/20'
                    : 'bg-emerald-500/10 border border-emerald-500/20'
                "
              >
                <UIcon
                  :name="
                    tag.embed_data
                      ? 'i-heroicons-rectangle-stack'
                      : 'i-heroicons-document-text'
                  "
                  :class="
                    tag.embed_data ? 'text-indigo-400' : 'text-emerald-400'
                  "
                  class="text-lg"
                />
              </div>

              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <code
                    class="text-base font-semibold text-white bg-gray-800/60 px-2 py-0.5 rounded"
                    >{{ tag.name }}</code
                  >
                  <UBadge
                    :color="tag.embed_data ? 'info' : 'success'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ tag.embed_data ? "Embed" : "Text" }}
                  </UBadge>
                  <UBadge
                    v-if="getTagRoles(tag).length > 0"
                    color="warning"
                    variant="subtle"
                    size="xs"
                  >
                    <UIcon
                      name="i-heroicons-lock-closed"
                      class="text-xs mr-1"
                    />
                    {{ getTagRoles(tag).length }} role{{
                      getTagRoles(tag).length !== 1 ? "s" : ""
                    }}
                  </UBadge>
                </div>
                <p class="text-xs text-gray-500 mt-1 truncate max-w-md">
                  {{ getTagPreview(tag) }}
                </p>
              </div>
            </div>

            <!-- Actions -->
            <div
              class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <UButton
                icon="i-heroicons-eye"
                size="sm"
                variant="ghost"
                color="neutral"
                title="Preview"
                @click="previewTag(tag)"
              />
              <UButton
                icon="i-heroicons-paper-airplane"
                size="sm"
                variant="ghost"
                color="primary"
                title="Send to channel"
                @click="openSendDialog(tag)"
              />
              <UButton
                icon="i-heroicons-pencil-square"
                size="sm"
                variant="ghost"
                color="neutral"
                title="Edit"
                @click="openEditor(tag)"
              />
              <UButton
                icon="i-heroicons-trash"
                size="sm"
                variant="ghost"
                color="error"
                title="Delete"
                @click="confirmDelete(tag)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Tag Editor Modal ═══ -->
    <UModal
      v-model:open="editorOpen"
      :ui="{ content: 'sm:max-w-6xl max-h-[90vh] flex flex-col' }"
    >
      <template #content>
        <div class="flex flex-col max-h-[90vh]">
          <!-- Header stays pinned while the body scrolls underneath. -->
          <div
            class="flex items-center justify-between p-6 pb-4 border-b border-white/10 flex-shrink-0"
          >
            <h3 class="text-xl font-bold text-white">
              {{ editingTag ? "Edit Tag" : "Create Tag" }}
            </h3>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="editorOpen = false"
            />
          </div>

          <div class="flex-1 overflow-y-auto p-6 pt-4">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Left: Form -->
            <div class="space-y-4">
              <!-- Tag Name -->
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-1.5"
                  >Tag Name</label
                >
                <UInput
                  v-model="form.name"
                  placeholder="e.g. shipping-policy"
                  size="lg"
                  class="w-full"
                  :disabled="!!editingTag"
                />
                <p class="text-xs text-gray-500 mt-1">
                  Lowercase, hyphens only. Used as
                  <code class="text-primary-400"
                    >/tag {{ form.name || "name" }}</code
                  >
                </p>
              </div>

              <!-- Type Toggle -->
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-1.5"
                  >Type</label
                >
                <div class="flex gap-2">
                  <UButton
                    :variant="form.type === 'text' ? 'solid' : 'outline'"
                    :color="form.type === 'text' ? 'primary' : 'neutral'"
                    size="sm"
                    icon="i-heroicons-document-text"
                    @click="form.type = 'text'"
                  >
                    Plain Text
                  </UButton>
                  <UButton
                    :variant="form.type === 'embed' ? 'solid' : 'outline'"
                    :color="form.type === 'embed' ? 'primary' : 'neutral'"
                    size="sm"
                    icon="i-heroicons-rectangle-stack"
                    @click="form.type = 'embed'"
                  >
                    Embed
                  </UButton>
                  <UButton
                    :variant="form.type === 'both' ? 'solid' : 'outline'"
                    :color="form.type === 'both' ? 'primary' : 'neutral'"
                    size="sm"
                    icon="i-heroicons-squares-plus"
                    @click="form.type = 'both'"
                  >
                    Both
                  </UButton>
                </div>
              </div>

              <!-- Text Content -->
              <div v-if="form.type === 'text' || form.type === 'both'">
                <label class="block text-sm font-medium text-gray-300 mb-1.5"
                  >Text Content</label
                >
                <UTextarea
                  v-model="form.content"
                  placeholder="Type your message here..."
                  :rows="4"
                  :maxlength="4096"
                  size="lg"
                  autoresize
                  class="w-full"
                />
              </div>

              <!-- Shared embed editor (only when type includes embed) -->
              <EmbedEditor
                v-if="form.type === 'embed' || form.type === 'both'"
                v-model="form.embed"
              />

              <!-- Role Restrictions -->
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-1.5">
                  Allowed Roles
                  <span class="text-gray-500 text-xs font-normal"
                    >(leave empty for everyone)</span
                  >
                </label>
                <USelectMenu
                  v-model="form.allowedRoles"
                  :items="roleOptions"
                  value-key="value"
                  multiple
                  placeholder="All roles can use this tag"
                  icon="i-heroicons-shield-check"
                  class="w-full"
                />
              </div>
            </div>

            <!-- Right: Preview (sticky so it tracks the scrollable form) -->
            <div class="lg:sticky lg:top-0 lg:self-start">
              <label class="block text-sm font-medium text-gray-300 mb-1.5"
                >Preview</label
              >
              <div class="rounded-lg border border-white/10 p-2">
                <EmbedPreview
                  :form="
                    form.type === 'text' ? blankEmbedForm : form.embed
                  "
                  :content="
                    form.type === 'text' || form.type === 'both'
                      ? form.content
                      : undefined
                  "
                  :context="mdContext"
                />
              </div>
            </div>
          </div>

          </div>
          <!-- Footer Actions (pinned) -->
          <div
            class="flex justify-end gap-3 p-4 border-t border-white/10 flex-shrink-0 bg-gray-900/80 backdrop-blur-xl"
          >
            <UButton
              variant="ghost"
              color="neutral"
              @click="editorOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              icon="i-heroicons-check"
              :loading="saving"
              :disabled="!isFormValid"
              @click="saveTag"
            >
              {{ editingTag ? "Update Tag" : "Create Tag" }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ═══ Preview Modal ═══ -->
    <UModal v-model:open="previewOpen">
      <template #content>
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-white">
              Tag Preview:
              <code class="text-primary-400">{{ previewingTag?.name }}</code>
            </h3>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="previewOpen = false"
            />
          </div>
          <EmbedPreview
            v-if="previewingTag"
            :form="previewForm"
            :content="previewingTag.content || undefined"
            :context="mdContext"
          />
        </div>
      </template>
    </UModal>

    <!-- ═══ Send to Channel Modal ═══ -->
    <UModal v-model:open="sendOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-white">
              Send Tag:
              <code class="text-primary-400">{{ sendingTag?.name }}</code>
            </h3>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="sendOpen = false"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1.5"
              >Channel</label
            >
            <div
              v-if="channelsLoading"
              class="flex items-center gap-2 py-2 text-gray-400"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="animate-spin text-primary-400"
              />
              <span class="text-sm">Loading channels...</span>
            </div>
            <USelectMenu
              v-else
              v-model="sendChannelId"
              :items="channelOptions"
              value-key="value"
              placeholder="Select a channel..."
              icon="i-heroicons-hashtag"
              size="lg"
              class="w-full"
            />
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <UButton variant="ghost" color="neutral" @click="sendOpen = false">
              Cancel
            </UButton>
            <UButton
              color="primary"
              icon="i-heroicons-paper-airplane"
              :loading="sendingMessage"
              :disabled="!sendChannelId"
              @click="sendTagToChannel"
            >
              Send
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ═══ Delete Confirmation Modal ═══ -->
    <UModal v-model:open="deleteOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div
              class="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20"
            >
              <UIcon name="i-heroicons-trash" class="text-red-400 text-xl" />
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">Delete Tag</h3>
              <p class="text-sm text-gray-400">
                Are you sure you want to delete
                <code class="text-red-400">{{ deletingTag?.name }}</code
                >?
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="deleteOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              icon="i-heroicons-trash"
              :loading="deleting"
              @click="deleteTag"
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
  toEmbedPayload,
  hasEmbedContent,
  type EmbedForm,
} from "~/utils/embed-form";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { state, loadChannels, loadRoles, channelOptions, roleOptions } =
  useServerSettings(guildId);
const toast = useToast();

const channels = computed(() => state.value.channels);
const channelsLoading = computed(() => state.value.channelsLoading);
const rolesList = computed(() => state.value.roles);

const mdContext = computed(() => ({
  channels: channels.value.map((c: any) => ({ id: c.id, name: c.name })),
  roles: rolesList.value.map((r: any) => ({
    id: r.id,
    name: r.name,
    color: r.color,
  })),
}));

// ── Data ──
// Tags list — excludes presets (is_template=true) so the /tag-invocable set
// stays clean. Presets live on the embeds page.
const tags = ref<any[]>([]);
const loading = ref(true);

interface TagFormState {
  name: string;
  type: "text" | "embed" | "both";
  content: string;
  embed: EmbedForm;
  allowedRoles: string[];
}

function newTagForm(): TagFormState {
  return {
    name: "",
    type: "text",
    content: "",
    embed: emptyEmbedForm(),
    allowedRoles: [],
  };
}

// A stable empty-form reference the preview can fall back to for text-only
// tags — prevents unnecessary re-renders.
const blankEmbedForm = emptyEmbedForm();

// ── Editor State ──
const editorOpen = ref(false);
const editingTag = ref<any>(null);
const saving = ref(false);
const form = ref<TagFormState>(newTagForm());

const isFormValid = computed(() => {
  if (!form.value.name.trim()) return false;

  const hasText = form.value.content.trim().length > 0;
  const hasEmbed = hasEmbedContent(form.value.embed);

  if (form.value.type === "text") return hasText;
  if (form.value.type === "embed") return hasEmbed;
  return hasText || hasEmbed;
});

// ── Preview State ──
const previewOpen = ref(false);
const previewingTag = ref<any>(null);

const previewForm = computed<EmbedForm>(() => {
  if (!previewingTag.value?.embed_data) return blankEmbedForm;
  return fromEmbedData(previewingTag.value.embed_data);
});

// ── Send State ──
const sendOpen = ref(false);
const sendingTag = ref<any>(null);
const sendChannelId = ref<string | { value: string } | "">("");
const sendingMessage = ref(false);

// ── Delete State ──
const deleteOpen = ref(false);
const deletingTag = ref<any>(null);
const deleting = ref(false);

// ── Helpers ──
function getTagPreview(tag: any): string {
  if (tag.content) return tag.content.slice(0, 100);
  if (tag.embed_data) {
    try {
      const data = JSON.parse(tag.embed_data);
      return data.title || data.description?.slice(0, 100) || "Embed";
    } catch {
      return "Embed";
    }
  }
  return "No content";
}

function getTagRoles(tag: any): string[] {
  if (!tag.allowed_roles) return [];
  try {
    const parsed = JSON.parse(tag.allowed_roles);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveChannelId(): string {
  const v = sendChannelId.value;
  if (!v) return "";
  if (typeof v === "object" && v !== null && "value" in v) return v.value;
  return String(v);
}

// ── Actions ──
async function fetchTags() {
  loading.value = true;
  try {
    const response = await $fetch<any>("/api/tags/list", {
      params: { guild_id: guildId },
    });
    const all = response.documents || [];
    // Exclude presets — they're managed on the embeds page.
    tags.value = all.filter((t: any) => t.is_template !== true);
  } catch (error) {
    console.error("Error fetching tags:", error);
    toast.add({
      title: "Error",
      description: "Failed to load tags.",
      color: "error",
    });
  } finally {
    loading.value = false;
  }
}

function openEditor(tag: any | null) {
  editingTag.value = tag;
  if (tag) {
    const hasEmbed = !!tag.embed_data;
    const hasContent = !!tag.content;
    form.value = {
      name: tag.name,
      type: hasEmbed && hasContent ? "both" : hasEmbed ? "embed" : "text",
      content: tag.content || "",
      embed: fromEmbedData(tag.embed_data),
      allowedRoles: getTagRoles(tag),
    };
  } else {
    form.value = newTagForm();
  }
  editorOpen.value = true;
}

async function saveTag() {
  saving.value = true;
  try {
    const includeEmbed =
      form.value.type === "embed" || form.value.type === "both";
    const includeText =
      form.value.type === "text" || form.value.type === "both";

    const embedData = includeEmbed
      ? JSON.stringify(toEmbedPayload(form.value.embed))
      : undefined;

    const content = includeText ? form.value.content : undefined;

    if (editingTag.value) {
      await $fetch("/api/tags/update", {
        method: "PUT",
        body: {
          tag_id: editingTag.value.$id,
          guild_id: guildId,
          content: content || "",
          embed_data: embedData || "",
          allowed_roles: form.value.allowedRoles,
        },
      });
      toast.add({
        title: "Tag Updated",
        description: `Tag "${form.value.name}" has been updated.`,
        color: "success",
      });
    } else {
      await $fetch("/api/tags/create", {
        method: "POST",
        body: {
          guild_id: guildId,
          name: form.value.name,
          content,
          embed_data: embedData,
          allowed_roles: form.value.allowedRoles,
        },
      });
      toast.add({
        title: "Tag Created",
        description: `Tag "${form.value.name}" has been created.`,
        color: "success",
      });
    }

    editorOpen.value = false;
    await fetchTags();
  } catch (error: any) {
    console.error("Error saving tag:", error);
    toast.add({
      title: "Error",
      description:
        error?.data?.statusMessage || error?.message || "Failed to save tag.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

function previewTag(tag: any) {
  previewingTag.value = tag;
  previewOpen.value = true;
}

function openSendDialog(tag: any) {
  sendingTag.value = tag;
  sendChannelId.value = "";
  sendOpen.value = true;
  loadChannels();
}

async function sendTagToChannel() {
  if (!sendingTag.value) return;
  const channelId = resolveChannelId();
  if (!channelId) return;

  sendingMessage.value = true;
  try {
    const tag = sendingTag.value;
    let embed: Record<string, any> | undefined;

    if (tag.embed_data) {
      try {
        embed = JSON.parse(tag.embed_data);
      } catch {}
    }

    if (embed) {
      await $fetch("/api/discord/send-embed", {
        method: "POST",
        body: {
          guild_id: guildId,
          channel_id: channelId,
          embed,
          content: tag.content || undefined,
        },
      });
    } else {
      // Text-only: wrap in a minimal embed (until we add a plain-message endpoint).
      await $fetch("/api/discord/send-embed", {
        method: "POST",
        body: {
          guild_id: guildId,
          channel_id: channelId,
          embed: {
            description: tag.content,
            color: 0x5865f2,
          },
        },
      });
    }

    const channelName =
      channels.value.find((c: any) => c.id === channelId)?.name || "channel";
    toast.add({
      title: "Tag Sent!",
      description: `Successfully sent "${tag.name}" to #${channelName}.`,
      color: "success",
    });

    sendOpen.value = false;
  } catch (error: any) {
    console.error("Error sending tag:", error);
    toast.add({
      title: "Failed to Send",
      description:
        error?.data?.statusMessage || error?.message || "Unknown error.",
      color: "error",
    });
  } finally {
    sendingMessage.value = false;
  }
}

function confirmDelete(tag: any) {
  deletingTag.value = tag;
  deleteOpen.value = true;
}

async function deleteTag() {
  if (!deletingTag.value) return;
  deleting.value = true;
  try {
    await $fetch("/api/tags/delete", {
      method: "POST",
      body: {
        tag_id: deletingTag.value.$id,
        guild_id: guildId,
      },
    });
    toast.add({
      title: "Tag Deleted",
      description: `Tag "${deletingTag.value.name}" has been deleted.`,
      color: "success",
    });
    deleteOpen.value = false;
    await fetchTags();
  } catch (error: any) {
    console.error("Error deleting tag:", error);
    toast.add({
      title: "Error",
      description: error?.data?.statusMessage || "Failed to delete tag.",
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
}

// ── Init ──
onMounted(async () => {
  await Promise.all([fetchTags(), loadRoles()]);
});
</script>
