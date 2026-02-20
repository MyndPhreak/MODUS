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
    <UModal v-model:open="editorOpen" :ui="{ content: 'sm:max-w-4xl' }">
      <template #content>
        <div class="p-6 space-y-5">
          <div class="flex items-center justify-between">
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
                />
              </div>

              <!-- Embed Fields -->
              <div
                v-if="form.type === 'embed' || form.type === 'both'"
                class="space-y-3"
              >
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5"
                    >Embed Title</label
                  >
                  <UInput
                    v-model="form.embedTitle"
                    placeholder="Embed title..."
                    :maxlength="256"
                    size="lg"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5">
                    Embed Description
                    <span class="text-gray-500 text-xs font-normal"
                      >(Markdown)</span
                    >
                  </label>
                  <UTextarea
                    v-model="form.embedDescription"
                    placeholder="Embed description..."
                    :rows="4"
                    :maxlength="4096"
                    size="lg"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5"
                    >Embed Color</label
                  >
                  <div class="flex items-center gap-3">
                    <input
                      type="color"
                      v-model="form.embedColor"
                      class="w-10 h-10 rounded-lg cursor-pointer border-2 border-white/10 bg-transparent hover:border-primary-500/50 transition-colors"
                    />
                    <UInput
                      v-model="form.embedColor"
                      placeholder="#5865F2"
                      class="flex-1"
                    />
                  </div>
                  <div class="flex gap-1.5 mt-2">
                    <button
                      v-for="(hex, cName) in presetColors"
                      :key="cName"
                      :title="cName"
                      class="w-7 h-7 rounded-md border-2 transition-all hover:scale-110"
                      :class="
                        form.embedColor === hex
                          ? 'border-white scale-110'
                          : 'border-white/20'
                      "
                      :style="{ backgroundColor: hex }"
                      @click="form.embedColor = hex"
                    />
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5"
                    >Image URL</label
                  >
                  <UInput
                    v-model="form.embedImage"
                    placeholder="https://example.com/image.png"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5"
                    >Thumbnail URL</label
                  >
                  <UInput
                    v-model="form.embedThumbnail"
                    placeholder="https://example.com/thumb.png"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5"
                    >Footer Text</label
                  >
                  <UInput
                    v-model="form.embedFooter"
                    placeholder="Optional footer..."
                  />
                </div>
              </div>

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
                />
              </div>
            </div>

            <!-- Right: Preview -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1.5"
                >Preview</label
              >
              <div
                class="rounded-lg border border-white/10 bg-[#36393f] p-4 min-h-[200px]"
              >
                <!-- Text preview -->
                <p
                  v-if="
                    (form.type === 'text' || form.type === 'both') &&
                    form.content
                  "
                  class="text-sm text-[#dcddde] whitespace-pre-wrap mb-3"
                >
                  {{ form.content }}
                </p>
                <!-- Embed preview -->
                <div
                  v-if="
                    (form.type === 'embed' || form.type === 'both') &&
                    (form.embedTitle || form.embedDescription)
                  "
                  class="flex gap-0"
                >
                  <div
                    class="w-1 rounded-l flex-shrink-0"
                    :style="{
                      backgroundColor: form.embedColor || '#5865f2',
                    }"
                  />
                  <div class="bg-[#2f3136] rounded-r p-3 flex-1 min-w-0">
                    <div class="flex gap-3">
                      <div class="flex-1 min-w-0">
                        <div
                          v-if="form.embedTitle"
                          class="text-sm font-bold text-white mb-1"
                        >
                          {{ form.embedTitle }}
                        </div>
                        <p
                          v-if="form.embedDescription"
                          class="text-xs text-[#dcddde] whitespace-pre-wrap"
                        >
                          {{ form.embedDescription }}
                        </p>
                      </div>
                      <img
                        v-if="form.embedThumbnail"
                        :src="form.embedThumbnail"
                        class="w-16 h-16 rounded object-cover flex-shrink-0"
                        @error="
                          (e: Event) =>
                            ((e.target as HTMLImageElement).style.display =
                              'none')
                        "
                      />
                    </div>
                    <img
                      v-if="form.embedImage"
                      :src="form.embedImage"
                      class="rounded mt-2 w-full max-h-48 object-cover"
                      @error="
                        (e: Event) =>
                          ((e.target as HTMLImageElement).style.display =
                            'none')
                      "
                    />
                    <div
                      v-if="form.embedFooter"
                      class="mt-2 pt-2 border-t border-white/5"
                    >
                      <span class="text-[10px] text-[#72767d]">{{
                        form.embedFooter
                      }}</span>
                    </div>
                  </div>
                </div>
                <!-- Empty state -->
                <div
                  v-if="
                    !form.content && !form.embedTitle && !form.embedDescription
                  "
                  class="flex items-center justify-center h-40 text-gray-600"
                >
                  <div class="text-center">
                    <UIcon name="i-heroicons-eye-slash" class="text-3xl mb-2" />
                    <p class="text-xs">Start typing to see preview</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="flex justify-end gap-3 pt-2 border-t border-white/10">
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
          <div
            class="rounded-lg border border-white/10 bg-[#36393f] p-4"
            v-if="previewingTag"
          >
            <p
              v-if="previewingTag.content"
              class="text-sm text-[#dcddde] whitespace-pre-wrap mb-3"
            >
              {{ previewingTag.content }}
            </p>
            <div v-if="previewEmbedData" class="flex gap-0">
              <div
                class="w-1 rounded-l flex-shrink-0"
                :style="{
                  backgroundColor: previewEmbedColor,
                }"
              />
              <div class="bg-[#2f3136] rounded-r p-3 flex-1 min-w-0">
                <div class="flex gap-3">
                  <div class="flex-1 min-w-0">
                    <div
                      v-if="previewEmbedData.title"
                      class="text-sm font-bold text-white mb-1"
                    >
                      {{ previewEmbedData.title }}
                    </div>
                    <p
                      v-if="previewEmbedData.description"
                      class="text-xs text-[#dcddde] whitespace-pre-wrap"
                    >
                      {{ previewEmbedData.description }}
                    </p>
                    <div
                      v-if="previewEmbedData.fields?.length"
                      class="mt-2 grid gap-1"
                      :class="
                        previewEmbedData.fields.some((f: any) => f.inline)
                          ? 'grid-cols-3'
                          : 'grid-cols-1'
                      "
                    >
                      <div
                        v-for="(field, i) in previewEmbedData.fields"
                        :key="i"
                        :class="field.inline ? 'col-span-1' : 'col-span-3'"
                      >
                        <div class="text-xs font-bold text-white">
                          {{ field.name }}
                        </div>
                        <div class="text-xs text-[#dcddde]">
                          {{ field.value }}
                        </div>
                      </div>
                    </div>
                  </div>
                  <img
                    v-if="previewEmbedData.thumbnail?.url"
                    :src="previewEmbedData.thumbnail.url"
                    class="w-16 h-16 rounded object-cover flex-shrink-0"
                    @error="
                      (e: Event) =>
                        ((e.target as HTMLImageElement).style.display = 'none')
                    "
                  />
                </div>
                <img
                  v-if="previewEmbedData.image?.url"
                  :src="previewEmbedData.image.url"
                  class="rounded mt-2 w-full max-h-48 object-cover"
                  @error="
                    (e: Event) =>
                      ((e.target as HTMLImageElement).style.display = 'none')
                  "
                />
                <div
                  v-if="previewEmbedData.footer?.text"
                  class="mt-2 pt-2 border-t border-white/5"
                >
                  <span class="text-[10px] text-[#72767d]">{{
                    previewEmbedData.footer.text
                  }}</span>
                </div>
              </div>
            </div>
          </div>
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

const route = useRoute();
const guildId = route.params.guild_id as string;
const { state, loadChannels, loadRoles, channelOptions, roleOptions } =
  useServerSettings(guildId);
const toast = useToast();

const channels = computed(() => state.value.channels);
const channelsLoading = computed(() => state.value.channelsLoading);

// ── Data ──
const tags = ref<any[]>([]);
const loading = ref(true);

const presetColors: Record<string, string> = {
  Blurple: "#5865f2",
  Green: "#57f287",
  Yellow: "#fee75c",
  Red: "#ed4245",
  Fuchsia: "#eb459e",
  Orange: "#e67e22",
  Blue: "#3498db",
  Purple: "#9b59b6",
};

// ── Editor State ──
const editorOpen = ref(false);
const editingTag = ref<any>(null);
const saving = ref(false);

const form = ref({
  name: "",
  type: "text" as "text" | "embed" | "both",
  content: "",
  embedTitle: "",
  embedDescription: "",
  embedColor: "#5865f2",
  embedImage: "",
  embedThumbnail: "",
  embedFooter: "",
  allowedRoles: [] as string[],
});

const isFormValid = computed(() => {
  if (!form.value.name.trim()) return false;
  if (form.value.type === "text" || form.value.type === "both") {
    if (!form.value.content.trim() && form.value.type === "text") return false;
  }
  if (form.value.type === "embed" || form.value.type === "both") {
    if (
      !form.value.embedTitle.trim() &&
      !form.value.embedDescription.trim() &&
      form.value.type === "embed"
    )
      return false;
  }
  // At least one content type must have data
  const hasText = form.value.content.trim().length > 0;
  const hasEmbed =
    form.value.embedTitle.trim().length > 0 ||
    form.value.embedDescription.trim().length > 0;
  return hasText || hasEmbed;
});

// ── Preview State ──
const previewOpen = ref(false);
const previewingTag = ref<any>(null);

const previewEmbedData = computed(() => {
  if (!previewingTag.value?.embed_data) return null;
  try {
    return JSON.parse(previewingTag.value.embed_data);
  } catch {
    return null;
  }
});

const previewEmbedColor = computed(() => {
  if (!previewEmbedData.value?.color) return "#5865f2";
  return `#${previewEmbedData.value.color.toString(16).padStart(6, "0")}`;
});

// ── Send State ──
const sendOpen = ref(false);
const sendingTag = ref<any>(null);
const sendChannelId = ref("");
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
    return JSON.parse(tag.allowed_roles);
  } catch {
    return [];
  }
}

// ── Actions ──
async function fetchTags() {
  loading.value = true;
  try {
    const response = await $fetch<any>("/api/tags/list", {
      params: { guild_id: guildId },
    });
    tags.value = response.documents || [];
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
    let embedData: any = {};
    if (hasEmbed) {
      try {
        embedData = JSON.parse(tag.embed_data);
      } catch {}
    }

    form.value = {
      name: tag.name,
      type: hasEmbed && hasContent ? "both" : hasEmbed ? "embed" : "text",
      content: tag.content || "",
      embedTitle: embedData.title || "",
      embedDescription: embedData.description || "",
      embedColor: embedData.color
        ? `#${embedData.color.toString(16).padStart(6, "0")}`
        : "#5865f2",
      embedImage: embedData.image?.url || "",
      embedThumbnail: embedData.thumbnail?.url || "",
      embedFooter: embedData.footer?.text || "",
      allowedRoles: getTagRoles(tag),
    };
  } else {
    form.value = {
      name: "",
      type: "text",
      content: "",
      embedTitle: "",
      embedDescription: "",
      embedColor: "#5865f2",
      embedImage: "",
      embedThumbnail: "",
      embedFooter: "",
      allowedRoles: [],
    };
  }
  editorOpen.value = true;
}

async function saveTag() {
  saving.value = true;
  try {
    // Build embed data if applicable
    let embedData: string | undefined;
    if (form.value.type === "embed" || form.value.type === "both") {
      const embed: Record<string, any> = {};
      if (form.value.embedTitle) embed.title = form.value.embedTitle;
      if (form.value.embedDescription)
        embed.description = form.value.embedDescription;
      const colorInt = parseInt(form.value.embedColor.replace("#", ""), 16);
      embed.color = isNaN(colorInt) ? 0x5865f2 : colorInt;
      if (form.value.embedImage) embed.image = { url: form.value.embedImage };
      if (form.value.embedThumbnail)
        embed.thumbnail = { url: form.value.embedThumbnail };
      if (form.value.embedFooter)
        embed.footer = { text: form.value.embedFooter };
      embedData = JSON.stringify(embed);
    }

    const content =
      form.value.type === "text" || form.value.type === "both"
        ? form.value.content
        : undefined;

    if (editingTag.value) {
      // Update
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
      // Create
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
  if (!sendingTag.value || !sendChannelId.value) return;
  sendingMessage.value = true;
  try {
    const tag = sendingTag.value;
    let embed: Record<string, any> | undefined;

    if (tag.embed_data) {
      try {
        embed = JSON.parse(tag.embed_data);
      } catch {}
    }

    // If it's an embed tag, use the send-embed endpoint
    if (embed) {
      await $fetch("/api/discord/send-embed", {
        method: "POST",
        body: {
          guild_id: guildId,
          channel_id: sendChannelId.value,
          embed,
          content: tag.content || undefined,
        },
      });
    } else {
      // Text-only — we'll need to use the Discord API for plain text
      // Reuse the send-embed endpoint but with a minimal embed or
      // create a simple message via the embed API with description only
      await $fetch("/api/discord/send-embed", {
        method: "POST",
        body: {
          guild_id: guildId,
          channel_id: sendChannelId.value,
          embed: {
            description: tag.content,
            color: 0x5865f2,
          },
        },
      });
    }

    const channelName =
      channels.value.find((c: any) => c.id === sendChannelId.value)?.name ||
      "channel";
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
