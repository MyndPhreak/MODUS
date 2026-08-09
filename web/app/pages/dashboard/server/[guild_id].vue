<template>
  <div class="min-h-0 h-full overflow-y-auto">
    <!-- Loading -->
    <div v-if="state.loading" class="flex justify-center py-20">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-12 h-12 animate-spin text-primary-500"
      />
    </div>

    <!-- Unauthorized -->
    <div v-else-if="state.unauthorized" class="text-center py-20">
      <UIcon
        name="i-heroicons-lock-closed"
        class="w-16 h-16 text-red-500 mx-auto mb-4"
      />
      <h1 class="text-3xl font-bold mb-2">Access Denied</h1>
      <p class="text-gray-500 mb-8">
        You do not have administrative privileges or a dashboard role for this
        server.
      </p>
      <UButton to="/dashboard" color="primary">Back to Dashboard</UButton>
    </div>

    <!-- Content: Child Pages -->
    <NuxtPage v-else-if="state.guild" />
  </div>
</template>

<script setup lang="ts">
import { watch, onMounted, onUnmounted } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { register: registerSidebar, unregister: unregisterSidebar } =
  useServerSidebar();
const { state, initialize } = useServerSettings(guildId);

const basePath = `/dashboard/server/${guildId}`;

const activeTab = computed(() => {
  const path = route.path;
  // Moderation & Safety
  if (path.includes("/modules/moderation")) return "moderation";
  if (path.includes("/modules/automod")) return "automod";
  if (path.includes("/modules/logging")) return "logging";
  if (path.includes("/modules/antiraid")) return "antiraid";
  if (path.includes("/modules/verification")) return "verification";
  // Engagement
  if (path.includes("/modules/welcome")) return "welcome";
  if (path.includes("/modules/reaction-roles")) return "reaction-roles";
  if (path.includes("/modules/milestones")) return "milestones";
  if (path.includes("/modules/triggers")) return "triggers";
  if (path.includes("/modules/alerts")) return "alerts";
  // Community Tools
  if (path.includes("/modules/tickets")) return "tickets";
  if (path.includes("/modules/events")) return "events";
  if (path.includes("/modules/polls")) return "polls";
  if (path.includes("/modules/embeds")) return "embeds";
  if (path.includes("/modules/tags")) return "tags";
  // Voice & Media
  if (path.includes("/modules/music")) return "music";
  if (path.includes("/modules/recording")) return "recording";
  if (path.includes("/modules/tempvoice")) return "tempvoice";
  // AI
  if (path.includes("/modules/ai")) return "ai";
  // Index + logs
  if (path.includes("/identity")) return "identity";
  if (path.includes("/modules")) return "modules";
  if (path.includes("/logs")) return "logs";
  return "modules";
});

// Sidebar tab definitions — route-based, grouped by category
const sidebarTabs = computed(() => [
  // Top-level navigation (no category)
  {
    id: "logs",
    label: "Server Logs",
    icon: "i-lucide-file-text",
    to: `${basePath}/logs`,
  },
  {
    id: "modules",
    label: "Modules",
    icon: "i-lucide-layout-grid",
    to: `${basePath}/modules`,
  },
  {
    id: "identity",
    label: "Bot Identity",
    icon: "i-lucide-bot",
    to: `${basePath}/identity`,
  },

  // Moderation & Safety
  {
    id: "moderation",
    label: "Moderation",
    icon: "i-lucide-gavel",
    to: `${basePath}/modules/moderation`,
    groupLabel: "Moderation & Safety",
  },
  {
    id: "automod",
    label: "AutoMod",
    icon: "i-lucide-shield-ban",
    to: `${basePath}/modules/automod`,
  },
  {
    id: "logging",
    label: "Audit Logging",
    icon: "i-lucide-scroll-text",
    to: `${basePath}/modules/logging`,
  },
  {
    id: "antiraid",
    label: "Anti-Raid",
    icon: "i-lucide-siren",
    to: `${basePath}/modules/antiraid`,
  },
  {
    id: "verification",
    label: "Verification",
    icon: "i-lucide-badge-check",
    to: `${basePath}/modules/verification`,
  },

  // Engagement
  {
    id: "welcome",
    label: "Welcome Image",
    icon: "i-lucide-party-popper",
    to: `${basePath}/modules/welcome`,
    groupLabel: "Engagement",
  },
  {
    id: "reaction-roles",
    label: "Reaction Roles",
    icon: "i-lucide-smile-plus",
    to: `${basePath}/modules/reaction-roles`,
  },
  {
    id: "milestones",
    label: "Milestones",
    icon: "i-lucide-trophy",
    to: `${basePath}/modules/milestones`,
  },
  {
    id: "triggers",
    label: "Triggers",
    icon: "i-lucide-zap",
    to: `${basePath}/modules/triggers`,
  },
  {
    id: "alerts",
    label: "Social Alerts",
    icon: "i-lucide-bell-ring",
    to: `${basePath}/modules/alerts`,
  },

  // Community Tools
  {
    id: "tickets",
    label: "Tickets",
    icon: "i-lucide-ticket",
    to: `${basePath}/modules/tickets`,
    groupLabel: "Community Tools",
  },
  {
    id: "events",
    label: "Events",
    icon: "i-lucide-calendar-clock",
    to: `${basePath}/modules/events`,
  },
  {
    id: "polls",
    label: "Polls",
    icon: "i-lucide-bar-chart-3",
    to: `${basePath}/modules/polls`,
  },
  {
    id: "embeds",
    label: "Embeds",
    icon: "i-lucide-layout-template",
    to: `${basePath}/modules/embeds`,
  },
  {
    id: "tags",
    label: "Tags",
    icon: "i-lucide-tag",
    to: `${basePath}/modules/tags`,
  },

  // Voice & Media
  {
    id: "music",
    label: "Music",
    icon: "i-lucide-disc-3",
    to: `${basePath}/modules/music`,
    groupLabel: "Voice & Media",
  },
  {
    id: "recording",
    label: "Recording",
    icon: "i-lucide-audio-waveform",
    to: `${basePath}/modules/recording`,
  },
  {
    id: "tempvoice",
    label: "Temp Voice",
    icon: "i-lucide-mic-vocal",
    to: `${basePath}/modules/tempvoice`,
  },

  // AI
  {
    id: "ai",
    label: "AI Assistant",
    icon: "i-lucide-bot",
    to: `${basePath}/modules/ai`,
    groupLabel: "AI",
  },
]);

// Register sidebar when guild data becomes available
watch(
  [() => state.value.guild, activeTab, sidebarTabs],
  () => {
    if (state.value.guild) {
      registerSidebar({
        guild: state.value.guild,
        tabs: sidebarTabs.value,
        activeTab: activeTab.value,
      });
    }
  },
  { immediate: true, deep: true },
);

const activeTabLabel = computed(
  () => sidebarTabs.value.find((t) => t.id === activeTab.value)?.label,
);

useHead(() => ({
  title:
    state.value.guild && activeTabLabel.value
      ? `${activeTabLabel.value} | ${state.value.guild.name}`
      : "Dashboard",
}));

onMounted(async () => {
  await initialize();
});

onUnmounted(() => {
  unregisterSidebar();
});
</script>
