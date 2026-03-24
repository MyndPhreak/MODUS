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
          Build and send rich embed messages, or save them as reusable tags
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="outline"
          color="neutral"
          icon="i-heroicons-tag"
          @click="saveAsTag"
          :disabled="
            !embedForm.title &&
            !embedForm.description &&
            embedForm.fields.length === 0
          "
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
              v-model="embedForm.channelId"
              :items="channelOptions"
              value-key="value"
              placeholder="Select a channel..."
              icon="i-heroicons-hashtag"
              size="lg"
            />
          </div>
        </div>

        <!-- Content Section -->
        <details class="group" open>
          <summary
            class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
          >
            <div
              class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"
            />
            <div class="relative flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div
                  class="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20"
                >
                  <UIcon
                    name="i-heroicons-document-text"
                    class="text-blue-400 text-sm"
                  />
                </div>
                <h3 class="text-sm font-semibold text-white">Content</h3>
                <UBadge
                  v-if="embedForm.title || embedForm.description"
                  color="success"
                  variant="subtle"
                  size="xs"
                >
                  ✓
                </UBadge>
              </div>
              <UIcon
                name="i-heroicons-chevron-down"
                class="text-gray-400 transition-transform group-open:rotate-180"
              />
            </div>
          </summary>
          <div
            class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 space-y-3 -mt-1"
          >
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1.5"
                >Title</label
              >
              <UInput
                v-model="embedForm.title"
                placeholder="Enter a catchy title..."
                :maxlength="256"
                size="lg"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1.5">
                URL
                <span class="text-gray-500 text-xs font-normal"
                  >(makes title clickable)</span
                >
              </label>
              <UInput
                v-model="embedForm.url"
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1.5">
                Description
                <span class="text-gray-500 text-xs font-normal"
                  >(Markdown supported)</span
                >
              </label>
              <UTextarea
                v-model="embedForm.description"
                placeholder="Enter your message..."
                :rows="4"
                :maxlength="4096"
                size="lg"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1.5"
                >Color</label
              >
              <div class="flex items-center gap-3">
                <input
                  type="color"
                  v-model="embedColorHex"
                  class="w-10 h-10 rounded-lg cursor-pointer border-2 border-white/10 bg-transparent hover:border-primary-500/50 transition-colors"
                />
                <UInput
                  v-model="embedColorHex"
                  placeholder="#5865F2"
                  class="flex-1"
                />
              </div>
              <div class="flex gap-1.5 mt-2">
                <button
                  v-for="(hex, name) in presetColors"
                  :key="name"
                  :title="name"
                  class="group/color relative w-8 h-8 rounded-md border-2 transition-all hover:scale-110"
                  :class="
                    embedColorHex === hex
                      ? 'border-white scale-110'
                      : 'border-white/20'
                  "
                  :style="{ backgroundColor: hex }"
                  @click="embedColorHex = hex"
                >
                  <span
                    class="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover/color:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
                  >
                    {{ name }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </details>

        <!-- Author Section -->
        <details class="group">
          <summary
            class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
          >
            <div
              class="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none"
            />
            <div class="relative flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div
                  class="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20"
                >
                  <UIcon
                    name="i-heroicons-user"
                    class="text-purple-400 text-sm"
                  />
                </div>
                <h3 class="text-sm font-semibold text-white">Author</h3>
                <UBadge
                  v-if="embedForm.authorName"
                  color="success"
                  variant="subtle"
                  size="xs"
                >
                  ✓
                </UBadge>
              </div>
              <UIcon
                name="i-heroicons-chevron-down"
                class="text-gray-400 transition-transform group-open:rotate-180"
              />
            </div>
          </summary>
          <div
            class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 space-y-3 -mt-1"
          >
            <UInput v-model="embedForm.authorName" placeholder="Author name" />
            <UInput
              v-model="embedForm.authorUrl"
              placeholder="Author URL (optional)"
            />
            <UInput
              v-model="embedForm.authorIconUrl"
              placeholder="Author icon URL (optional)"
            />
          </div>
        </details>

        <!-- Fields Section -->
        <details class="group">
          <summary
            class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
          >
            <div
              class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"
            />
            <div class="relative flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div
                  class="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                >
                  <UIcon
                    name="i-heroicons-list-bullet"
                    class="text-emerald-400 text-sm"
                  />
                </div>
                <h3 class="text-sm font-semibold text-white">Fields</h3>
                <UBadge
                  :color="embedForm.fields.length >= 25 ? 'error' : 'neutral'"
                  variant="soft"
                  size="xs"
                >
                  {{ embedForm.fields.length }}/25
                </UBadge>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  icon="i-heroicons-plus"
                  size="xs"
                  :disabled="embedForm.fields.length >= 25"
                  @click.stop="addField"
                >
                  Add
                </UButton>
                <UIcon
                  name="i-heroicons-chevron-down"
                  class="text-gray-400 transition-transform group-open:rotate-180"
                />
              </div>
            </div>
          </summary>
          <div
            class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 -mt-1"
          >
            <div v-if="embedForm.fields.length === 0" class="py-4 text-center">
              <UIcon
                name="i-heroicons-inbox"
                class="text-3xl text-gray-600 mb-1"
              />
              <p class="text-xs text-gray-500">
                No fields yet. Click "Add" to create one.
              </p>
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="(field, index) in embedForm.fields"
                :key="index"
                class="relative group/field p-3 rounded-lg bg-gray-800/50 border border-white/5 hover:border-white/10 transition-colors"
              >
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-medium text-gray-400"
                    >Field {{ index + 1 }}</span
                  >
                  <UButton
                    icon="i-heroicons-trash"
                    size="xs"
                    color="error"
                    variant="ghost"
                    @click="removeField(index)"
                  />
                </div>
                <div class="space-y-2">
                  <UInput v-model="field.name" placeholder="Field name" />
                  <UTextarea
                    v-model="field.value"
                    placeholder="Field value"
                    :rows="2"
                  />
                  <div class="flex items-center gap-2 pt-1">
                    <USwitch v-model="field.inline" size="sm" />
                    <span class="text-xs text-gray-400">Inline</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </details>

        <!-- Images Section -->
        <details class="group">
          <summary
            class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
          >
            <div
              class="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent pointer-events-none"
            />
            <div class="relative flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div
                  class="p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20"
                >
                  <UIcon
                    name="i-heroicons-photo"
                    class="text-pink-400 text-sm"
                  />
                </div>
                <h3 class="text-sm font-semibold text-white">Images</h3>
                <UBadge
                  v-if="embedForm.imageUrl || embedForm.thumbnailUrl"
                  color="success"
                  variant="subtle"
                  size="xs"
                >
                  ✓
                </UBadge>
              </div>
              <UIcon
                name="i-heroicons-chevron-down"
                class="text-gray-400 transition-transform group-open:rotate-180"
              />
            </div>
          </summary>
          <div
            class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 space-y-3 -mt-1"
          >
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1.5">
                Large Image
                <span class="text-gray-500 text-xs font-normal"
                  >(full width)</span
                >
              </label>
              <UInput
                v-model="embedForm.imageUrl"
                placeholder="https://example.com/image.png"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1.5">
                Thumbnail
                <span class="text-gray-500 text-xs font-normal"
                  >(small, top-right)</span
                >
              </label>
              <UInput
                v-model="embedForm.thumbnailUrl"
                placeholder="https://example.com/thumb.png"
              />
            </div>
          </div>
        </details>

        <!-- Footer Section -->
        <details class="group">
          <summary
            class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
          >
            <div
              class="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none"
            />
            <div class="relative flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div
                  class="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20"
                >
                  <UIcon
                    name="i-heroicons-chat-bubble-bottom-center-text"
                    class="text-orange-400 text-sm"
                  />
                </div>
                <h3 class="text-sm font-semibold text-white">Footer</h3>
                <UBadge
                  v-if="embedForm.footerText"
                  color="success"
                  variant="subtle"
                  size="xs"
                >
                  ✓
                </UBadge>
              </div>
              <UIcon
                name="i-heroicons-chevron-down"
                class="text-gray-400 transition-transform group-open:rotate-180"
              />
            </div>
          </summary>
          <div
            class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 space-y-3 -mt-1"
          >
            <UInput v-model="embedForm.footerText" placeholder="Footer text" />
            <UInput
              v-model="embedForm.footerIconUrl"
              placeholder="Footer icon URL (optional)"
            />
            <div class="flex items-center gap-2">
              <USwitch v-model="embedForm.showTimestamp" />
              <span class="text-sm text-gray-400">Show timestamp</span>
            </div>
          </div>
        </details>

        <!-- Action Buttons -->
        <div class="flex items-center justify-between gap-3 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            @click="resetEmbedForm"
            icon="i-heroicons-arrow-path"
          >
            Reset
          </UButton>
          <UButton
            color="primary"
            size="lg"
            icon="i-heroicons-paper-airplane"
            :loading="sendingEmbed"
            :disabled="
              !embedForm.channelId ||
              (!embedForm.title &&
                !embedForm.description &&
                embedForm.fields.length === 0)
            "
            @click="sendEmbed"
            class="flex-1 max-w-xs"
          >
            Send Embed
          </UButton>
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

            <!-- Discord Preview Container -->
            <div class="bg-[#36393f] rounded-lg p-4 shadow-2xl">
              <div class="flex gap-0">
                <div
                  class="w-1 rounded-l flex-shrink-0"
                  :style="{
                    backgroundColor: embedColorHex || '#5865f2',
                  }"
                />
                <div class="bg-[#2f3136] rounded-r p-4 flex-1 min-w-0">
                  <!-- Author -->
                  <div
                    v-if="embedForm.authorName"
                    class="flex items-center gap-2 mb-2"
                  >
                    <img
                      v-if="embedForm.authorIconUrl"
                      :src="embedForm.authorIconUrl"
                      class="w-6 h-6 rounded-full"
                      @error="
                        (e: Event) =>
                          ((e.target as HTMLImageElement).style.display =
                            'none')
                      "
                    />
                    <a
                      v-if="embedForm.authorUrl"
                      :href="embedForm.authorUrl"
                      class="text-sm font-semibold text-white hover:underline"
                      target="_blank"
                      >{{ embedForm.authorName }}</a
                    >
                    <span v-else class="text-sm font-semibold text-white">{{
                      embedForm.authorName
                    }}</span>
                  </div>

                  <!-- Title -->
                  <div v-if="embedForm.title" class="mb-2">
                    <a
                      v-if="embedForm.url"
                      :href="embedForm.url"
                      class="text-base font-bold text-[#00a8fc] hover:underline line-clamp-2"
                      target="_blank"
                      >{{ embedForm.title }}</a
                    >
                    <span
                      v-else
                      class="text-base font-bold text-white line-clamp-2"
                      >{{ embedForm.title }}</span
                    >
                  </div>

                  <!-- Description -->
                  <p
                    v-if="embedForm.description"
                    class="text-sm text-[#dcddde] whitespace-pre-wrap mb-3 line-clamp-6"
                  >
                    {{ embedForm.description }}
                  </p>

                  <!-- Fields Container -->
                  <div class="flex gap-3">
                    <div class="flex-1 min-w-0">
                      <div
                        v-if="embedForm.fields.length > 0"
                        class="grid gap-3 mt-2"
                        :class="hasInlineFields ? 'grid-cols-3' : 'grid-cols-1'"
                      >
                        <div
                          v-for="(field, i) in embedForm.fields"
                          :key="i"
                          :class="field.inline ? 'col-span-1' : 'col-span-3'"
                        >
                          <div class="text-sm font-bold text-white mb-0.5">
                            {{ field.name || "\u200b" }}
                          </div>
                          <div
                            class="text-sm text-[#dcddde] whitespace-pre-wrap"
                          >
                            {{ field.value || "\u200b" }}
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- Thumbnail -->
                    <img
                      v-if="embedForm.thumbnailUrl"
                      :src="embedForm.thumbnailUrl"
                      class="w-20 h-20 rounded object-cover flex-shrink-0"
                      @error="
                        (e: Event) =>
                          ((e.target as HTMLImageElement).style.display =
                            'none')
                      "
                    />
                  </div>

                  <!-- Large Image -->
                  <img
                    v-if="embedForm.imageUrl"
                    :src="embedForm.imageUrl"
                    class="rounded mt-4 w-full max-h-80 object-cover"
                    @error="
                      (e: Event) =>
                        ((e.target as HTMLImageElement).style.display = 'none')
                    "
                  />

                  <!-- Footer -->
                  <div
                    v-if="embedForm.footerText || embedForm.showTimestamp"
                    class="flex items-center gap-2 mt-3 pt-3 border-t border-white/5"
                  >
                    <img
                      v-if="embedForm.footerIconUrl"
                      :src="embedForm.footerIconUrl"
                      class="w-5 h-5 rounded-full"
                      @error="
                        (e: Event) =>
                          ((e.target as HTMLImageElement).style.display =
                            'none')
                      "
                    />
                    <span class="text-xs text-[#72767d]">
                      {{ embedForm.footerText }}
                      <template
                        v-if="embedForm.footerText && embedForm.showTimestamp"
                      >
                        •
                      </template>
                      <template v-if="embedForm.showTimestamp">{{
                        new Date().toLocaleDateString()
                      }}</template>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div
              v-if="
                !embedForm.title &&
                !embedForm.description &&
                embedForm.fields.length === 0
              "
              class="absolute inset-0 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm rounded-lg pointer-events-none"
            >
              <div class="text-center">
                <UIcon
                  name="i-heroicons-document-text"
                  class="text-4xl text-gray-600 mb-2"
                />
                <p class="text-xs text-gray-500">Start typing to see preview</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Save As Tag Modal ═══ -->
    <UModal v-model:open="saveTagOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-white">Save as Tag</h3>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="saveTagOpen = false"
            />
          </div>
          <p class="text-sm text-gray-400">
            Save this embed as a reusable tag that can be posted with
            <code class="text-primary-400">/tag name</code>
          </p>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1.5"
              >Tag Name</label
            >
            <UInput
              v-model="saveTagName"
              placeholder="e.g. welcome-rules"
              size="lg"
            />
            <p class="text-xs text-gray-500 mt-1">
              Lowercase, hyphens only. Will be used as
              <code class="text-primary-400"
                >/tag {{ saveTagName || "name" }}</code
              >
            </p>
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              @click="saveTagOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              icon="i-heroicons-tag"
              :loading="savingTag"
              :disabled="!saveTagName.trim()"
              @click="confirmSaveAsTag"
            >
              Save Tag
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
const { state, loadChannels, channelOptions } = useServerSettings(guildId);
const toast = useToast();

const channels = computed(() => state.value.channels);
const channelsLoading = computed(() => state.value.channelsLoading);

const sendingEmbed = ref(false);
const embedColorHex = ref("#5865f2");

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

const embedForm = ref({
  channelId: "",
  title: "",
  url: "",
  description: "",
  authorName: "",
  authorUrl: "",
  authorIconUrl: "",
  fields: [] as Array<{ name: string; value: string; inline: boolean }>,
  imageUrl: "",
  thumbnailUrl: "",
  footerText: "",
  footerIconUrl: "",
  showTimestamp: false,
});

const hasInlineFields = computed(() =>
  embedForm.value.fields.some((f) => f.inline),
);

const addField = () => {
  if (embedForm.value.fields.length >= 25) return;
  embedForm.value.fields.push({ name: "", value: "", inline: false });
};

const removeField = (index: number) => {
  embedForm.value.fields.splice(index, 1);
};

const resetEmbedForm = () => {
  embedForm.value = {
    channelId: embedForm.value.channelId,
    title: "",
    url: "",
    description: "",
    authorName: "",
    authorUrl: "",
    authorIconUrl: "",
    fields: [],
    imageUrl: "",
    thumbnailUrl: "",
    footerText: "",
    footerIconUrl: "",
    showTimestamp: false,
  };
  embedColorHex.value = "#5865f2";
};

const sendEmbed = async () => {
  const form = embedForm.value;
  if (!form.channelId) {
    toast.add({
      title: "Error",
      description: "Please select a channel.",
      color: "error",
    });
    return;
  }
  if (!form.title && !form.description && form.fields.length === 0) {
    toast.add({
      title: "Error",
      description: "Embed must have at least a title, description, or fields.",
      color: "error",
    });
    return;
  }

  sendingEmbed.value = true;
  try {
    const selectedChannelId =
      typeof form.channelId === "object" && form.channelId !== null
        ? (form.channelId as any).value
        : form.channelId;

    if (!selectedChannelId) {
      toast.add({
        title: "Error",
        description: "Please select a channel.",
        color: "error",
      });
      sendingEmbed.value = false;
      return;
    }

    const embed: Record<string, any> = {};
    if (form.title) embed.title = form.title;
    if (form.description) embed.description = form.description;
    if (form.url) embed.url = form.url;

    const colorInt = parseInt(embedColorHex.value.replace("#", ""), 16);
    embed.color = isNaN(colorInt) ? 0x5865f2 : colorInt;

    if (form.authorName) {
      embed.author = { name: form.authorName };
      if (form.authorUrl) embed.author.url = form.authorUrl;
      if (form.authorIconUrl) embed.author.icon_url = form.authorIconUrl;
    }

    if (form.fields.length > 0) {
      embed.fields = form.fields.map((f) => ({
        name: f.name || "\u200b",
        value: f.value || "\u200b",
        inline: f.inline,
      }));
    }

    if (form.imageUrl) embed.image = { url: form.imageUrl };
    if (form.thumbnailUrl) embed.thumbnail = { url: form.thumbnailUrl };

    if (form.footerText) {
      embed.footer = { text: form.footerText };
      if (form.footerIconUrl) embed.footer.icon_url = form.footerIconUrl;
    }

    if (form.showTimestamp) embed.timestamp = true;

    await $fetch("/api/discord/send-embed", {
      method: "POST",
      body: {
        guild_id: guildId,
        channel_id: selectedChannelId,
        embed,
      },
    });

    const channelName =
      channels.value.find((c: any) => c.id === selectedChannelId)?.name ||
      "channel";
    toast.add({
      title: "Embed Sent!",
      description: `Successfully sent to #${channelName}.`,
      color: "success",
    });

    resetEmbedForm();
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
};

// ── Save as Tag ──
const saveTagOpen = ref(false);
const saveTagName = ref("");
const savingTag = ref(false);

function saveAsTag() {
  saveTagName.value = "";
  saveTagOpen.value = true;
}

async function confirmSaveAsTag() {
  savingTag.value = true;
  try {
    const form = embedForm.value;
    const embed: Record<string, any> = {};

    if (form.title) embed.title = form.title;
    if (form.description) embed.description = form.description;
    if (form.url) embed.url = form.url;

    const colorInt = parseInt(embedColorHex.value.replace("#", ""), 16);
    embed.color = isNaN(colorInt) ? 0x5865f2 : colorInt;

    if (form.authorName) {
      embed.author = { name: form.authorName };
      if (form.authorUrl) embed.author.url = form.authorUrl;
      if (form.authorIconUrl) embed.author.icon_url = form.authorIconUrl;
    }

    if (form.fields.length > 0) {
      embed.fields = form.fields.map((f) => ({
        name: f.name || "\u200b",
        value: f.value || "\u200b",
        inline: f.inline,
      }));
    }

    if (form.imageUrl) embed.image = { url: form.imageUrl };
    if (form.thumbnailUrl) embed.thumbnail = { url: form.thumbnailUrl };

    if (form.footerText) {
      embed.footer = { text: form.footerText };
      if (form.footerIconUrl) embed.footer.icon_url = form.footerIconUrl;
    }

    await $fetch("/api/tags/create", {
      method: "POST",
      body: {
        guild_id: guildId,
        name: saveTagName.value,
        embed_data: embed,
      },
    });

    toast.add({
      title: "Tag Saved!",
      description: `Embed saved as tag "${saveTagName.value}". Use /tag ${saveTagName.value} to post it.`,
      color: "success",
    });

    saveTagOpen.value = false;
  } catch (error: any) {
    console.error("Error saving tag:", error);
    toast.add({
      title: "Error",
      description:
        error?.data?.statusMessage || error?.message || "Failed to save tag.",
      color: "error",
    });
  } finally {
    savingTag.value = false;
  }
}

onMounted(() => {
  loadChannels();
});
</script>
