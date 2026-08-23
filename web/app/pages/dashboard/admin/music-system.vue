<template>
  <div class="p-8 space-y-8">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-black text-white tracking-tight gradient-text">
        Music System
      </h1>
      <p class="text-gray-400 text-sm mt-1">
        Fleet-wide switch for music playback. The Lavalink health check
        disables this automatically when YouTube extraction breaks across
        every node; re-enabling here is the only way to turn it back on.
      </p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon
        name="i-lucide-loader-circle"
        class="w-8 h-8 animate-spin text-violet-400"
      />
    </div>

    <!-- Status card -->
    <div
      v-else
      class="glass-card rounded-2xl p-5 flex items-center gap-4 border border-white/8"
    >
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-white">
          Music playback is
          <span :class="status.enabled ? 'text-emerald-400' : 'text-red-400'">
            {{ status.enabled ? "enabled" : "disabled" }}
          </span>
        </p>
        <p class="text-xs text-gray-500 mt-0.5">
          Last changed: {{ status.reason ?? "unknown reason" }}
          <template v-if="status.updatedAt">
            — {{ new Date(status.updatedAt).toLocaleString() }}
          </template>
        </p>
      </div>
      <UBadge
        :color="status.enabled ? 'success' : 'error'"
        variant="soft"
        class="shrink-0"
      >
        {{ status.enabled ? "Active" : "Disabled" }}
      </UBadge>
      <USwitch
        :model-value="status.enabled"
        :loading="updating"
        @update:model-value="(value) => requestToggle(Boolean(value))"
        class="shrink-0"
      />
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

interface MusicSystemStatus {
  enabled: boolean;
  reason: string | null;
  updatedAt: string | null;
}

const toast = useToast();

const loading = ref(false);
const updating = ref(false);
const status = ref<MusicSystemStatus>({ enabled: true, reason: null, updatedAt: null });

const fetchStatus = async () => {
  loading.value = true;
  try {
    status.value = await $fetch<MusicSystemStatus>("/api/admin/music-system");
  } catch (error) {
    console.error("Error fetching music system status:", error);
  } finally {
    loading.value = false;
  }
};

const confirmOpen = ref(false);
const pendingEnabled = ref(true);
const reason = ref("");
const submitting = ref(false);

const confirmTitle = computed(
  () => `${pendingEnabled.value ? "Enable" : "Disable"} music playback?`,
);
const confirmDescription = computed(() =>
  pendingEnabled.value
    ? "This re-enables music playback fleet-wide. A reason is optional."
    : "This disables music playback fleet-wide for every server. A reason is required.",
);

const requestToggle = (enabled: boolean) => {
  pendingEnabled.value = enabled;
  reason.value = "";
  confirmOpen.value = true;
};

const submitToggle = async () => {
  if (pendingEnabled.value === false && !reason.value.trim()) return;

  submitting.value = true;
  updating.value = true;
  try {
    const response = await $fetch<{
      success: true;
      auditEventId: string;
      syncWarning?: string;
    }>("/api/admin/music-system", {
      method: "PATCH",
      body: {
        enabled: pendingEnabled.value,
        reason: reason.value.trim() || undefined,
      },
    });
    confirmOpen.value = false;
    toast.add({
      title: response.syncWarning ? "Saved with a warning" : "Success",
      description:
        response.syncWarning ??
        `Music system ${pendingEnabled.value ? "enabled" : "disabled"}.`,
      color: response.syncWarning ? "warning" : "success",
    });
    await fetchStatus();
  } catch (error) {
    console.error("Error updating music system status:", error);
    toast.add({
      title: "Error",
      description: "Failed to update the music system switch.",
      color: "error",
    });
  } finally {
    submitting.value = false;
    updating.value = false;
  }
};

onMounted(() => fetchStatus());
</script>

<style scoped>
.gradient-text {
  background: linear-gradient(to bottom right, #ffffff 30%, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
