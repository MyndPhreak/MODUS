<template>
  <div class="p-8 space-y-8">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-black text-white tracking-tight gradient-text">
        Global Modules
      </h1>
      <p class="text-gray-400 text-sm mt-1">
        Enable or disable modules globally for all servers. Server-specific
        settings can still override these if the module is enabled here.
      </p>
    </div>

    <!-- Loading -->
    <div v-if="modulesLoading" class="flex justify-center py-12">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-8 h-8 animate-spin text-violet-400"
      />
    </div>

    <!-- Empty -->
    <div
      v-else-if="modules.length === 0"
      class="glass-panel text-center py-16 rounded-3xl border-2 border-dashed border-white/8"
    >
      <UIcon
        name="i-heroicons-cube-transparent"
        class="w-12 h-12 text-gray-600 mx-auto mb-3"
      />
      <p class="text-gray-500">
        No modules found. Make sure the bot has registered them.
      </p>
      <UButton
        icon="i-heroicons-arrow-path"
        variant="ghost"
        class="mt-4"
        @click="fetchModules"
      >
        Refresh
      </UButton>
    </div>

    <!-- Modules list -->
    <div v-else class="space-y-3">
      <div
        v-for="module in modules"
        :key="module.$id"
        class="glass-card rounded-2xl p-5 flex items-center gap-4 border border-white/8 hover:border-white/15 transition-all duration-200"
      >
        <div
          class="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 flex-shrink-0"
        >
          <UIcon
            name="i-heroicons-squares-2x2"
            class="w-5 h-5 text-violet-400"
          />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-white truncate">{{ module.name }}</p>
          <p class="text-xs text-gray-500 truncate mt-0.5">
            {{ module.description }}
          </p>
        </div>
        <UBadge
          :color="module.enabled ? 'success' : 'neutral'"
          variant="soft"
          class="shrink-0"
        >
          {{ module.enabled ? "Active" : "Disabled" }}
        </UBadge>
        <USwitch
          v-model="module.enabled"
          :loading="updating === module.$id"
          @update:model-value="toggleModule(module)"
          class="shrink-0"
        />
      </div>
    </div>

    <!-- Admin Access Info -->
    <div
      class="glass-card rounded-2xl p-6 border border-violet-500/10 bg-violet-500/5"
    >
      <div class="flex items-center gap-3 mb-2">
        <UIcon
          name="i-heroicons-information-circle"
          class="w-5 h-5 text-violet-400 flex-shrink-0"
        />
        <h2 class="text-sm font-bold text-white">Admin Access</h2>
      </div>
      <p class="text-sm text-gray-400">
        Admin access is managed via Appwrite user labels. Users with the
        <UBadge color="primary" variant="soft" size="xs">admin</UBadge>
        label have access to this dashboard.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

const { databases } = useAppwrite();
const toast = useToast();

const modulesLoading = ref(false);
const modules = ref<any[]>([]);
const updating = ref<string | null>(null);

const databaseId = "discord_bot";
const collectionId = "modules";

const fetchModules = async () => {
  modulesLoading.value = true;
  try {
    const response = await databases.listDocuments(databaseId, collectionId);
    modules.value = response.documents;
  } catch (error) {
    console.error("Error fetching modules:", error);
  } finally {
    modulesLoading.value = false;
  }
};

const toggleModule = async (module: any) => {
  updating.value = module.$id;
  try {
    await databases.updateDocument(databaseId, collectionId, module.$id, {
      enabled: module.enabled,
    });
    toast.add({
      title: "Success",
      description: `Global status for ${module.name} updated.`,
      color: "success",
    });
  } catch (error) {
    console.error("Error updating module:", error);
    module.enabled = !module.enabled;
    toast.add({
      title: "Error",
      description: "Failed to update global module status.",
      color: "error",
    });
  } finally {
    updating.value = null;
  }
};

onMounted(() => fetchModules());
</script>

<style scoped>
.gradient-text {
  background: linear-gradient(to bottom right, #ffffff 30%, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
