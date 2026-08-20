<template>
  <div class="p-6 lg:p-8">
    <DashboardModuleAccessSection :guild-id="guildId" module-name="welcome" />
  </div>
  <!-- Full-bleed: no padding wrapper so the editor fills edge-to-edge -->
  <WelcomeEditor
    :guild-id="guildId"
    :channels="channels"
    :channels-loading="channelsLoading"
    class="h-full"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { state, loadChannels } = useServerSettings(guildId);
const { setFullBleed, reset: resetPageChrome } = usePageChrome();

const channels = computed(() => state.value.channels);
const channelsLoading = computed(() => state.value.channelsLoading);

onMounted(() => {
  loadChannels();
  setFullBleed(true);
});

onUnmounted(() => {
  resetPageChrome();
});
</script>
