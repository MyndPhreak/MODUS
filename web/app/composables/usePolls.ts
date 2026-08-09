/**
 * usePolls — dashboard CRUD for poll templates, sending polls, and a live
 * running-polls view patched in place via the poll-votes SSE channel.
 */

export interface PollTemplate {
  id: string;
  guildId: string;
  name: string;
  question: string;
  options: string[];
  durationHours: number;
  allowMultiselect: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface RunningPollOption {
  text: string;
  votes: number;
}

export interface RunningPoll {
  id: string;
  channelId: string;
  messageId: string;
  question: string;
  options: RunningPollOption[];
  totalVotes: number;
  expiresAt: string;
  source: "slash" | "dashboard";
  createdBy: string | null;
}

interface PollVoteEvent {
  guildId: string;
  channelId: string;
  messageId: string;
  answerId: number;
  voterId: string;
  added: boolean;
}

export function usePolls(guildId: string) {
  const templates = useState<PollTemplate[]>(`poll-templates-${guildId}`, () => []);
  const runningPolls = useState<RunningPoll[]>(`running-polls-${guildId}`, () => []);
  const loading = ref(true);
  const actionLoading = ref(false);
  const error = ref<string | null>(null);
  const realtimeAvailable = ref(true);
  let eventSource: EventSource | null = null;

  const fetchTemplates = async () => {
    error.value = null;
    try {
      const data = (await $fetch("/api/polls/templates/list", {
        params: { guild_id: guildId },
      })) as { templates: PollTemplate[] };
      templates.value = data.templates;
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to load templates";
    }
  };

  const fetchRunningPolls = async () => {
    error.value = null;
    try {
      const data = (await $fetch("/api/polls/list", {
        params: { guild_id: guildId },
      })) as { polls: RunningPoll[] };
      runningPolls.value = data.polls;
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to load running polls";
    }
  };

  const createTemplate = async (data: {
    name: string;
    question: string;
    options: string[];
    duration_hours: number;
    allow_multiselect: boolean;
  }) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/polls/templates/create", {
        method: "POST",
        body: { guild_id: guildId, ...data },
      });
      await fetchTemplates();
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to create template";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const updateTemplate = async (templateId: string, data: Record<string, any>) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/polls/templates/update", {
        method: "PUT",
        body: { template_id: templateId, data },
      });
      await fetchTemplates();
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to update template";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const deleteTemplate = async (templateId: string) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/polls/templates/delete", {
        method: "POST",
        body: { template_id: templateId },
      });
      await fetchTemplates();
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to delete template";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const sendPoll = async (data: {
    channel_id: string;
    template_id?: string;
    question?: string;
    options?: string[];
    duration_hours?: number;
    allow_multiselect?: boolean;
  }) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/polls/send", {
        method: "POST",
        body: { guild_id: guildId, ...data },
      });
      await fetchRunningPolls();
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || "Failed to send poll";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  // Patch a running poll's tally in place from a pushed vote event, instead
  // of refetching the whole list on every vote.
  const applyVoteEvent = (evt: PollVoteEvent) => {
    if (evt.guildId !== guildId) return;
    const poll = runningPolls.value.find((p) => p.messageId === evt.messageId);
    if (!poll) return;
    const option = poll.options[evt.answerId - 1];
    if (!option) return;
    const delta = evt.added ? 1 : -1;
    option.votes = Math.max(0, option.votes + delta);
    poll.totalVotes = Math.max(0, poll.totalVotes + delta);
  };

  const connectRealtime = () => {
    if (eventSource) return;
    eventSource = new EventSource(
      `/api/events/poll-votes?guild_id=${encodeURIComponent(guildId)}`,
    );
    eventSource.onmessage = (msg) => {
      try {
        applyVoteEvent(JSON.parse(msg.data) as PollVoteEvent);
      } catch {
        // Ignore malformed frames (e.g. heartbeat comments never reach
        // onmessage, but be defensive against future payload changes).
      }
    };
    eventSource.onerror = () => {
      // EventSource auto-reconnects on transient drops (proxy idle
      // timeouts, brief Redis hiccups, laptop sleep) — readyState stays
      // CONNECTING while it retries, so leave realtimeAvailable alone and
      // don't tear down the reference. Only treat it as fatal once the
      // browser itself has given up (readyState CLOSED), which happens on
      // e.g. the initial 503/401 the server throws when realtime isn't
      // configured or the caller lacks access.
      if (eventSource?.readyState === EventSource.CLOSED) {
        realtimeAvailable.value = false;
        eventSource?.close();
        eventSource = null;
      }
    };
  };

  onMounted(async () => {
    loading.value = true;
    await Promise.all([fetchTemplates(), fetchRunningPolls()]);
    loading.value = false;
    connectRealtime();
  });

  onUnmounted(() => {
    eventSource?.close();
    eventSource = null;
  });

  return {
    templates: readonly(templates),
    runningPolls: readonly(runningPolls),
    loading: readonly(loading),
    actionLoading: readonly(actionLoading),
    error: readonly(error),
    realtimeAvailable: readonly(realtimeAvailable),

    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    fetchRunningPolls,
    sendPoll,
  };
}
