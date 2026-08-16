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

// The URL is a function, so its type is `/api/tickets/transcripts/${string}`,
// which matches this route AND the sibling `list` route. Nuxt unions the return
// types of every match, and the `list` shape has no `transcript`, so `data` has
// to be narrowed before any field is read. Nitro only ever dispatches a real
// request to one handler; the ambiguity is purely in the types.
const payload = computed(() =>
  data.value && "transcript" in data.value ? data.value : null,
);

const unavailable = computed(() => !!error.value || !payload.value);

// Group consecutive same-author messages (≤ 5 min apart).
const groups = computed(() => {
  if (!payload.value) return [];
  const out: any[][] = [];
  let current: any[] = [];
  const FIVE_MIN = 5 * 60 * 1000;
  for (const m of payload.value.messages) {
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
  title: payload.value
    ? `Ticket #${String(payload.value.transcript.ticket_id).padStart(4, "0")}`
    : "Transcript",
  meta: [
    {
      property: "og:title",
      content: payload.value
        ? `Ticket #${String(payload.value.transcript.ticket_id).padStart(4, "0")} — MODUS`
        : "MODUS Transcript",
    },
  ],
}));
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">
    <TranscriptUnavailable v-if="unavailable" />
    <template v-else-if="payload">
      <TranscriptHeader
        :transcript="payload.transcript"
        :mentions="payload.transcript.mentions"
      />
      <div class="divide-y divide-white/5">
        <TranscriptMessageGroup
          v-for="(group, i) in groups"
          :key="i"
          :messages="group"
          :signed-urls="payload.signed_urls"
          :mentions="payload.transcript.mentions"
        />
      </div>
      <div class="p-6 text-center text-xs text-gray-500">
        {{ payload.transcript.message_count }} messages
        <template v-if="payload.transcript.has_skipped_attachments">
          · some attachments were skipped at close time
        </template>
      </div>
    </template>
  </div>
</template>
