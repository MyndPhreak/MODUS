<template>
  <div class="p-6 lg:p-8 space-y-8">
    <!-- Header -->
    <section>
      <h2 class="text-xl font-semibold mb-1">Command Modules</h2>
      <p class="text-sm text-gray-500">
        Enable or disable specific bot modules for this server. Click
        "Configure" to customise each module's settings.
      </p>
    </section>

    <!-- Module Grid -->
    <section>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="module in state.modules"
          :key="module.$id"
          class="group relative rounded-xl border bg-white/[0.03] p-4 flex flex-col gap-3 transition-all duration-200 hover:bg-white/[0.06]"
          :class="
            isModuleEnabled(module.name)
              ? 'border-white/15'
              : 'border-white/[0.07] opacity-70'
          "
        >
          <!-- Top row: Icon + Toggle -->
          <div class="flex items-start justify-between">
            <div
              class="p-2.5 rounded-xl"
              :class="moduleStyle(module.name).bgClass"
            >
              <UIcon
                :name="moduleStyle(module.name).icon"
                class="w-5 h-5"
                :class="moduleStyle(module.name).iconClass"
              />
            </div>
            <USwitch
              :model-value="isModuleEnabled(module.name)"
              @update:model-value="
                (val: boolean) => handleToggle(module.name, val)
              "
              :loading="updating === module.name"
            />
          </div>

          <!-- Name + Status -->
          <div class="flex items-center gap-2">
            <span class="font-semibold text-sm text-white">{{
              module.name
            }}</span>
            <span
              class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              :class="
                isModuleEnabled(module.name)
                  ? 'bg-emerald-400'
                  : 'bg-gray-600'
              "
            />
          </div>

          <!-- Description -->
          <p class="text-xs text-gray-500 leading-relaxed line-clamp-2 flex-1">
            {{ module.description }}
          </p>

          <!-- Configure link (bottom) -->
          <NuxtLink
            v-if="hasModuleSettings(module.name)"
            :to="`/dashboard/server/${guildId}/modules/${module.name.toLowerCase()}`"
            class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-primary-400 transition-colors duration-150 mt-auto pt-2 border-t border-white/[0.06]"
          >
            <UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5" />
            Configure
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Danger Zone -->
    <section>
      <h2 class="text-base font-semibold mb-3 text-red-400">Danger Zone</h2>
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
    logging: {
      icon: "i-heroicons-clipboard-document-list",
      bgClass: "bg-cyan-500/10 border border-cyan-500/20",
      iconClass: "text-cyan-400",
    },
    triggers: {
      icon: "i-heroicons-bolt",
      bgClass: "bg-emerald-500/10 border border-emerald-500/20",
      iconClass: "text-emerald-400",
    },
    antiraid: {
      icon: "i-heroicons-shield-check",
      bgClass: "bg-rose-500/10 border border-rose-500/20",
      iconClass: "text-rose-400",
    },
    verification: {
      icon: "i-heroicons-check-badge",
      bgClass: "bg-green-500/10 border border-green-500/20",
      iconClass: "text-green-400",
    },
    tickets: {
      icon: "i-heroicons-ticket",
      bgClass: "bg-sky-500/10 border border-sky-500/20",
      iconClass: "text-sky-400",
    },
    alerts: {
      icon: "i-heroicons-bell-alert",
      bgClass: "bg-pink-500/10 border border-pink-500/20",
      iconClass: "text-pink-400",
    },
    tempvoice: {
      icon: "i-heroicons-speaker-wave",
      bgClass: "bg-indigo-500/10 border border-indigo-500/20",
      iconClass: "text-indigo-400",
    },
    "reaction-roles": {
      icon: "i-heroicons-face-smile",
      bgClass: "bg-yellow-500/10 border border-yellow-500/20",
      iconClass: "text-yellow-400",
    },
    events: {
      icon: "i-heroicons-calendar-days",
      bgClass: "bg-teal-500/10 border border-teal-500/20",
      iconClass: "text-teal-400",
    },
    polls: {
      icon: "i-heroicons-chart-bar",
      bgClass: "bg-fuchsia-500/10 border border-fuchsia-500/20",
      iconClass: "text-fuchsia-400",
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
