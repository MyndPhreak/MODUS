<template>
  <div class="h-full">
    <WelcomeEditor
      :guild-id="guildId"
      :channels="channels"
      :channels-loading="channelsLoading"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { state, loadChannels } = useServerSettings(guildId);

const channels = computed(() => state.value.channels);
const channelsLoading = computed(() => state.value.channelsLoading);

onMounted(() => {
  loadChannels();
});
</script>
