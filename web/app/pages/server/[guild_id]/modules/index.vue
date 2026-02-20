<template>
  <div class="p-6 lg:p-8 space-y-6">
    <section>
      <h2 class="text-xl font-semibold mb-4">Command Modules</h2>
      <p class="text-sm text-gray-500 mb-6">
        Enable or disable specific bot modules for this server. Click
        "Configure" to customise each module's settings.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <UCard v-for="module in state.modules" :key="module.$id">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div
                  class="p-1.5 rounded-lg"
                  :class="moduleStyle(module.name).bgClass"
                >
                  <UIcon
                    :name="moduleStyle(module.name).icon"
                    :class="moduleStyle(module.name).iconClass"
                  />
                </div>
                <span class="font-semibold">{{ module.name }}</span>
              </div>
              <UBadge
                :color="isModuleEnabled(module.name) ? 'success' : 'neutral'"
                variant="soft"
              >
                {{ isModuleEnabled(module.name) ? "Active" : "Disabled" }}
              </UBadge>
            </div>
          </template>

          <p
            class="text-xs text-gray-600 dark:text-gray-400 mb-4 h-8 overflow-hidden"
          >
            {{ module.description }}
          </p>

          <!-- Configure Link -->
          <NuxtLink
            v-if="hasModuleSettings(module.name)"
            :to="`/server/${guildId}/modules/${module.name.toLowerCase()}`"
            class="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 bg-white/5 border border-white/10 text-gray-300 hover:bg-primary-500/10 hover:text-primary-400 hover:border-primary-500/20 mb-2"
          >
            <UIcon name="i-heroicons-cog-6-tooth" class="text-sm" />
            Configure
          </NuxtLink>

          <template #footer>
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">Enabled</span>
              <USwitch
                :model-value="isModuleEnabled(module.name)"
                @update:model-value="
                  (val: boolean) => handleToggle(module.name, val)
                "
                :loading="updating === module.name"
              />
            </div>
          </template>
        </UCard>
      </div>
    </section>

    <!-- Danger Zone -->
    <section class="mt-8">
      <h2 class="text-xl font-semibold mb-4 text-red-400">Danger Zone</h2>
      <UCard
        :ui="{
          root: 'border border-red-500/20',
        }"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-white">Remove Server</h3>
            <p class="text-sm text-gray-400">
              Remove this server from your dashboard. This will delete all
              configurations and logs for this server.
            </p>
          </div>
          <UButton
            color="error"
            variant="soft"
            icon="i-heroicons-trash"
            @click="showRemoveConfirm = true"
            :loading="removing"
          >
            Remove
          </UButton>
        </div>
      </UCard>
    </section>

    <!-- Remove Confirmation Modal -->
    <UModal v-model:open="showRemoveConfirm">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-red-500/20 border border-red-500/30">
              <UIcon
                name="i-heroicons-exclamation-triangle"
                class="w-6 h-6 text-red-400"
              />
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">Remove Server</h3>
              <p class="text-sm text-gray-400">This action cannot be undone</p>
            </div>
          </div>

          <p class="text-gray-300">
            Are you sure you want to remove
            <strong>{{ state.guild?.name }}</strong> from your dashboard? All
            module configurations and logs for this server will be permanently
            deleted.
          </p>

          <div class="flex justify-end gap-3 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showRemoveConfirm = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              @click="handleRemove"
              :loading="removing"
              icon="i-heroicons-trash"
            >
              Remove Server
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const {
  state,
  isModuleEnabled,
  hasModuleSettings,
  toggleModule,
  removeServer,
} = useServerSettings(guildId);

const updating = ref<string | null>(null);
const showRemoveConfirm = ref(false);
const removing = ref(false);

const handleToggle = async (moduleName: string, enabled: boolean) => {
  updating.value = moduleName;
  await toggleModule(moduleName, enabled);
  updating.value = null;
};

const handleRemove = async () => {
  removing.value = true;
  await removeServer();
  removing.value = false;
};

// Module styling map
const moduleStyle = (name: string) => {
  const styles: Record<
    string,
    { icon: string; bgClass: string; iconClass: string }
  > = {
    music: {
      icon: "i-heroicons-musical-note",
      bgClass: "bg-violet-500/10 border border-violet-500/20",
      iconClass: "text-violet-400",
    },
    moderation: {
      icon: "i-heroicons-shield-exclamation",
      bgClass: "bg-blue-500/10 border border-blue-500/20",
      iconClass: "text-blue-400",
    },
    fun: {
      icon: "i-heroicons-face-smile",
      bgClass: "bg-amber-500/10 border border-amber-500/20",
      iconClass: "text-amber-400",
    },
    utility: {
      icon: "i-heroicons-wrench-screwdriver",
      bgClass: "bg-emerald-500/10 border border-emerald-500/20",
      iconClass: "text-emerald-400",
    },
    recording: {
      icon: "i-heroicons-microphone",
      bgClass: "bg-red-500/10 border border-red-500/20",
      iconClass: "text-red-400",
    },
    milestones: {
      icon: "i-heroicons-trophy",
      bgClass: "bg-amber-500/10 border border-amber-500/20",
      iconClass: "text-amber-400",
    },
    automod: {
      icon: "i-heroicons-funnel",
      bgClass: "bg-orange-500/10 border border-orange-500/20",
      iconClass: "text-orange-400",
    },
    ai: {
      icon: "i-heroicons-cpu-chip",
      bgClass: "bg-violet-500/10 border border-violet-500/20",
      iconClass: "text-violet-400",
    },
  };
  return (
    styles[name.toLowerCase()] || {
      icon: "i-heroicons-cube",
      bgClass: "bg-gray-500/10 border border-gray-500/20",
      iconClass: "text-gray-400",
    }
  );
};
</script>
