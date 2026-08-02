<template>
  <div class="bg-[#36393f] rounded-lg p-4 shadow-2xl space-y-3">
    <!-- Optional plain-text content rendered above the components -->
    <div
      v-if="content"
      class="discord-md text-sm text-[#dcddde] whitespace-pre-wrap"
      v-html="renderMd(content)"
    />

    <!-- Embed Message Layout -->
    <div v-if="hasAnyEmbedField" class="w-full">
      <!-- Main Embed Wrapper (Container Card vs Direct Root Components V2) -->
      <div
        :class="[
          'flex-1 min-w-0',
          form.useContainer
            ? 'bg-[#2b2d31] rounded-xl border border-white/10 p-4 shadow-xl'
            : 'bg-transparent border-0 p-0 space-y-2',
        ]"
      >
        <!-- Top Accent Bar for Container Mode -->
        <div
          v-if="form.useContainer"
          class="h-1 -mt-4 -mx-4 mb-4 rounded-t-xl"
          :style="{ backgroundColor: form.color || '#5865f2' }"
        />
        <!-- Author -->
        <div
          v-if="form.authorName"
          class="flex items-center gap-2 mb-2"
        >
          <img
            v-if="form.authorIconUrl"
            :src="form.authorIconUrl"
            class="w-6 h-6 rounded-full"
            @error="hideImg"
          />
          <a
            v-if="form.authorUrl"
            :href="form.authorUrl"
            class="text-sm font-semibold text-white hover:underline"
            target="_blank"
            >{{ form.authorName }}</a
          >
          <span v-else class="text-sm font-semibold text-white">{{
            form.authorName
          }}</span>
        </div>

        <!-- Title Header -->
        <div v-if="form.title" class="mb-2">
          <a
            v-if="form.url"
            :href="form.url"
            class="text-base font-bold text-[#00a8fc] hover:underline line-clamp-2"
            target="_blank"
            >{{ form.title }}</a
          >
          <h2
            v-else
            class="text-base font-bold text-white line-clamp-2"
          >
            {{ form.title }}
          </h2>
        </div>

        <!-- Description & Native Separators -->
        <template v-if="descriptionParts.length > 0">
          <div v-for="(part, idx) in descriptionParts" :key="idx">
            <div
              class="discord-md text-sm text-[#dcddde] whitespace-pre-wrap mb-2"
              v-html="renderMd(part)"
            />
            <div
              v-if="idx < descriptionParts.length - 1"
              class="border-t border-white/10 my-3"
            />
          </div>
        </template>

        <!-- Section Separator Divider -->
        <div
          v-if="(form.title || form.description) && (form.fields.length > 0 || form.thumbnailUrl || form.buttonLabel)"
          class="border-t border-white/10 my-3"
        />

        <!-- Fields + Thumbnail Section -->
        <div class="flex gap-3 items-start">
          <div class="flex-1 min-w-0">
            <div
              v-if="form.fields.length > 0"
              class="grid gap-3"
              :class="hasInlineFields ? 'grid-cols-3' : 'grid-cols-1'"
            >
              <div
                v-for="(field, i) in form.fields"
                :key="i"
                :class="field.inline ? 'col-span-1' : 'col-span-3'"
              >
                <div
                  class="discord-md text-sm font-bold text-white mb-0.5"
                  v-html="renderMd(field.name || placeholder)"
                />
                <div
                  class="discord-md text-sm text-[#dcddde] whitespace-pre-wrap"
                  v-html="renderMd(field.value || placeholder)"
                />
              </div>
            </div>
          </div>
          <img
            v-if="form.thumbnailUrl"
            :src="form.thumbnailUrl"
            class="w-20 h-20 rounded object-cover flex-shrink-0 border border-white/10"
            @error="hideImg"
          />
        </div>

        <!-- Interactive Buttons Preview -->
        <div v-if="(form.buttons && form.buttons.length > 0) || form.buttonLabel" class="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center gap-2">
          <template v-if="form.buttons && form.buttons.length > 0">
            <a
              v-for="(btn, idx) in form.buttons"
              :key="idx"
              :href="btn.url || '#'"
              target="_blank"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold rounded transition-colors shadow-sm"
            >
              <span>{{ btn.label || 'Button' }}</span>
              <UIcon v-if="btn.url" name="i-heroicons-arrow-top-right-on-square" class="text-xs" />
            </a>
          </template>
          <template v-else-if="form.buttonLabel">
            <a
              :href="form.buttonUrl || '#'"
              target="_blank"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold rounded transition-colors shadow-sm"
            >
              <span>{{ form.buttonLabel }}</span>
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="text-xs" />
            </a>
          </template>
        </div>

        <!-- Media Gallery Grid Preview -->
        <div
          v-if="activeMediaGallery.length > 0"
          class="mt-3 pt-3 border-t border-white/10"
        >
          <div
            class="grid gap-2 rounded-lg overflow-hidden border border-white/10 p-1 bg-black/20"
            :class="
              activeMediaGallery.length === 1
                ? 'grid-cols-1'
                : activeMediaGallery.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-2 grid-rows-2'
            "
          >
            <img
              v-for="(mediaUrl, idx) in activeMediaGallery"
              :key="idx"
              :src="mediaUrl"
              class="w-full h-36 object-cover rounded"
              @error="hideImg"
            />
          </div>
        </div>

        <!-- Large Image -->
        <img
          v-if="form.imageUrl"
          :src="form.imageUrl"
          class="rounded mt-3 w-full max-h-80 object-cover border border-white/10"
          @error="hideImg"
        />

        <!-- Footer Separator & Footer Text -->
        <div
          v-if="form.footerText || form.showTimestamp"
          class="flex items-center gap-2 mt-3 pt-3 border-t border-white/10 text-xs text-[#949ba4]"
        >
          <img
            v-if="form.footerIconUrl"
            :src="form.footerIconUrl"
            class="w-4 h-4 rounded-full"
            @error="hideImg"
          />
          <span>
            {{ form.footerText }}
            <template v-if="form.footerText && form.showTimestamp">
              •
            </template>
            <template v-if="form.showTimestamp">{{
              new Date().toLocaleDateString()
            }}</template>
          </span>
        </div>
      </div>
    </div>

    <!-- Empty state when there's nothing to preview at all -->
    <div
      v-if="!content && !hasAnyEmbedField"
      class="flex items-center justify-center py-10 text-gray-600"
    >
      <div class="text-center">
        <UIcon name="i-heroicons-eye-slash" class="text-3xl mb-2" />
        <p class="text-xs">Start typing to see V2 layout preview</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { EmbedForm } from "~/utils/embed-form";

const props = defineProps<{
  form: EmbedForm;
  content?: string;
  context?: { channels?: Array<{ id: string; name: string }>; roles?: Array<{ id: string; name: string; color?: string | null }> };
}>();

const placeholder = "​";

const descriptionParts = computed(() => {
  if (!props.form.description || !props.form.description.trim()) return [];
  return props.form.description
    .split(/(?:\r?\n|^)\s*(?:---|[*]{3,})\s*(?:\r?\n|$)/)
    .map((p) => p.trim())
    .filter(Boolean);
});

const renderMd = (s: string) => renderDiscordMarkdown(s, props.context ?? {});

const activeMediaGallery = computed(() => {
  if (!props.form.mediaGallery || !Array.isArray(props.form.mediaGallery)) return [];
  return props.form.mediaGallery.filter((url) => typeof url === "string" && url.trim().length > 0).slice(0, 4);
});

const hasInlineFields = computed(() => props.form.fields.some((f) => f.inline));

const hasAnyEmbedField = computed(
  () =>
    !!(
      props.form.title ||
      props.form.description ||
      props.form.fields.length > 0 ||
      props.form.authorName ||
      props.form.imageUrl ||
      props.form.thumbnailUrl ||
      props.form.footerText ||
      props.form.buttonLabel ||
      props.form.showTimestamp
    ),
);

function hideImg(e: Event) {
  (e.target as HTMLImageElement).style.display = "none";
}
</script>

<style scoped>
.discord-md :deep(.dmd-code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  padding: 0.1em 0.3em;
  background: #2b2d31;
  border-radius: 3px;
  color: #e3e5e8;
}
.discord-md :deep(.dmd-code-block) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  padding: 0.5em 0.75em;
  margin: 0.25em 0;
  background: #2b2d31;
  border: 1px solid #1e1f22;
  border-radius: 4px;
  color: #e3e5e8;
  white-space: pre-wrap;
  overflow-x: auto;
}
.discord-md :deep(.dmd-link) {
  color: #00a8fc;
  text-decoration: none;
}
.discord-md :deep(.dmd-link:hover) {
  text-decoration: underline;
}
.discord-md :deep(.dmd-underline) {
  text-decoration: underline;
}
.discord-md :deep(.dmd-spoiler) {
  background: #202225;
  color: transparent;
  border-radius: 3px;
  padding: 0 2px;
  cursor: pointer;
  transition: color 120ms;
}
.discord-md :deep(.dmd-spoiler:hover) {
  color: #dcddde;
}
.discord-md :deep(.dmd-quote) {
  display: inline-block;
  border-left: 4px solid #4f545c;
  padding-left: 0.5em;
  color: #b9bbbe;
}
.discord-md :deep(.dmd-h1) {
  display: block;
  font-size: 1.25em;
  font-weight: 700;
  color: #fff;
  margin: 0.15em 0;
}
.discord-md :deep(.dmd-h2) {
  display: block;
  font-size: 1.1em;
  font-weight: 700;
  color: #fff;
  margin: 0.15em 0;
}
.discord-md :deep(.dmd-h3) {
  display: block;
  font-size: 1em;
  font-weight: 700;
  color: #fff;
  margin: 0.15em 0;
}
.discord-md :deep(.dmd-mention) {
  background: rgba(88, 101, 242, 0.3);
  color: #c9cdfb;
  padding: 0 2px;
  border-radius: 3px;
  font-weight: 500;
  cursor: default;
}
.discord-md :deep(.dmd-mention.dmd-channel) {
  background: rgba(88, 101, 242, 0.2);
  color: #c9cdfb;
}
.discord-md :deep(.dmd-mention.dmd-role) {
  background: rgba(88, 101, 242, 0.15);
}
.discord-md :deep(.dmd-emoji) {
  display: inline-block;
  padding: 0 2px;
  color: #e3e5e8;
  font-size: 0.9em;
}
.discord-md :deep(.dmd-timestamp) {
  background: #2b2d31;
  color: #e3e5e8;
  padding: 0 4px;
  border-radius: 3px;
  cursor: default;
}
.discord-md :deep(.dmd-quote-block) {
  display: block;
  white-space: pre-wrap;
}
</style>
