<script setup lang="ts">
import TranscriptHeader from "~/components/transcript/TranscriptHeader.vue";
import TranscriptMessageGroup from "~/components/transcript/TranscriptMessageGroup.vue";
import TranscriptUnavailable from "~/components/transcript/TranscriptUnavailable.vue";

// Disable the default layout if one exists; transcripts render edge-to-edge.
definePageMeta({ layout: false });

const route = useRoute();
const slug = computed(() => String(route.params.slug));

const { loggedIn } = useUserSession();
if (!loggedIn.value) {
  await navigateTo(`/login?redirect=/ticket/${slug.value}`);
}

const { data, error } = await useFetch(
  () => `/api/tickets/transcripts/${slug.value}`,
  { server: true },
);

const unavailable = computed(
  () => !!error.value || !data.value?.transcript,
);

// Group consecutive same-author messages (≤ 5 min apart).
const groups = computed(() => {
  if (!data.value?.messages) return [];
  const out: any[][] = [];
  let current: any[] = [];
  const FIVE_MIN = 5 * 60 * 1000;
  for (const m of data.value.messages) {
    const last = current[current.length - 1];
    if (
      !last ||
      last.author_id !== m.author_id ||
      new Date(m.created_at).getTime() -
        new Date(last.created_at).getTime() >
        FIVE_MIN
    ) {
      if (current.length) out.push(current);
      current = [m];
    } else {
      current.push(m);
    }
  }
  if (current.length) out.push(current);
  return out;
});

useHead(() => ({
  title: data.value?.transcript
    ? `Ticket #${String(data.value.transcript.ticket_id).padStart(4, "0")}`
    : "Transcript",
  meta: [
    {
      property: "og:title",
      content: data.value?.transcript
        ? `Ticket #${String(data.value.transcript.ticket_id).padStart(4, "0")} — MODUS`
        : "MODUS Transcript",
    },
  ],
}));
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">
    <TranscriptUnavailable v-if="unavailable" />
    <template v-else-if="data">
      <TranscriptHeader
        :transcript="data.transcript"
        :mentions="data.transcript.mentions"
      />
      <div class="divide-y divide-white/5">
        <TranscriptMessageGroup
          v-for="(group, i) in groups"
          :key="i"
          :messages="group"
          :signed-urls="data.signed_urls"
          :mentions="data.transcript.mentions"
        />
      </div>
      <div class="p-6 text-center text-xs text-gray-500">
        {{ data.transcript.message_count }} messages
        <template v-if="data.transcript.has_skipped_attachments">
          · some attachments were skipped at close time
        </template>
      </div>
    </template>
  </div>
</template>
