<script setup lang="ts">
import TranscriptEmbed from "./TranscriptEmbed.vue";
import TranscriptAttachment from "./TranscriptAttachment.vue";

interface Msg {
  id: number;
  author_id: string;
  author_tag: string;
  author_avatar_url: string | null;
  author_is_bot: boolean;
  content: string;
  embeds: any[];
  attachments: any[];
  created_at: string;
}

const props = defineProps<{
  messages: Msg[];
  signedUrls: Record<string, string>;
}>();

const head = computed(() => props.messages[0]!);
const headTimestamp = computed(() =>
  new Date(head.value.created_at).toLocaleString(),
);
</script>

<template>
  <div class="flex gap-3 px-4 py-2 hover:bg-white/5">
    <img
      v-if="head.author_avatar_url"
      :src="head.author_avatar_url"
      :alt="head.author_tag"
      class="h-10 w-10 flex-shrink-0 rounded-full"
    />
    <div v-else class="h-10 w-10 flex-shrink-0 rounded-full bg-gray-700" />
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2">
        <span class="font-semibold">{{ head.author_tag }}</span>
        <span
          v-if="head.author_is_bot"
          class="rounded bg-indigo-600/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase"
        >Bot</span>
        <span class="text-xs text-gray-400">{{ headTimestamp }}</span>
      </div>
      <div v-for="m in messages" :key="m.id" class="mt-1">
        <div v-if="m.content" class="whitespace-pre-wrap text-gray-100">
          {{ m.content }}
        </div>
        <TranscriptEmbed
          v-for="(e, i) in (m.embeds as any[])"
          :key="`e-${m.id}-${i}`"
          :embed="e"
        />
        <TranscriptAttachment
          v-for="(a, i) in (m.attachments as any[])"
          :key="`a-${m.id}-${i}`"
          :attachment="a"
          :signed-url="a.r2_key ? (signedUrls[a.r2_key] ?? null) : null"
        />
      </div>
    </div>
  </div>
</template>
