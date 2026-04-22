<script setup lang="ts">
interface SnapshotAttachment {
  name: string;
  content_type: string;
  size: number;
  is_image: boolean;
  mirrored: boolean;
  r2_key?: string;
  expired_url: string;
}

const props = defineProps<{
  attachment: SnapshotAttachment;
  signedUrl: string | null;
}>();

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div v-if="attachment.mirrored && attachment.is_image && signedUrl" class="my-2">
    <img
      :src="signedUrl"
      :alt="attachment.name"
      class="max-h-96 max-w-full rounded-md border border-white/10"
      loading="lazy"
    />
  </div>
  <a
    v-else-if="attachment.mirrored && signedUrl"
    :href="signedUrl"
    target="_blank"
    rel="noopener"
    class="my-1 inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
  >
    <UIcon name="i-lucide-paperclip" class="h-4 w-4" />
    <span>{{ attachment.name }}</span>
    <span class="text-gray-400">{{ humanSize(attachment.size) }}</span>
  </a>
  <div
    v-else
    class="my-1 inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-sm text-gray-400"
    :title="attachment.expired_url"
  >
    <UIcon name="i-lucide-file-x" class="h-4 w-4" />
    <span>{{ attachment.name }}</span>
    <span class="italic">— file no longer available</span>
  </div>
</template>
