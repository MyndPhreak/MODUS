<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/dashboard/server/${guildId}/modules`"
        class="w-9 h-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center shrink-0"
      >
        <UIcon name="i-heroicons-arrow-left" class="w-5 h-5 text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div
          class="w-9 h-9 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center shrink-0"
        >
          <UIcon
            name="i-heroicons-chart-bar"
            class="w-5 h-5 text-fuchsia-400"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Polls</h2>
          <p class="text-xs text-gray-500">
            Native Discord polls with reusable templates and live results
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('polls') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("polls") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>

    <!-- Templates panel -->
    <div class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5">
      <div class="absolute inset-0 bg-gradient-to-br from-fuchsia-500/5 to-transparent pointer-events-none" />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-7 h-7 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center shrink-0">
            <UIcon name="i-heroicons-information-circle" class="text-fuchsia-400" />
          </div>
          <h3 class="font-semibold text-white">Poll Templates</h3>
          <UBadge color="neutral" variant="soft" size="xs" class="ml-auto">
            {{ templates.length }}
          </UBadge>
        </div>

        <!-- New template form -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Name">
            <UInput v-model="newTemplate.name" size="lg" placeholder="e.g. weekly-feedback" class="w-full" />
          </UFormField>
          <UFormField label="Question">
            <UTextarea
              v-model="newTemplate.question"
              size="lg"
              placeholder="What should we build next?"
              maxlength="300"
              :rows="2"
              autoresize
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField label="Options (2-10)">
          <div class="space-y-2">
            <div v-for="(_, i) in newTemplate.options" :key="i" class="flex gap-2">
              <UInput
                v-model="newTemplate.options[i]"
                size="lg"
                :placeholder="`Option ${i + 1}`"
                maxlength="55"
                class="flex-1"
              />
              <UButton
                v-if="newTemplate.options.length > 2"
                color="error"
                variant="ghost"
                size="xs"
                icon="i-heroicons-trash"
                @click="newTemplate.options.splice(i, 1)"
              />
            </div>
            <UButton
              v-if="newTemplate.options.length < 10"
              color="neutral"
              variant="soft"
              size="xs"
              icon="i-heroicons-plus"
              @click="newTemplate.options.push('')"
            >
              Add option
            </UButton>
          </div>
        </UFormField>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Duration (hours, 1-168)">
            <UInput v-model.number="newTemplate.duration_hours" size="lg" type="number" :min="1" :max="168" class="w-full" />
          </UFormField>
          <UFormField label="Allow multiple choices">
            <USwitch v-model="newTemplate.allow_multiselect" />
          </UFormField>
        </div>
        <div class="flex justify-end">
          <UButton
            color="primary"
            size="sm"
            icon="i-heroicons-bookmark"
            :loading="actionLoading"
            :disabled="!canSaveTemplate"
            @click="onCreateTemplate"
          >
            Save Template
          </UButton>
        </div>

        <!-- Template list -->
        <div v-if="templates.length > 0" class="space-y-2 pt-2 border-t border-white/5">
          <div
            v-for="template in templates"
            :key="template.id"
            class="flex items-center gap-4 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/5"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-white truncate">{{ template.name }}</p>
              <p class="text-[10px] text-gray-500 mt-0.5 truncate">
                {{ template.question }} · {{ template.options.length }} options · {{ template.durationHours }}h
              </p>
            </div>
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-heroicons-trash"
              @click="onDeleteTemplate(template.id)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Send panel -->
    <div class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5">
      <div class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2">
          <div class="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <UIcon name="i-heroicons-paper-airplane" class="text-blue-400" />
          </div>
          <h3 class="font-semibold text-white">Send a Poll</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Template">
            <USelect
              v-model="sendForm.template_id"
              size="lg"
              :items="templateOptions"
              placeholder="Choose a saved template"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Channel">
            <USelect
              v-if="channels.length > 0"
              v-model="sendForm.channel_id"
              size="lg"
              :items="channelOptions"
              placeholder="Select channel"
              class="w-full"
            />
            <div v-else class="text-xs text-gray-500 italic py-2">No channels available</div>
          </UFormField>
        </div>
        <div class="flex justify-end">
          <UButton
            color="primary"
            size="sm"
            icon="i-heroicons-paper-airplane"
            :loading="actionLoading"
            :disabled="!sendForm.template_id || !sendForm.channel_id"
            @click="onSendPoll"
          >
            Send
          </UButton>
        </div>
      </div>
    </div>

    <!-- Running polls panel -->
    <div class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5">
      <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2">
          <div class="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <UIcon name="i-heroicons-signal" class="text-emerald-400" />
          </div>
          <h3 class="font-semibold text-white">Running Polls</h3>
          <UBadge color="neutral" variant="soft" size="xs" class="ml-auto">
            {{ runningPolls.length }}
          </UBadge>
          <UButton
            v-if="!realtimeAvailable"
            color="neutral"
            variant="soft"
            size="xs"
            icon="i-heroicons-arrow-path"
            @click="fetchRunningPolls"
          >
            Refresh
          </UButton>
        </div>
        <p v-if="!realtimeAvailable" class="text-[10px] text-amber-400">
          Realtime updates unavailable — showing a snapshot. Click Refresh to update.
        </p>

        <div v-if="loading" class="flex items-center justify-center py-12 text-gray-500">
          <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin mr-2" />
          Loading polls...
        </div>
        <div v-else-if="runningPolls.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
          <div class="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <UIcon name="i-heroicons-chart-bar" class="w-8 h-8 text-gray-600" />
          </div>
          <p class="text-gray-400 font-medium">No polls running</p>
          <p class="text-xs text-gray-600 mt-1">Send one above or run /poll create in Discord</p>
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="poll in runningPolls"
            :key="poll.id"
            class="px-4 py-3 rounded-lg bg-white/[0.02] border border-white/5 space-y-2"
          >
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium text-white flex-1">{{ poll.question }}</p>
              <UBadge color="neutral" variant="soft" size="xs">{{ poll.source }}</UBadge>
              <UButton
                v-if="state.isServerOwnerOrAdmin"
                color="error"
                variant="ghost"
                size="xs"
                icon="i-heroicons-stop-circle"
                :loading="actionLoading"
                @click="onEndPoll(poll)"
              >
                End
              </UButton>
            </div>
            <div v-for="(opt, idx) in poll.options" :key="idx" class="space-y-0.5">
              <div class="flex justify-between text-[11px] text-gray-400">
                <span>{{ opt.text }}</span>
                <span>{{ optionPct(opt, poll.totalVotes) }}% ({{ opt.votes }})</span>
              </div>
              <div class="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  class="h-full bg-fuchsia-500 rounded-full transition-all"
                  :style="{ width: optionPct(opt, poll.totalVotes) + '%' }"
                />
              </div>
            </div>
            <p class="text-[10px] text-gray-500">
              {{ poll.totalVotes }} total votes · ends {{ new Date(poll.expiresAt).toLocaleString() }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const guildId = route.params.guild_id as string;
const { state, isModuleEnabled } = useServerSettings(guildId);
const {
  templates,
  runningPolls,
  loading,
  actionLoading,
  error,
  realtimeAvailable,
  createTemplate,
  deleteTemplate,
  fetchRunningPolls,
  sendPoll,
  endPoll,
} = usePolls(guildId);

const newTemplate = reactive({
  name: "",
  question: "",
  options: ["", ""],
  duration_hours: 24,
  allow_multiselect: false,
});

const canSaveTemplate = computed(
  () =>
    newTemplate.name.trim() &&
    newTemplate.question.trim() &&
    newTemplate.options.filter((o) => o.trim()).length >= 2,
);

const onCreateTemplate = async () => {
  try {
    await createTemplate({
      name: newTemplate.name.trim(),
      question: newTemplate.question.trim(),
      options: newTemplate.options.map((o) => o.trim()).filter(Boolean),
      duration_hours: newTemplate.duration_hours,
      allow_multiselect: newTemplate.allow_multiselect,
    });
    newTemplate.name = "";
    newTemplate.question = "";
    newTemplate.options = ["", ""];
    newTemplate.duration_hours = 24;
    newTemplate.allow_multiselect = false;
  } catch {
    // createTemplate re-throws after populating `error` — the banner at
    // the top of the page already surfaces it, this just prevents an
    // unhandled promise rejection.
  }
};

const onDeleteTemplate = async (id: string) => {
  try {
    await deleteTemplate(id);
  } catch {
    // deleteTemplate re-throws after populating `error` — see onCreateTemplate.
  }
};

const templateOptions = computed(() =>
  templates.value.map((t) => ({ label: t.name, value: t.id })),
);

// Channels for the send form's channel picker (existing endpoint used by
// the triggers page for the same purpose).
const channels = ref<{ id: string; name: string }[]>([]);
const channelOptions = computed(() =>
  channels.value.map((c) => ({ label: `#${c.name}`, value: c.id })),
);
const fetchChannels = async () => {
  try {
    const data = (await $fetch("/api/discord/channels", {
      params: { guild_id: guildId },
    })) as { channels: { id: string; name: string }[] };
    channels.value = data.channels;
  } catch {
    channels.value = [];
  }
};
onMounted(fetchChannels);

const sendForm = reactive({ template_id: "", channel_id: "" });
const onSendPoll = async () => {
  try {
    await sendPoll({
      channel_id: sendForm.channel_id,
      template_id: sendForm.template_id,
    });
    sendForm.template_id = "";
    sendForm.channel_id = "";
  } catch {
    // sendPoll re-throws after populating `error` — see onCreateTemplate.
  }
};

const optionPct = (opt: { votes: number }, total: number) =>
  total > 0 ? Math.round((opt.votes / total) * 100) : 0;

const onEndPoll = async (poll: { channelId: string; messageId: string; question: string }) => {
  if (!confirm(`End the poll "${poll.question}" now? This can't be undone.`)) return;
  try {
    await endPoll(poll.channelId, poll.messageId);
  } catch {
    // endPoll re-throws after populating `error` — see onCreateTemplate.
  }
};
</script>
