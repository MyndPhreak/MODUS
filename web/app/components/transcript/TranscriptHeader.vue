<script setup lang="ts">
interface Transcript {
  ticket_id: number;
  thread_name: string;
  opener_id: string;
  closed_by_id: string;
  priority: string;
  opened_at: string;
  closed_at: string;
  expires_at: string | null;
  message_count: number;
}

const props = defineProps<{ transcript: Transcript }>();

const priorityColors: Record<string, string> = {
  low: "bg-green-500/20 text-green-300",
  normal: "bg-blue-500/20 text-blue-300",
  high: "bg-orange-500/20 text-orange-300",
  critical: "bg-red-500/20 text-red-300",
};
</script>

<template>
  <div class="border-b border-white/10 px-6 py-4">
    <div class="flex items-center gap-3">
      <h1 class="text-lg font-semibold">
        Ticket #{{ String(transcript.ticket_id).padStart(4, "0") }}
      </h1>
      <span
        :class="[
          'rounded-full px-2 py-0.5 text-xs font-semibold uppercase',
          priorityColors[transcript.priority] ?? 'bg-white/10',
        ]"
      >{{ transcript.priority }}</span>
    </div>
    <div class="mt-1 text-sm text-gray-400">{{ transcript.thread_name }}</div>
    <div class="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-300 sm:grid-cols-4">
      <div>
        <div class="text-gray-500">Opened by</div>
        <div class="font-mono">{{ transcript.opener_id }}</div>
      </div>
      <div>
        <div class="text-gray-500">Closed by</div>
        <div class="font-mono">{{ transcript.closed_by_id }}</div>
      </div>
      <div>
        <div class="text-gray-500">Opened</div>
        <div>{{ new Date(transcript.opened_at).toLocaleString() }}</div>
      </div>
      <div>
        <div class="text-gray-500">Closed</div>
        <div>{{ new Date(transcript.closed_at).toLocaleString() }}</div>
      </div>
    </div>
    <div
      v-if="transcript.expires_at"
      class="mt-3 text-xs text-gray-500"
    >
      This transcript expires on
      {{ new Date(transcript.expires_at).toLocaleDateString() }}.
    </div>
  </div>
</template>
