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
        You do not have administrative privileges for this server.
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

// Determine active tab from current route
const activeTab = computed(() => {
  const path = route.path;
  if (path.includes("/modules/recording")) return "recording";
  if (path.includes("/modules/music")) return "music";
  if (path.includes("/modules/moderation")) return "moderation";
  if (path.includes("/modules/automod")) return "automod";
  if (path.includes("/modules/logging")) return "logging";
  if (path.includes("/modules/milestones")) return "milestones";
  if (path.includes("/modules/triggers")) return "triggers";
  if (path.includes("/modules/ai")) return "ai";
  if (path.includes("/modules/antiraid")) return "antiraid";
  if (path.includes("/modules/verification")) return "verification";
  if (path.includes("/modules/tickets")) return "tickets";
  if (path.includes("/modules/alerts")) return "alerts";
  if (path.includes("/modules/tempvoice")) return "tempvoice";
  if (path.includes("/modules/reaction-roles")) return "reaction-roles";
  if (path.includes("/modules/events")) return "events";
  if (path.includes("/modules/polls")) return "polls";
  if (path.includes("/modules/embeds")) return "embeds";
  if (path.includes("/modules/tags")) return "tags";
  if (path.includes("/modules/welcome")) return "welcome";
  if (path.includes("/modules")) return "modules";
  if (path.includes("/logs")) return "logs";
  return "modules";
});

// Sidebar tab definitions — route-based
const sidebarTabs = computed(() => [
  {
    id: "logs",
    label: "Server Logs",
    icon: "i-heroicons-document-text",
    to: `${basePath}/logs`,
  },
  {
    id: "modules",
    label: "Modules",
    icon: "i-heroicons-squares-2x2",
    to: `${basePath}/modules`,
    separator: true,
  },
  {
    id: "music",
    label: "Music",
    icon: "i-heroicons-musical-note",
    to: `${basePath}/modules/music`,
    separator: true,
  },
  {
    id: "moderation",
    label: "Moderation",
    icon: "i-heroicons-shield-exclamation",
    to: `${basePath}/modules/moderation`,
  },
  {
    id: "automod",
    label: "AutoMod",
    icon: "i-heroicons-funnel",
    to: `${basePath}/modules/automod`,
  },
  {
    id: "logging",
    label: "Audit Logging",
    icon: "i-heroicons-clipboard-document-list",
    to: `${basePath}/modules/logging`,
  },
  {
    id: "ai",
    label: "AI Assistant",
    icon: "i-heroicons-cpu-chip",
    to: `${basePath}/modules/ai`,
  },
  {
    id: "recording",
    label: "Recording",
    icon: "i-heroicons-microphone",
    to: `${basePath}/modules/recording`,
  },
  {
    id: "milestones",
    label: "Milestones",
    icon: "i-heroicons-trophy",
    to: `${basePath}/modules/milestones`,
  },
  {
    id: "triggers",
    label: "Triggers",
    icon: "i-heroicons-bolt",
    to: `${basePath}/modules/triggers`,
  },
  {
    id: "antiraid",
    label: "Anti-Raid",
    icon: "i-heroicons-shield-check",
    to: `${basePath}/modules/antiraid`,
    separator: true,
  },
  {
    id: "verification",
    label: "Verification",
    icon: "i-heroicons-check-badge",
    to: `${basePath}/modules/verification`,
  },
  {
    id: "tickets",
    label: "Tickets",
    icon: "i-heroicons-ticket",
    to: `${basePath}/modules/tickets`,
  },
  {
    id: "alerts",
    label: "Social Alerts",
    icon: "i-heroicons-bell-alert",
    to: `${basePath}/modules/alerts`,
  },
  {
    id: "tempvoice",
    label: "Temp Voice",
    icon: "i-heroicons-speaker-wave",
    to: `${basePath}/modules/tempvoice`,
  },
  {
    id: "reaction-roles",
    label: "Reaction Roles",
    icon: "i-heroicons-face-smile",
    to: `${basePath}/modules/reaction-roles`,
  },
  {
    id: "events",
    label: "Events",
    icon: "i-heroicons-calendar-days",
    to: `${basePath}/modules/events`,
  },
  {
    id: "polls",
    label: "Polls",
    icon: "i-heroicons-chart-bar",
    to: `${basePath}/modules/polls`,
  },
  {
    id: "embeds",
    label: "Embeds",
    icon: "i-heroicons-paint-brush",
    to: `${basePath}/modules/embeds`,
  },
  {
    id: "tags",
    label: "Tags",
    icon: "i-heroicons-tag",
    to: `${basePath}/modules/tags`,
  },
  {
    id: "welcome",
    label: "Welcome Image",
    icon: "i-heroicons-sparkles",
    to: `${basePath}/modules/welcome`,
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

onMounted(async () => {
  await initialize();
});

onUnmounted(() => {
  unregisterSidebar();
});
</script>
