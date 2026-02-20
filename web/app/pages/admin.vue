<template>
  <div class="min-h-0 h-full overflow-y-auto">
    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-12 h-12 animate-spin text-primary-500"
      />
    </div>

    <!-- Access Denied -->
    <div v-else-if="!isBotAdmin" class="text-center py-20 px-6">
      <UIcon
        name="i-heroicons-lock-closed"
        class="w-16 h-16 text-red-500 mx-auto mb-4"
      />
      <h1 class="text-3xl font-bold mb-2">Access Denied</h1>
      <p class="text-gray-500 mb-8">
        You do not have administrative privileges.
      </p>
      <UButton to="/" color="primary">Back to Dashboard</UButton>
    </div>

    <!-- Child pages -->
    <NuxtPage v-else />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";

const userStore = useUserStore();
const { register: registerSidebar, unregister: unregisterSidebar } =
  useServerSidebar();
const route = useRoute();
const loading = ref(true);

const isBotAdmin = computed(() => userStore.isAdmin);

// Determine active tab from current route
const activeTab = computed(() => {
  const path = route.path;
  if (path.includes("/admin/ai")) return "ai";
  if (path.includes("/admin/servers")) return "servers";
  if (path.includes("/admin/logs")) return "logs";
  return "modules";
});

// Sidebar tab definitions
const sidebarTabs = [
  {
    id: "modules",
    label: "Global Modules",
    icon: "i-heroicons-squares-2x2",
    to: "/admin/modules",
  },
  {
    id: "ai",
    label: "AI Settings",
    icon: "i-heroicons-cpu-chip",
    to: "/admin/ai",
    separator: true,
  },
  {
    id: "servers",
    label: "Registered Servers",
    icon: "i-heroicons-server-stack",
    to: "/admin/servers",
    separator: true,
  },
  {
    id: "logs",
    label: "Live Bot Logs",
    icon: "i-heroicons-document-text",
    to: "/admin/logs",
  },
];

// Keep sidebar registered and active tab synced with route
watch(
  activeTab,
  (tab) => {
    registerSidebar({
      guild: { id: "__admin__", name: "Bot Admin", icon: null },
      tabs: sidebarTabs,
      activeTab: tab,
    });
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    if (!userStore.isLoggedIn) {
      await userStore.fetchUserSession();
    }
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  unregisterSidebar();
});
</script>
