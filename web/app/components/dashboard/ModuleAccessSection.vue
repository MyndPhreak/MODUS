<template>
  <section v-if="state.isServerOwnerOrAdmin">
    <div class="mb-4">
      <h2 class="text-lg font-bold text-white">Module Access</h2>
      <p class="text-sm text-gray-400">
        Grant specific Discord roles access to just this module's settings
        page, without making them a full dashboard admin.
      </p>
    </div>

    <UCard :ui="{ root: 'border border-white/10 bg-white/[0.02]' }">
      <div class="space-y-4">
        <div v-if="state.rolesLoading || loadingGrant" class="flex items-center gap-2 py-3">
          <UIcon
            name="i-lucide-loader-circle"
            class="w-4 h-4 animate-spin text-indigo-400"
          />
          <span class="text-sm text-gray-400">Loading server roles from Discord...</span>
        </div>

        <USelectMenu
          v-else-if="roleOptions.length > 0"
          v-model="selectedRoles"
          :items="roleOptions"
          value-key="value"
          multiple
          placeholder="Select roles..."
          class="w-full"
          @update:model-value="dirty = true"
        />
        <p v-else class="text-sm text-gray-500 py-2">
          No roles available. Make sure the bot is in this server.
        </p>

        <div class="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <p class="text-xs text-gray-500">
            {{ selectedRoles.length }} role{{ selectedRoles.length !== 1 ? "s" : "" }} selected
          </p>
          <UButton
            color="primary"
            size="sm"
            :loading="saving"
            :disabled="!dirty || loadingGrant"
            @click="handleSave"
          >
            Save Access
          </UButton>
        </div>
      </div>
    </UCard>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  guildId: string;
  moduleName: string;
}>();

const { state, loadRoles, roleOptions } = useServerSettings(props.guildId);
const toast = useToast();

const selectedRoles = ref<string[]>([]);
const dirty = ref(false);
const saving = ref(false);
const loadingGrant = ref(true);

onMounted(async () => {
  if (!state.value.isServerOwnerOrAdmin) return;
  await loadRoles();
  try {
    const current = await $fetch<{ roleIds: string[] }>(
      `/api/module-access/${encodeURIComponent(props.guildId)}/${encodeURIComponent(props.moduleName)}`,
    );
    selectedRoles.value = current.roleIds;
  } catch (error) {
    console.error("Error loading module access:", error);
  } finally {
    loadingGrant.value = false;
  }
});

const handleSave = async () => {
  saving.value = true;
  try {
    await $fetch(
      `/api/module-access/${encodeURIComponent(props.guildId)}/${encodeURIComponent(props.moduleName)}`,
      { method: "PUT", body: { roleIds: selectedRoles.value } },
    );
    dirty.value = false;
    toast.add({
      title: "Module Access Updated",
      description: `Roles with access to the ${props.moduleName} settings page have been updated.`,
      color: "success",
    });
  } catch (error) {
    console.error("Error saving module access:", error);
    toast.add({
      title: "Error",
      description: "Failed to update module access.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
};
</script>
