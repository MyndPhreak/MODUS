<script setup lang="ts">
import TranscriptContent from "./TranscriptContent.vue";

interface SnapshotEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  image_url?: string;
  thumbnail_url?: string;
}

interface MentionLookup {
  users?: Record<string, string>;
  roles?: Record<string, string>;
  channels?: Record<string, string>;
}

const props = defineProps<{
  embed: SnapshotEmbed;
  mentions?: MentionLookup | null;
}>();

const borderColor = computed(() =>
  props.embed.color != null
    ? `#${props.embed.color.toString(16).padStart(6, "0")}`
    : "rgba(255,255,255,0.2)",
);
</script>

<template>
  <div
    class="my-2 max-w-xl rounded-md bg-white/5 p-3 text-sm"
    :style="{ borderLeft: `4px solid ${borderColor}` }"
  >
    <div v-if="embed.title" class="font-semibold">
      <TranscriptContent :content="embed.title" :mentions="mentions" />
    </div>
    <TranscriptContent
      v-if="embed.description"
      class="mt-1 text-gray-200"
      :content="embed.description"
      :mentions="mentions"
    />
    <div v-if="embed.fields?.length" class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div v-for="(f, i) in embed.fields" :key="i" :class="{ 'sm:col-span-2': !f.inline }">
        <div class="text-xs font-semibold text-gray-300">{{ f.name }}</div>
        <TranscriptContent
          class="text-gray-200"
          :content="f.value"
          :mentions="mentions"
        />
      </div>
    </div>
    <img
      v-if="embed.image_url"
      :src="embed.image_url"
      class="mt-2 max-h-80 rounded"
      loading="lazy"
    />
    <div v-if="embed.footer?.text" class="mt-2 text-xs text-gray-400">
      {{ embed.footer.text }}
    </div>
  </div>
</template>
