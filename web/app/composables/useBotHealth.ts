import { ref, onMounted, onUnmounted } from "vue";

interface BotHealthState {
  online: boolean;
  latency: number;
  lastChecked: Date | null;
  checking: boolean;
}

// Shared state across all component instances
const state = ref<BotHealthState>({
  online: false,
  latency: 0,
  lastChecked: null,
  checking: false,
});

let pollInterval: ReturnType<typeof setInterval> | null = null;
let subscriberCount = 0;

const POLL_INTERVAL_MS = 30_000; // 30 seconds

async function checkHealth() {
  // Avoid overlapping checks
  if (state.value.checking) return;

  state.value.checking = true;

  try {
    const data = await $fetch<{
      online: boolean;
      latency: number;
      error?: string;
    }>("/api/bot-health");

    state.value.online = data.online;
    state.value.latency = data.latency;
    state.value.lastChecked = new Date();
  } catch {
    state.value.online = false;
    state.value.latency = 0;
  } finally {
    state.value.checking = false;
  }
}

export function useBotHealth() {
  onMounted(() => {
    subscriberCount++;

    // Start polling only if this is the first subscriber
    if (subscriberCount === 1) {
      checkHealth(); // Immediate check
      pollInterval = setInterval(checkHealth, POLL_INTERVAL_MS);
    }
  });

  onUnmounted(() => {
    subscriberCount--;

    // Stop polling when no one is listening
    if (subscriberCount === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });

  return {
    /** Whether the bot's health check endpoint is reachable */
    botHealthOnline: computed(() => state.value.online),
    /** Round-trip latency in ms to the bot health endpoint */
    botLatency: computed(() => state.value.latency),
    /** Last time the health check ran */
    lastHealthCheck: computed(() => state.value.lastChecked),
    /** Whether a health check is currently in progress */
    healthChecking: computed(() => state.value.checking),
    /** Manually trigger a health check */
    recheckHealth: checkHealth,
  };
}
