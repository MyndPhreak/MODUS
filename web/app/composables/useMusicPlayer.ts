interface TrackInfo {
  title: string;
  url: string;
  duration: string;
  durationMs: number;
  thumbnail: string;
  author: string;
  requestedBy: string;
}

interface PreQueueItem {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  author: string;
  addedBy: string;
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
}

interface SearchResult {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  author: string;
}

interface SearchResponse {
  results: SearchResult[];
  isPlaylist?: boolean;
  trackCount?: number;
  playlistTitle?: string;
}

const POLL_INTERVAL = 5000; // 5 seconds — reduced from 3s to ease event-loop pressure on the bot
const PROGRESS_TICK_INTERVAL = 1000; // Client-side progress estimation every 1s

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

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  // ── Fetch player state ──
  const fetchState = async () => {
    try {
      const data = (await $fetch("/api/music/state", {
        params: { guild_id: guildId },
      })) as PlayerState;

      state.value = data;
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
      const result = await $fetch("/api/music/action", {
        method: "POST",
        body: {
          guild_id: guildId,
          action,
          ...params,
        },
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
