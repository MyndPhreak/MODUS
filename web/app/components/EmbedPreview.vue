<template>
  <div class="bg-[#36393f] rounded-lg p-4 shadow-2xl">
    <!-- Optional plain-text content (the /tag "content" field) rendered above the embed. -->
    <div
      v-if="content"
      class="discord-md text-sm text-[#dcddde] whitespace-pre-wrap mb-3"
      v-html="renderMd(content)"
    />

    <div v-if="hasAnyEmbedField" class="flex gap-0">
      <div
        class="w-1 rounded-l flex-shrink-0"
        :style="{ backgroundColor: form.color || '#5865f2' }"
      />
      <div class="bg-[#2f3136] rounded-r p-4 flex-1 min-w-0">
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

        <!-- Title -->
        <div v-if="form.title" class="mb-2">
          <a
            v-if="form.url"
            :href="form.url"
            class="text-base font-bold text-[#00a8fc] hover:underline line-clamp-2"
            target="_blank"
            >{{ form.title }}</a
          >
          <span
            v-else
            class="text-base font-bold text-white line-clamp-2"
            >{{ form.title }}</span
          >
        </div>

        <!-- Description -->
        <div
          v-if="form.description"
          class="discord-md text-sm text-[#dcddde] whitespace-pre-wrap mb-3"
          v-html="renderMd(form.description)"
        />

        <!-- Fields + Thumbnail -->
        <div class="flex gap-3">
          <div class="flex-1 min-w-0">
            <div
              v-if="form.fields.length > 0"
              class="grid gap-3 mt-2"
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
            class="w-20 h-20 rounded object-cover flex-shrink-0"
            @error="hideImg"
          />
        </div>

        <!-- Large Image -->
        <img
          v-if="form.imageUrl"
          :src="form.imageUrl"
          class="rounded mt-4 w-full max-h-80 object-cover"
          @error="hideImg"
        />

        <!-- Footer -->
        <div
          v-if="form.footerText || form.showTimestamp"
          class="flex items-center gap-2 mt-3 pt-3 border-t border-white/5"
        >
          <img
            v-if="form.footerIconUrl"
            :src="form.footerIconUrl"
            class="w-5 h-5 rounded-full"
            @error="hideImg"
          />
          <span class="text-xs text-[#72767d]">
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
        <p class="text-xs">Start typing to see preview</p>
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

const placeholder = "​"; // zero-width space

const renderMd = (s: string) => renderDiscordMarkdown(s, props.context ?? {});

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
