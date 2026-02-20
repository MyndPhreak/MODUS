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
      <UButton to="/" color="primary">Back to Dashboard</UButton>
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

const basePath = `/server/${guildId}`;

// Determine active tab from current route
const activeTab = computed(() => {
  const path = route.path;
  if (path.includes("/modules/recording")) return "recording";
  if (path.includes("/modules/music")) return "music";
  if (path.includes("/modules/moderation")) return "moderation";
  if (path.includes("/modules/automod")) return "automod";
  if (path.includes("/modules/logging")) return "logging";
  if (path.includes("/modules/milestones")) return "milestones";
  if (path.includes("/modules/ai")) return "ai";
  if (path.includes("/modules")) return "modules";
  if (path.includes("/embeds")) return "embeds";
  if (path.includes("/tags")) return "tags";
  if (path.includes("/welcome")) return "welcome";
  if (path.includes("/logs")) return "logs";
  return "modules";
});

// Sidebar tab definitions — route-based
const sidebarTabs = computed(() => [
  {
    id: "modules",
    label: "Modules",
    icon: "i-heroicons-squares-2x2",
    to: `${basePath}/modules`,
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
    id: "embeds",
    label: "Embeds",
    icon: "i-heroicons-paint-brush",
    to: `${basePath}/embeds`,
    separator: true,
  },
  {
    id: "tags",
    label: "Tags",
    icon: "i-heroicons-tag",
    to: `${basePath}/tags`,
  },
  {
    id: "welcome",
    label: "Welcome Image",
    icon: "i-heroicons-sparkles",
    to: `${basePath}/welcome`,
  },
  {
    id: "logs",
    label: "Logs",
    icon: "i-heroicons-document-text",
    to: `${basePath}/logs`,
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "i-heroicons-bell",
    badge: "Soon",
    disabled: true,
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
