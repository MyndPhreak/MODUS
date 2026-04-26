<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/dashboard/server/${guildId}/modules`"
        class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <UIcon name="i-heroicons-arrow-left" class="text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div
          class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
        >
          <UIcon name="i-heroicons-bolt" class="text-emerald-400 text-lg" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Triggers</h2>
          <p class="text-xs text-gray-500">
            Receive webhook events and post custom embeds
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('triggers') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("triggers") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Create Trigger Card -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
          >
            <UIcon name="i-heroicons-plus" class="text-emerald-400" />
          </div>
          <h3 class="font-semibold text-white">New Trigger</h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UFormField label="Name">
            <UInput
              v-model="newTrigger.name"
              placeholder="e.g. github-prs"
            />
          </UFormField>
          <UFormField label="Provider">
            <USelect
              v-model="newTrigger.provider"
              :items="providerOptions"
            />
          </UFormField>
          <UFormField label="Channel">
            <USelect
              v-if="channels.length > 0"
              v-model="newTrigger.channel_id"
              :items="channelOptions"
              placeholder="Select channel"
            />
            <div v-else class="text-xs text-gray-500 italic py-2">
              No channels available
            </div>
          </UFormField>
        </div>

        <div class="flex justify-end">
          <UButton
            color="primary"
            size="sm"
            icon="i-heroicons-plus"
            :loading="actionLoading"
            :disabled="!newTrigger.name || !newTrigger.channel_id"
            @click="onCreateTrigger"
          >
            Create Trigger
          </UButton>
        </div>
      </div>
    </div>

    <!-- Webhook URL modal -->
    <UModal v-model:open="showUrlModal">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-link" class="text-emerald-400" />
            <h3 class="font-semibold text-white">Webhook URL</h3>
          </div>
          <p class="text-xs text-gray-400">
            Paste this URL into your service's webhook settings. Keep it secret
            — anyone with this URL can trigger messages.
          </p>
          <div
            class="bg-gray-900 border border-white/10 rounded-lg p-3 font-mono text-xs text-emerald-400 break-all select-all"
          >
            {{ createdWebhookUrl }}
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              @click="showUrlModal = false"
            >
              Close
            </UButton>
            <UButton
              color="primary"
              size="sm"
              icon="i-heroicons-clipboard-document"
              @click="copyUrl"
            >
              Copy URL
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Triggers List -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
          >
            <UIcon name="i-heroicons-list-bullet" class="text-indigo-400" />
          </div>
          <h3 class="font-semibold text-white">Active Triggers</h3>
          <UBadge color="neutral" variant="soft" size="xs" class="ml-auto">
            {{ triggerList.length }}/25
          </UBadge>
        </div>

        <!-- Loading State -->
        <div
          v-if="loading"
          class="flex items-center justify-center py-12 text-gray-500"
        >
          <UIcon
            name="i-heroicons-arrow-path"
            class="w-5 h-5 animate-spin mr-2"
          />
          Loading triggers...
        </div>

        <!-- Empty State -->
        <div
          v-else-if="triggerList.length === 0"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
          <div
            class="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3"
          >
            <UIcon name="i-heroicons-bolt" class="w-8 h-8 text-gray-600" />
          </div>
          <p class="text-gray-400 font-medium">No triggers yet</p>
          <p class="text-xs text-gray-600 mt-1">
            Create one above to get started
          </p>
        </div>

        <!-- Trigger Rows -->
        <div v-else class="space-y-2">
          <div
            v-for="trigger in triggerList"
            :key="trigger.$id"
            class="flex items-center gap-4 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group"
          >
            <!-- Provider badge -->
            <div
              class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              :class="providerBadgeClass(trigger.provider)"
            >
              <span class="text-base">{{
                providerEmoji(trigger.provider)
              }}</span>
            </div>

            <!-- Info -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium text-white truncate">
                  {{ trigger.name }}
                </p>
                <UBadge
                  :color="trigger.enabled ? 'success' : 'neutral'"
                  variant="soft"
                  size="xs"
                >
                  {{ trigger.enabled ? "Active" : "Disabled" }}
                </UBadge>
              </div>
              <p class="text-[10px] text-gray-500 mt-0.5">
                {{ trigger.provider }} →
                {{ getChannelName(trigger.channel_id) }}
                <span v-if="trigger.created_at">
                  · Created
                  {{ new Date(trigger.created_at).toLocaleDateString() }}</span
                >
              </p>
            </div>

            <!-- Actions -->
            <div
              class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <UButton
                color="primary"
                variant="ghost"
                size="xs"
                icon="i-heroicons-pencil-square"
                title="Edit Trigger"
                @click="openBuilder(trigger)"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-heroicons-clipboard-document"
                title="Copy webhook URL"
                @click="copyTriggerUrl(trigger.secret)"
              />
              <UButton
                :color="trigger.enabled ? 'warning' : 'success'"
                variant="ghost"
                size="xs"
                :icon="
                  trigger.enabled ? 'i-heroicons-pause' : 'i-heroicons-play'
                "
                :title="trigger.enabled ? 'Disable' : 'Enable'"
                @click="toggleTriggerFn(trigger.$id, !trigger.enabled)"
              />
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                icon="i-heroicons-trash"
                title="Delete"
                @click="onDeleteTrigger(trigger.$id, trigger.name)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- How It Works -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
          >
            <UIcon
              name="i-heroicons-information-circle"
              class="text-violet-400"
            />
          </div>
          <h3 class="font-semibold text-white">How It Works</h3>
        </div>

        <div class="space-y-3 text-xs text-gray-400 leading-relaxed">
          <p>
            Triggers listen for incoming webhook events from external services
            and post custom-formatted embeds to your Discord channels.
          </p>
          <ul class="space-y-1.5 list-none">
            <li class="flex items-start gap-2">
              <span class="text-base leading-none mt-0.5">🐙</span>
              <span
                ><strong class="text-gray-300">GitHub</strong> — PR merges,
                issues, pushes. Auto-parses PR title, author, and repo.</span
              >
            </li>
            <li class="flex items-start gap-2">
              <span class="text-base leading-none mt-0.5">📺</span>
              <span
                ><strong class="text-gray-300">Twitch</strong> — Stream
                online/offline events with streamer name, game, and title.</span
              >
            </li>
            <li class="flex items-start gap-2">
              <span class="text-base leading-none mt-0.5">🔔</span>
              <span
                ><strong class="text-gray-300">Generic Webhook</strong> — Any
                service that can POST JSON. Raw body displayed in the
                embed.</span
              >
            </li>
          </ul>
          <p class="text-gray-500">
            Use <code class="text-emerald-400">/triggers template</code> and
            <code class="text-emerald-400">/triggers filter</code> in Discord to
            customize embed appearance and filter conditions.
          </p>
        </div>
      </div>
    </div>
  </div>

  <TriggerBuilderModal
    v-model:open="isBuilderOpen"
    :trigger="activeTriggerForBuild"
    @save="onSaveBuilder"
  />
</template>

<script setup lang="ts">
import TriggerBuilderModal from "~/components/dashboard/TriggerBuilderModal.vue";
import type { TriggerDocument } from "~/composables/useTriggers";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { isModuleEnabled } = useServerSettings(guildId);
const toast = useToast();

// ── Channels ──
const { data: channelsData } = await useFetch("/api/discord/channels", {
  params: { guild_id: guildId },
});
const channels = computed(
  () => ((channelsData.value as any)?.channels as any[]) || [],
);
const channelOptions = computed(() =>
  channels.value.map((c: any) => ({
    label: `#${c.name}`,
    value: c.id,
  })),
);
const getChannelName = (id: string) => {
  const ch = channels.value.find((c: any) => c.id === id);
  return ch ? `#${ch.name}` : `#${id}`;
};

// ── Triggers CRUD ──
const {
  triggers: triggerList,
  loading,
  actionLoading,
  createTrigger,
  deleteTrigger,
  toggleTrigger: toggleTriggerFn,
  updateTrigger,
  getWebhookUrl,
} = useTriggers(guildId);

// ── New trigger form ──
const providerOptions = [
  { label: "Generic Webhook", value: "webhook" },
  { label: "GitHub", value: "github" },
  { label: "Twitch", value: "twitch" },
];

const newTrigger = reactive({
  name: "",
  provider: "webhook",
  channel_id: "",
});

const showUrlModal = ref(false);
const createdWebhookUrl = ref("");

const onCreateTrigger = async () => {
  try {
    const secret = await createTrigger({
      name: newTrigger.name,
      provider: newTrigger.provider as "webhook" | "github" | "twitch",
      channel_id: newTrigger.channel_id,
    });
    createdWebhookUrl.value = getWebhookUrl(secret!);
    showUrlModal.value = true;
    // Reset form
    newTrigger.name = "";
    newTrigger.provider = "webhook";
    newTrigger.channel_id = "";

    toast.add({
      title: "Trigger created",
      color: "success",
    });
  } catch {
    toast.add({
      title: "Failed to create trigger",
      color: "error",
    });
  }
};

const onDeleteTrigger = async (id: string, name: string) => {
  if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
  try {
    await deleteTrigger(id);
    toast.add({ title: "Trigger deleted", color: "success" });
  } catch {
    toast.add({ title: "Failed to delete trigger", color: "error" });
  }
};

const copyUrl = async () => {
  try {
    await navigator.clipboard.writeText(createdWebhookUrl.value);
    toast.add({ title: "Copied to clipboard", color: "success" });
  } catch {
    toast.add({ title: "Failed to copy", color: "error" });
  }
};

const copyTriggerUrl = async (secret: string) => {
  try {
    const url = getWebhookUrl(secret);
    await navigator.clipboard.writeText(url);
    toast.add({ title: "URL copied", color: "success" });
  } catch {
    toast.add({ title: "Failed to copy", color: "error" });
  }
};

// ── Provider helpers ──
const providerEmoji = (p: string) => {
  switch (p) {
    case "github":
      return "🐙";
    case "twitch":
      return "📺";
    default:
      return "🔔";
  }
};

const providerBadgeClass = (p: string) => {
  switch (p) {
    case "github":
      return "bg-green-500/10 border border-green-500/20";
    case "twitch":
      return "bg-purple-500/10 border border-purple-500/20";
    default:
      return "bg-blue-500/10 border border-blue-500/20";
  }
};

// ── Builder Modal ──
const isBuilderOpen = ref(false);
const activeTriggerForBuild = ref<TriggerDocument | null>(null);

const openBuilder = (trigger: TriggerDocument) => {
  activeTriggerForBuild.value = trigger;
  isBuilderOpen.value = true;
};

const onSaveBuilder = async (data: { filters: string | null; embed_template: string | null }) => {
  if (!activeTriggerForBuild.value) return;
  try {
    await updateTrigger(activeTriggerForBuild.value.$id, data);
    toast.add({ title: "Trigger saved", color: "success" });
  } catch {
    toast.add({ title: "Failed to save trigger", color: "error" });
  }
};
</script>
