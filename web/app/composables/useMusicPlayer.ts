interface MusicSource {
  name: string;
  uri?: string;
  identifier?: string;
}

interface TrackInfo {
  title: string;
  url: string;
  duration: string;
  durationMs: number;
  thumbnail: string;
  author: string;
  requestedBy: string;
  /** Durable queue entry id — stable across reorders, unlike the array index. */
  entryId?: string;
  requestedSource?: MusicSource;
  playbackSource?: MusicSource;
}

interface PreQueueItem {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  author: string;
  addedBy: string;
}

interface PlayerHealth {
  relay: "online" | "offline";
  nodeId: string | null;
  status: string;
  errorCode: string | null;
  source: string | null;
}

interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTrack: TrackInfo | null;
  queue: TrackInfo[];
  volume: number;
  repeatMode: number;
  progress: number;
  totalDuration: number;
  activeFilters: string[];
  voiceChannel: string | null;
  /** Durable queue revision; echoed back on index-bound mutations. */
  revision: number;
  status: string;
  nodeId: string | null;
  currentEntryId: string | null;
  filters: Record<string, unknown>;
  health: PlayerHealth;
}

interface SearchResult {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  author: string;
  requestedSource?: MusicSource;
  playbackSource?: MusicSource;
}

interface SearchResponse {
  results: SearchResult[];
  isPlaylist?: boolean;
  trackCount?: number;
  playlistTitle?: string;
}

const POLL_INTERVAL = 5000; // 5 seconds — reduced from 3s to ease event-loop pressure on the bot
const PROGRESS_TICK_INTERVAL = 1000; // Client-side progress estimation every 1s

/**
 * Mutations the bot dispatches as durable commands. Each carries an operation
 * ID so a replayed request (retry, double-click, proxy retry) is applied once.
 */
const MUTATING_ACTIONS = new Set([
  "play",
  "skip",
  "pause",
  "resume",
  "stop",
  "shuffle",
  "volume",
  "remove",
  "reorder",
]);

/**
 * Mutations whose meaning depends on the queue the user is looking at: an
 * index only identifies the right track against the revision it came from, so
 * these pin `expectedRevision` and the bot answers 409 if the queue moved.
 * The rest (skip, pause, volume, …) express intent regardless of ordering and
 * would only collect spurious conflicts from the 5s poll window.
 */
const REVISION_PINNED_ACTIONS = new Set(["remove", "reorder"]);

/** `crypto.randomUUID` needs a secure context; LAN dashboards may not have one. */
function newOperationId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const offlineHealth = (): PlayerHealth => ({
  relay: "offline",
  nodeId: null,
  status: "unavailable",
  errorCode: null,
  source: null,
});

export function useMusicPlayer(guildId: string) {
  const state = useState<PlayerState>(`music-player-${guildId}`, () => ({
    isPlaying: false,
    isPaused: false,
    currentTrack: null,
    queue: [],
    volume: 50,
    repeatMode: 0,
    progress: 0,
    totalDuration: 0,
    activeFilters: [],
    voiceChannel: null,
    revision: 0,
    status: "idle",
    nodeId: null,
    currentEntryId: null,
    filters: {},
    health: offlineHealth(),
  }));

  const preQueue = useState<PreQueueItem[]>(
    `music-prequeue-${guildId}`,
    () => [],
  );

  const loading = ref(true);
  const actionLoading = ref(false);
  const searchResults = ref<SearchResult[]>([]);
  const isPlaylistResult = ref(false);
  const playlistTrackCount = ref(0);
  const playlistTitle = ref<string | null>(null);
  const searchLoading = ref(false);
  const error = ref<string | null>(null);
  const connected = ref(false);

  /** true when the bot is actively in a voice channel with a queue */
  const isBotActive = computed(
    () => connected.value && (state.value.isPlaying || state.value.isPaused),
  );

  /** Durable queue revision the UI is currently rendering. */
  const revision = computed(() => state.value.revision);

  /** Relay/source health of the Lavalink player backing this guild. */
  const health = computed<PlayerHealth>(() => state.value.health ?? offlineHealth());
  const relayOnline = computed(() => health.value.relay === "online");
  /** Source actually serving the current track (youtube, soundcloud, …). */
  const playbackSource = computed(() => health.value.source);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  // ── Fetch player state ──
  const fetchState = async () => {
    try {
      const data = (await $fetch("/api/music/state", {
        params: { guild_id: guildId },
      })) as PlayerState;

      // Polls and post-action refreshes can land out of order. The durable
      // revision only ever moves forward, so an older snapshot is dropped
      // instead of flickering a just-mutated queue back to its prior shape.
      // An offline relay reports revision 0 and must still be applied — that
      // is the signal the player went away, not a stale response.
      const stale =
        data.health?.relay !== "offline" &&
        typeof data.revision === "number" &&
        data.revision < state.value.revision;

      if (!stale) {
        state.value = { ...data, health: data.health ?? offlineHealth() };
      }
      connected.value = true;
      error.value = null;
    } catch (err: any) {
      connected.value = false;
      error.value = err?.data?.message || err?.message || "Could not reach bot";
    } finally {
      loading.value = false;
    }
  };

  // ── Client-side progress estimation ──
  // Ticks progress forward locally every second while playing, so the
  // progress bar stays smooth without needing a server poll each second.
  const startProgressEstimation = () => {
    if (progressTimer) return;
    progressTimer = setInterval(() => {
      if (
        state.value.isPlaying &&
        !state.value.isPaused &&
        state.value.currentTrack
      ) {
        const newProgress = state.value.progress + PROGRESS_TICK_INTERVAL;
        if (newProgress <= state.value.totalDuration) {
          state.value = { ...state.value, progress: newProgress };
        }
      }
    }, PROGRESS_TICK_INTERVAL);
  };

  const stopProgressEstimation = () => {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  };

  // ── Fetch pre-queue ──
  const fetchPreQueue = async () => {
    try {
      const data = (await $fetch("/api/music/prequeue", {
        params: { guild_id: guildId },
      })) as { preQueue: PreQueueItem[] };
      preQueue.value = data.preQueue || [];
    } catch {
      // Silently fail — pre-queue is optional
    }
  };

  // ── Send action to bot ──
  const sendAction = async (
    action: string,
    params: Record<string, any> = {},
  ): Promise<any> => {
    actionLoading.value = true;
    error.value = null;
    try {
      const body: Record<string, any> = {
        guild_id: guildId,
        action,
        ...params,
      };
      if (MUTATING_ACTIONS.has(action) && !body.operationId) {
        body.operationId = newOperationId();
      }
      if (REVISION_PINNED_ACTIONS.has(action) && body.expectedRevision === undefined) {
        body.expectedRevision = state.value.revision;
      }

      const result = await $fetch("/api/music/action", {
        method: "POST",
        body,
      });
      // Immediately refresh state after action
      await fetchState();
      return result;
    } catch (err: any) {
      error.value =
        err?.data?.message ||
        err?.statusMessage ||
        err?.message ||
        "Action failed";
      // 409 means the queue moved under this click. Resync so the next attempt
      // is made against what the server actually holds.
      if (err?.statusCode === 409 || err?.status === 409) {
        await fetchState();
      }
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  // ── Live queue Controls ──
  const skip = () => sendAction("skip");
  const pause = () => sendAction("pause");
  const resume = () => sendAction("resume");
  const stop = () => sendAction("stop");
  const shuffle = () => sendAction("shuffle");
  const setVolume = (volume: number) => sendAction("volume", { volume });
  const removeTrack = (index: number) => sendAction("remove", { index });
  const reorderTrack = (from: number, to: number) =>
    sendAction("reorder", { from, to });
  const play = (query: string) => sendAction("play", { query });

  // ── Pre-queue Controls ──
  const addToPreQueue = async (query: string): Promise<any> => {
    actionLoading.value = true;
    error.value = null;
    try {
      const result = await $fetch("/api/music/action", {
        method: "POST",
        body: {
          guild_id: guildId,
          action: "prequeue-add",
          query,
        },
      });
      await fetchPreQueue();
      return result;
    } catch (err: any) {
      error.value =
        err?.data?.message ||
        err?.statusMessage ||
        err?.message ||
        "Failed to add";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const removeFromPreQueue = async (index: number): Promise<any> => {
    actionLoading.value = true;
    try {
      const result = await sendAction("prequeue-remove", { index });
      await fetchPreQueue();
      return result;
    } catch (err: any) {
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const reorderPreQueue = async (from: number, to: number): Promise<any> => {
    actionLoading.value = true;
    try {
      const result = await sendAction("prequeue-reorder", { from, to });
      await fetchPreQueue();
      return result;
    } catch (err: any) {
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const clearPreQueue = async (): Promise<any> => {
    actionLoading.value = true;
    try {
      const result = await sendAction("prequeue-clear");
      preQueue.value = [];
      return result;
    } catch (err: any) {
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  // ── Search ──
  const search = async (query: string) => {
    if (!query || query.length < 2) {
      searchResults.value = [];
      isPlaylistResult.value = false;
      playlistTrackCount.value = 0;
      playlistTitle.value = null;
      return;
    }
    searchLoading.value = true;
    try {
      const result = (await $fetch("/api/music/action", {
        method: "POST",
        body: {
          guild_id: guildId,
          action: "search",
          query,
        },
      })) as SearchResponse;
      searchResults.value = result.results || [];
      isPlaylistResult.value = result.isPlaylist ?? false;
      playlistTrackCount.value = result.trackCount ?? 0;
      playlistTitle.value = result.playlistTitle ?? null;
    } catch {
      searchResults.value = [];
      isPlaylistResult.value = false;
      playlistTrackCount.value = 0;
      playlistTitle.value = null;
    } finally {
      searchLoading.value = false;
    }
  };

  const clearSearch = () => {
    searchResults.value = [];
    isPlaylistResult.value = false;
    playlistTrackCount.value = 0;
    playlistTitle.value = null;
  };

  // ── Polling lifecycle ──
  const startPolling = () => {
    if (pollTimer) return;
    fetchState();
    fetchPreQueue();
    pollTimer = setInterval(() => {
      fetchState();
      // Only poll pre-queue when bot is NOT active (less frequent)
      if (!isBotActive.value) {
        fetchPreQueue();
      }
    }, POLL_INTERVAL);
    startProgressEstimation();
  };

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    stopProgressEstimation();
  };

  onMounted(() => {
    startPolling();
  });

  onUnmounted(() => {
    stopPolling();
  });

  return {
    // State
    state: readonly(state),
    preQueue: readonly(preQueue),
    loading: readonly(loading),
    actionLoading: readonly(actionLoading),
    searchResults: readonly(searchResults),
    searchLoading: readonly(searchLoading),
    isPlaylistResult: readonly(isPlaylistResult),
    playlistTrackCount: readonly(playlistTrackCount),
    playlistTitle: readonly(playlistTitle),
    error: readonly(error),
    connected: readonly(connected),
    isBotActive,

    // Durable player state
    revision,
    health,
    relayOnline,
    playbackSource,

    // Live queue controls
    skip,
    pause,
    resume,
    stop,
    shuffle,
    setVolume,
    removeTrack,
    reorderTrack,
    play,
    search,
    clearSearch,

    // Pre-queue controls
    addToPreQueue,
    removeFromPreQueue,
    reorderPreQueue,
    clearPreQueue,

    // Polling
    startPolling,
    stopPolling,
    fetchState,
    fetchPreQueue,
  };
}
