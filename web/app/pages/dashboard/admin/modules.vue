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
        name="i-lucide-loader-circle"
        class="w-8 h-8 animate-spin text-violet-400"
      />
    </div>

    <!-- Empty -->
    <div
      v-else-if="modules.length === 0"
      class="glass-panel text-center py-16 rounded-3xl border-2 border-dashed border-white/8"
    >
      <UIcon
        name="i-lucide-package-open"
        class="w-12 h-12 text-gray-600 mx-auto mb-3"
      />
      <p class="text-gray-500">
        No modules found. Make sure the bot has registered them.
      </p>
      <UButton
        icon="i-lucide-loader-circle"
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
          class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          :class="getModuleDisplay(module).bgClass"
        >
          <UIcon
            :name="getModuleDisplay(module).icon"
            class="w-5 h-5"
            :class="getModuleDisplay(module).iconClass"
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
          :model-value="module.enabled"
          :loading="updating === module.$id"
          @update:model-value="(value) => requestToggle(module, Boolean(value))"
          class="shrink-0"
        />
      </div>
    </div>

    <!-- Toggle confirmation -->
    <UModal v-model:open="confirmOpen" :title="confirmTitle">
      <template #body>
        <div class="space-y-4 p-1">
          <p class="text-sm text-gray-400">{{ confirmDescription }}</p>
          <UFormField
            label="Reason"
            :required="pendingEnabled === false"
            :hint="pendingEnabled === false ? undefined : 'Optional'"
          >
            <UTextarea
              v-model="reason"
              placeholder="Why is this changing?"
              class="w-full"
              :rows="3"
            />
          </UFormField>
        </div>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="confirmOpen = false">Cancel</UButton>
          <UButton
            :color="pendingEnabled === false ? 'error' : 'primary'"
            :loading="submitting"
            :disabled="pendingEnabled === false && !reason.trim()"
            @click="submitToggle"
          >
            {{ pendingEnabled === false ? "Disable" : "Enable" }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Admin Access Info -->
    <div
      class="glass-card rounded-2xl p-6 border border-violet-500/10 bg-violet-500/5"
    >
      <div class="flex items-center gap-3 mb-2">
        <UIcon
          name="i-lucide-info"
          class="w-5 h-5 text-violet-400 flex-shrink-0"
        />
        <h2 class="text-sm font-bold text-white">Admin Access</h2>
      </div>
      <p class="text-sm text-gray-400">
        Admin access is managed via the
        <code class="text-xs bg-gray-800 px-1.5 py-0.5 rounded">
          NUXT_PUBLIC_BOT_ADMIN_IDS
        </code>
        env var. Discord user IDs listed there get access to this
        dashboard.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { ModuleDoc } from "@modus/db";
import { getModuleDisplay } from "~/utils/module-metadata";

const toast = useToast();

const modulesLoading = ref(false);
const modules = ref<ModuleDoc[]>([]);
const updating = ref<string | null>(null);

const fetchModules = async () => {
  modulesLoading.value = true;
  try {
    modules.value = await $fetch<ModuleDoc[]>("/api/modules");
  } catch (error) {
    console.error("Error fetching modules:", error);
  } finally {
    modulesLoading.value = false;
  }
};

const confirmOpen = ref(false);
const pendingModule = ref<ModuleDoc | null>(null);
const pendingEnabled = ref(true);
const reason = ref("");
const submitting = ref(false);

const confirmTitle = computed(() =>
  pendingModule.value
    ? `${pendingEnabled.value ? "Enable" : "Disable"} ${pendingModule.value.name}?`
    : "",
);
const confirmDescription = computed(() =>
  pendingEnabled.value
    ? "This re-enables the module fleet-wide for every server. A reason is optional."
    : "This disables the module fleet-wide for every server. A reason is required.",
);

const requestToggle = (module: ModuleDoc, enabled: boolean) => {
  pendingModule.value = module;
  pendingEnabled.value = enabled;
  reason.value = "";
  confirmOpen.value = true;
};

const submitToggle = async () => {
  const module = pendingModule.value;
  if (!module || (pendingEnabled.value === false && !reason.value.trim())) return;

  submitting.value = true;
  updating.value = module.$id;
  try {
    const response = await $fetch<{
      success: true;
      auditEventId: string;
      syncWarning?: string;
    }>(`/api/modules/${encodeURIComponent(module.name)}`, {
      method: "PATCH",
      body: {
        enabled: pendingEnabled.value,
        reason: reason.value.trim() || undefined,
      },
    });
    module.enabled = pendingEnabled.value;
    confirmOpen.value = false;
    toast.add({
      title: response.syncWarning ? "Saved with a warning" : "Success",
      description:
        response.syncWarning ?? `Global status for ${module.name} updated.`,
      color: response.syncWarning ? "warning" : "success",
    });
  } catch (error) {
    console.error("Error updating module:", error);
    toast.add({
      title: "Error",
      description: "Failed to update global module status.",
      color: "error",
    });
  } finally {
    submitting.value = false;
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
