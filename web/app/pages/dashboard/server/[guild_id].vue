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

    <!-- Module-scoped user hitting a page outside their grant -->
    <div v-else-if="state.guild && !canAccessActiveTab" class="text-center py-20">
      <UIcon
        name="i-heroicons-lock-closed"
        class="w-16 h-16 text-red-500 mx-auto mb-4"
      />
      <h1 class="text-3xl font-bold mb-2">Access Denied</h1>
      <p class="text-gray-500 mb-8">
        You don't have access to this page. Ask a server admin to grant your
        role access to this module.
      </p>
      <UButton :to="`${basePath}/modules`" color="primary">Back to Dashboard</UButton>
    </div>

    <!-- Content: Child Pages -->
    <NuxtPage v-else-if="state.guild" />
  </div>
</template>

<script setup lang="ts">
import { watch, onMounted, onUnmounted } from "vue";
import { MODULE_CATEGORIES, getModuleDisplay } from "~/utils/module-metadata";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { register: registerSidebar, unregister: unregisterSidebar } =
  useServerSidebar();
const { state, initialize, hasModuleSettings } = useServerSettings(guildId);

const basePath = `/dashboard/server/${guildId}`;

const activeTab = computed(() => {
  const path = route.path;
  if (path.includes("/identity")) return "identity";
  if (path.includes("/logs")) return "logs";
  const moduleMatch = path.match(/\/modules\/([^/]+)/);
  if (moduleMatch?.[1]) return moduleMatch[1];
  return "modules";
});

const canAccessActiveTab = computed(() => {
  if (state.value.accessibleModules === null) return true;
  if (["logs", "modules", "identity"].includes(activeTab.value)) return false;
  return state.value.accessibleModules.includes(activeTab.value);
});

// Sidebar tab definitions — route-based, grouped by category
const sidebarTabs = computed(() => {
  const staticTabs =
    state.value.accessibleModules === null
      ? [
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
        ]
      : [];

  const moduleTabs: Array<{
    id: string;
    label: string;
    icon: string;
    to: string;
    groupLabel?: string;
  }> = [];

  for (const cat of MODULE_CATEGORIES) {
    const catModules = state.value.modules
      .filter((m) => hasModuleSettings(m.name) && getModuleDisplay(m).category === cat.key)
      .filter(
        (m) =>
          state.value.accessibleModules === null ||
          state.value.accessibleModules.includes(m.name.toLowerCase()),
      )
      .sort((a, b) =>
        getModuleDisplay(a).displayName.localeCompare(getModuleDisplay(b).displayName),
      );

    catModules.forEach((mod, index) => {
      const display = getModuleDisplay(mod);
      moduleTabs.push({
        id: mod.name.toLowerCase(),
        label: display.displayName,
        icon: display.icon,
        to: `${basePath}/modules/${mod.name.toLowerCase()}`,
        ...(index === 0 ? { groupLabel: cat.label } : {}),
      });
    });
  }

  return [...staticTabs, ...moduleTabs];
});

// Register sidebar once guild + module data have both loaded — registering
// as soon as `state.guild` is set (before `state.modules` arrives) made the
// sidebar render once with only the static tabs, then again a moment later
// once modules populate, producing a visible two-stage reflow.
watch(
  [() => state.value.guild, () => state.value.loading, activeTab, sidebarTabs],
  () => {
    if (state.value.guild && !state.value.loading) {
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
