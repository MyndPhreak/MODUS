<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/server/${guildId}/modules`"
        class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <UIcon name="i-heroicons-arrow-left" class="text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div
          class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20"
        >
          <UIcon name="i-heroicons-trophy" class="text-amber-400 text-lg" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Milestone Settings</h2>
          <p class="text-xs text-gray-500">
            Configure character tracking and milestones for this server
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('milestones') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{
          isModuleEnabled("milestones") ? "Module Active" : "Module Disabled"
        }}
      </UBadge>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- General Settings -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5 space-y-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
            >
              <UIcon name="i-heroicons-cog-6-tooth" class="text-amber-400" />
            </div>
            <h3 class="font-semibold text-white">General</h3>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1"
              >Announcement Channel</label
            >
            <USelectMenu
              v-model="settings.announcementChannel"
              :items="channelItems"
              value-key="value"
              placeholder="Same channel as message"
              class="w-full"
              :loading="state.channelsLoading"
              :clear="{ ariaLabel: 'Clear channel selection' }"
            />
            <p class="text-[10px] text-gray-500 mt-1">
              Where public milestone announcements are posted. Leave empty to
              announce in the same channel the user typed in.
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1"
              >Minimum Message Length</label
            >
            <UInput
              v-model.number="settings.minMessageLength"
              type="number"
              :min="1"
              :max="100"
              size="sm"
            />
            <p class="text-[10px] text-gray-500 mt-1">
              Messages shorter than this (in characters) won't count toward
              milestones. Default: 5
            </p>
          </div>
        </div>
      </div>

      <!-- How It Works -->
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
              <UIcon
                name="i-heroicons-information-circle"
                class="text-indigo-400"
              />
            </div>
            <h3 class="font-semibold text-white">How It Works</h3>
          </div>

          <div class="space-y-3 text-sm text-gray-400">
            <div class="flex items-start gap-2">
              <span class="text-lg leading-none mt-0.5">💬</span>
              <p>
                When a user types their first message, they'll receive a
                <strong class="text-gray-300">private opt-in prompt</strong>
                via DM (or in-channel fallback).
              </p>
            </div>
            <div class="flex items-start gap-2">
              <span class="text-lg leading-none mt-0.5">📊</span>
              <p>
                Once opted in, every message's characters are counted toward
                their total. Users choose
                <strong class="text-gray-300"
                  >public, private, or silent</strong
                >
                notifications.
              </p>
            </div>
            <div class="flex items-start gap-2">
              <span class="text-lg leading-none mt-0.5">🏆</span>
              <p>
                When they cross a milestone threshold, they get a celebration
                notification! Users can view the server leaderboard with
                <code class="text-amber-400">/milestones leaderboard</code>.
              </p>
            </div>
            <div class="flex items-start gap-2">
              <span class="text-lg leading-none mt-0.5">🔒</span>
              <p>
                Everything is opt-in. Users can opt out anytime with
                <code class="text-amber-400">/milestones optout</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Milestones Configuration -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none"
      />
      <div class="relative">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div
              class="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
            >
              <UIcon name="i-heroicons-flag" class="text-amber-400" />
            </div>
            <div>
              <h3 class="font-semibold text-white">Milestones</h3>
              <p class="text-[10px] text-gray-500">
                Define character thresholds and their celebration messages
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-heroicons-arrow-path"
              @click="resetToDefaults"
            >
              Reset to Defaults
            </UButton>
            <UButton
              color="primary"
              variant="soft"
              size="xs"
              icon="i-heroicons-plus"
              @click="addMilestone"
            >
              Add Milestone
            </UButton>
          </div>
        </div>

        <UTable
          v-if="settings.milestones.length > 0"
          :data="settings.milestones"
          :columns="milestoneColumns"
          :ui="{
            root: 'border border-white/5 rounded-lg overflow-hidden',
            base: 'table-fixed w-full',
            thead: 'bg-gray-800/60',
            th: 'text-xs text-gray-400 font-medium uppercase tracking-wider',
            td: 'py-2.5 align-middle',
            tr: 'hover:bg-white/[0.02] transition-colors',
          }"
        />

        <div v-else class="text-center py-8 text-gray-500">
          <UIcon
            name="i-heroicons-flag"
            class="w-8 h-8 mx-auto mb-2 opacity-50"
          />
          <p class="text-sm">No milestones defined</p>
          <p class="text-xs">
            Add some milestones or reset to defaults to get started
          </p>
        </div>
      </div>
    </div>

    <!-- Save Button -->
    <div class="flex justify-end">
      <UButton
        color="primary"
        size="lg"
        icon="i-heroicons-check"
        :loading="saving"
        @click="save"
        class="min-w-[200px]"
      >
        Save Milestone Settings
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";

const route = useRoute();
const guildId = route.params.guild_id as string;
const {
  state,
  isModuleEnabled,
  saveModuleSettings,
  getModuleConfig,
  loadChannels,
  channelOptions,
} = useServerSettings(guildId);

const saving = ref(false);

interface MilestoneConfig {
  threshold: number;
  message: string;
}

const DEFAULT_MILESTONES: MilestoneConfig[] = [
  { threshold: 1_000, message: "That's about as long as a short email! 📧" },
  {
    threshold: 5_000,
    message: "You've written a college essay's worth of text! 📝",
  },
  {
    threshold: 10_000,
    message: "That's roughly the length of a short story! 📖",
  },
  {
    threshold: 25_000,
    message:
      "You've typed more than the US Constitution's preamble… many times over! 🇺🇸",
  },
  {
    threshold: 50_000,
    message: "You've written a novella's worth of messages! 📚",
  },
  {
    threshold: 100_000,
    message: "That's about as long as a short novel! 🏅",
  },
  {
    threshold: 250_000,
    message:
      "You've typed more than the entire Declaration of Independence — 40 times over! 🗽",
  },
  {
    threshold: 500_000,
    message:
      "Half a million characters! You could fill a full-length novel! ✍️",
  },
  {
    threshold: 1_000_000,
    message:
      "A MILLION characters?! You've written more than War and Peace! 🏆",
  },
];

const settings = ref({
  announcementChannel: "" as string,
  minMessageLength: 5,
  milestones: [...DEFAULT_MILESTONES] as MilestoneConfig[],
});

// Resolve components for use in table cell render functions
const InputEl = resolveComponent("UInput");
const ButtonEl = resolveComponent("UButton");

const milestoneColumns: TableColumn<MilestoneConfig>[] = [
  {
    id: "index",
    header: "#",
    cell: ({ row }) =>
      h(
        "div",
        {
          class:
            "w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center",
        },
        h(
          "span",
          { class: "text-xs font-bold text-amber-400" },
          String(row.index + 1),
        ),
      ),
    meta: { class: { th: "w-14", td: "w-14" } },
  },
  {
    accessorKey: "threshold",
    header: "Character Threshold",
    cell: ({ row }) =>
      h(InputEl, {
        modelValue: row.original.threshold,
        "onUpdate:modelValue": (val: any) => {
          row.original.threshold = Number(val);
        },
        type: "number",
        min: 1,
        placeholder: "e.g. 10000",
        class: "w-full",
      }),
    meta: { class: { th: "w-44", td: "w-44" } },
  },
  {
    accessorKey: "message",
    header: "Celebration Message",
    cell: ({ row }) =>
      h(InputEl, {
        modelValue: row.original.message,
        "onUpdate:modelValue": (val: string) => {
          row.original.message = val;
        },
        placeholder: "e.g. That's as long as a short novel! \uD83D\uDCD6",
        class: "w-full",
      }),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) =>
      h(ButtonEl, {
        icon: "i-heroicons-trash",
        color: "error",
        variant: "ghost",
        size: "xs",
        onClick: () => removeMilestone(row.index),
      }),
    meta: { class: { th: "w-12", td: "w-12 text-center" } },
  },
];

// Build channel items for USelectMenu
const channelItems = computed(() => channelOptions.value);

const addMilestone = () => {
  const highest =
    settings.value.milestones.length > 0
      ? Math.max(...settings.value.milestones.map((m) => m.threshold))
      : 0;

  settings.value.milestones.push({
    threshold: highest + 10_000,
    message: "",
  });
};

const removeMilestone = (index: number) => {
  settings.value.milestones.splice(index, 1);
};

const resetToDefaults = () => {
  settings.value.milestones = [...DEFAULT_MILESTONES];
};

const save = async () => {
  saving.value = true;

  // Sort milestones by threshold before saving
  settings.value.milestones.sort((a, b) => a.threshold - b.threshold);

  await saveModuleSettings("milestones", {
    announcementChannel: settings.value.announcementChannel || null,
    minMessageLength: settings.value.minMessageLength,
    milestones: settings.value.milestones,
  });

  saving.value = false;
};

// Load existing settings and channels on mount
onMounted(() => {
  const saved = getModuleConfig("milestones");
  if (saved && Object.keys(saved).length > 0) {
    settings.value = {
      announcementChannel: saved.announcementChannel ?? "",
      minMessageLength: saved.minMessageLength ?? 5,
      milestones: saved.milestones ?? [...DEFAULT_MILESTONES],
    };
  }

  // Pre-load channels so the dropdown items are stable when opened
  // (avoids vnode.component null crash from reactive items changing during animation)
  loadChannels();
});
</script>
