<template>
  <div class="p-6 lg:p-8 space-y-6">
    <div class="mb-8">
      <h2
        class="text-2xl font-bold mb-2 bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent"
      >
        Embed Builder
      </h2>
      <p class="text-sm text-gray-400">
        Create and send stunning rich embed messages to any channel
      </p>
    </div>

    <!-- Split Layout: Form + Preview -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Left Column: Form -->
      <div class="space-y-5">
        <!-- Channel Selector -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent pointer-events-none"
          />
          <div class="relative">
            <div class="flex items-center gap-2 mb-4">
              <div
                class="p-2 rounded-lg bg-primary-500/10 border border-primary-500/20"
              >
                <UIcon
                  name="i-heroicons-hashtag"
                  class="text-primary-400 text-lg"
                />
              </div>
              <h3 class="font-semibold text-white">Target Channel</h3>
            </div>
            <div
              v-if="channelsLoading"
              class="flex items-center gap-3 py-3 text-gray-400"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="animate-spin text-primary-400"
              />
              <span class="text-sm">Loading channels...</span>
            </div>
            <div v-else-if="channels.length === 0" class="py-3">
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

        <!-- Main Content -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"
          />
          <div class="relative">
            <div class="flex items-center gap-2 mb-4">
              <div
                class="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20"
              >
                <UIcon
                  name="i-heroicons-document-text"
                  class="text-blue-400 text-lg"
                />
              </div>
              <h3 class="font-semibold text-white">Content</h3>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2"
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
                <label class="block text-sm font-medium text-gray-300 mb-2">
                  URL
                  <span class="text-gray-500 text-xs font-normal"
                    >(makes title clickable)</span
                  >
                </label>
                <UInput
                  v-model="embedForm.url"
                  placeholder="https://example.com"
                  size="lg"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">
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
                <label class="block text-sm font-medium text-gray-300 mb-2"
                  >Color</label
                >
                <div class="flex items-center gap-3">
                  <input
                    type="color"
                    v-model="embedColorHex"
                    class="w-12 h-12 rounded-xl cursor-pointer border-2 border-white/10 bg-transparent hover:border-primary-500/50 transition-colors"
                  />
                  <UInput
                    v-model="embedColorHex"
                    placeholder="#5865F2"
                    class="flex-1"
                    size="lg"
                  />
                </div>
                <div class="flex gap-2 mt-3">
                  <button
                    v-for="(hex, name) in presetColors"
                    :key="name"
                    :title="name"
                    class="group relative w-10 h-10 rounded-lg border-2 transition-all hover:scale-110 hover:shadow-lg"
                    :class="
                      embedColorHex === hex
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-white/20'
                    "
                    :style="{ backgroundColor: hex }"
                    @click="embedColorHex = hex"
                  >
                    <span
                      class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
                    >
                      {{ name }}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Author Section -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none"
          />
          <div class="relative">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <div
                  class="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20"
                >
                  <UIcon
                    name="i-heroicons-user"
                    class="text-purple-400 text-lg"
                  />
                </div>
                <h3 class="font-semibold text-white">Author</h3>
              </div>
              <USwitch v-model="embedForm.showAuthor" />
            </div>
            <div v-if="embedForm.showAuthor" class="space-y-3">
              <UInput
                v-model="embedForm.authorName"
                placeholder="Author name"
                size="lg"
              />
              <UInput
                v-model="embedForm.authorUrl"
                placeholder="Author URL (optional)"
                size="lg"
              />
              <UInput
                v-model="embedForm.authorIconUrl"
                placeholder="Author icon URL (optional)"
                size="lg"
              />
            </div>
            <p v-else class="text-sm text-gray-500">
              Toggle to add an author section
            </p>
          </div>
        </div>

        <!-- Fields Section -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"
          />
          <div class="relative">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <div
                  class="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                >
                  <UIcon
                    name="i-heroicons-list-bullet"
                    class="text-emerald-400 text-lg"
                  />
                </div>
                <h3 class="font-semibold text-white">Fields</h3>
                <UBadge
                  :color="embedForm.fields.length >= 25 ? 'error' : 'neutral'"
                  variant="soft"
                >
                  {{ embedForm.fields.length }}/25
                </UBadge>
              </div>
              <UButton
                icon="i-heroicons-plus"
                size="sm"
                :disabled="embedForm.fields.length >= 25"
                @click="addField"
              >
                Add
              </UButton>
            </div>
            <div v-if="embedForm.fields.length === 0" class="py-6 text-center">
              <UIcon
                name="i-heroicons-inbox"
                class="text-4xl text-gray-600 mb-2"
              />
              <p class="text-sm text-gray-500">
                No fields yet. Click "Add" to create one.
              </p>
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="(field, index) in embedForm.fields"
                :key="index"
                class="relative group p-4 rounded-lg bg-gray-800/50 border border-white/5 hover:border-white/10 transition-colors"
              >
                <div class="flex items-center justify-between mb-3">
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
                    <span class="text-xs text-gray-400">Display inline</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Images Section -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent pointer-events-none"
          />
          <div class="relative">
            <div class="flex items-center gap-2 mb-4">
              <div
                class="p-2 rounded-lg bg-pink-500/10 border border-pink-500/20"
              >
                <UIcon name="i-heroicons-photo" class="text-pink-400 text-lg" />
              </div>
              <h3 class="font-semibold text-white">Images</h3>
            </div>
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">
                  Large Image
                  <span class="text-gray-500 text-xs font-normal"
                    >(full width)</span
                  >
                </label>
                <UInput
                  v-model="embedForm.imageUrl"
                  placeholder="https://example.com/image.png"
                  size="lg"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">
                  Thumbnail
                  <span class="text-gray-500 text-xs font-normal"
                    >(small, top-right)</span
                  >
                </label>
                <UInput
                  v-model="embedForm.thumbnailUrl"
                  placeholder="https://example.com/thumb.png"
                  size="lg"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Section -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none"
          />
          <div class="relative">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <div
                  class="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20"
                >
                  <UIcon
                    name="i-heroicons-chat-bubble-bottom-center-text"
                    class="text-orange-400 text-lg"
                  />
                </div>
                <h3 class="font-semibold text-white">Footer</h3>
              </div>
              <USwitch v-model="embedForm.showFooter" />
            </div>
            <div v-if="embedForm.showFooter" class="space-y-3">
              <UInput
                v-model="embedForm.footerText"
                placeholder="Footer text"
                size="lg"
              />
              <UInput
                v-model="embedForm.footerIconUrl"
                placeholder="Footer icon URL (optional)"
                size="lg"
              />
              <div class="flex items-center gap-2">
                <USwitch v-model="embedForm.showTimestamp" />
                <span class="text-sm text-gray-400">Show timestamp</span>
              </div>
            </div>
            <p v-else class="text-sm text-gray-500">Toggle to add a footer</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center justify-between gap-4 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            @click="resetEmbedForm"
            icon="i-heroicons-arrow-path"
            size="lg"
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
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
          />
          <div class="relative">
            <div class="flex items-center gap-2 mb-4">
              <div
                class="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
              >
                <UIcon name="i-heroicons-eye" class="text-indigo-400 text-lg" />
              </div>
              <h3 class="font-semibold text-white">Live Preview</h3>
              <UBadge variant="soft" color="success" class="ml-auto">
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
                    v-if="embedForm.showAuthor && embedForm.authorName"
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
                    v-if="
                      embedForm.showFooter &&
                      (embedForm.footerText || embedForm.showTimestamp)
                    "
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
                  class="text-5xl text-gray-600 mb-2"
                />
                <p class="text-sm text-gray-500">Start typing to see preview</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  showAuthor: false,
  authorName: "",
  authorUrl: "",
  authorIconUrl: "",
  fields: [] as Array<{ name: string; value: string; inline: boolean }>,
  imageUrl: "",
  thumbnailUrl: "",
  showFooter: false,
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
    showAuthor: false,
    authorName: "",
    authorUrl: "",
    authorIconUrl: "",
    fields: [],
    imageUrl: "",
    thumbnailUrl: "",
    showFooter: false,
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

    if (form.showAuthor && form.authorName) {
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

    if (form.showFooter && form.footerText) {
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

onMounted(() => {
  loadChannels();
});
</script>
