/**
 * useTriggers — Composable for managing webhook triggers from the dashboard.
 *
 * Provides CRUD operations against the Nuxt server-side API routes
 * which in turn talk to Appwrite.
 */

export interface TriggerDocument {
  $id: string;
  guild_id: string;
  name: string;
  secret: string;
  provider: "webhook" | "github" | "twitch";
  channel_id: string;
  embed_template: string | null;
  filters: string | null;
  created_by: string | null;
  created_at: string | null;
  enabled: boolean;
}

export function useTriggers(guildId: string) {
  const triggers = useState<TriggerDocument[]>(`triggers-${guildId}`, () => []);
  const loading = ref(true);
  const actionLoading = ref(false);
  const error = ref<string | null>(null);

  // ── Fetch all triggers for the guild ──
  const fetchTriggers = async () => {
    loading.value = true;
    error.value = null;
    try {
      const data = (await $fetch("/api/triggers/list", {
        params: { guild_id: guildId },
      })) as { documents: TriggerDocument[]; total: number };
      triggers.value = data.documents;
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to load triggers";
    } finally {
      loading.value = false;
    }
  };

  // ── Create a new trigger ──
  const createTrigger = async (data: {
    name: string;
    provider: "webhook" | "github" | "twitch";
    channel_id: string;
  }) => {
    actionLoading.value = true;
    error.value = null;
    try {
      const secret = crypto.randomUUID();
      await $fetch("/api/triggers/create", {
        method: "POST",
        body: {
          guild_id: guildId,
          name: data.name,
          secret,
          provider: data.provider,
          channel_id: data.channel_id,
        },
      });
      await fetchTriggers();
      return secret;
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to create trigger";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  // ── Delete a trigger ──
  const deleteTrigger = async (triggerId: string) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/triggers/delete", {
        method: "POST",
        body: { trigger_id: triggerId },
      });
      await fetchTriggers();
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to delete trigger";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  // ── Toggle enabled/disabled ──
  const toggleTrigger = async (triggerId: string, enabled: boolean) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/triggers/update", {
        method: "PUT",
        body: { trigger_id: triggerId, data: { enabled } },
      });
      await fetchTriggers();
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to update trigger";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  // ── Update template or filters ──
  const updateTrigger = async (
    triggerId: string,
    data: Record<string, any>,
  ) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/triggers/update", {
        method: "PUT",
        body: { trigger_id: triggerId, data },
      });
      await fetchTriggers();
    } catch (err: any) {
      error.value =
        err?.data?.statusMessage || err?.message || "Failed to update trigger";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  // ── Build webhook URL ──
  const getWebhookUrl = (secret: string): string => {
    const config = useRuntimeConfig();
    const baseUrl =
      (config.public as any).webhookBaseUrl ||
      `http://localhost:${(config.public as any).botPort || "3000"}`;
    return `${baseUrl}/webhooks/trigger/${secret}`;
  };

  // Auto-fetch on mount
  onMounted(() => {
    fetchTriggers();
  });

  return {
    triggers: readonly(triggers),
    loading: readonly(loading),
    actionLoading: readonly(actionLoading),
    error: readonly(error),

    fetchTriggers,
    createTrigger,
    deleteTrigger,
    toggleTrigger,
    updateTrigger,
    getWebhookUrl,
  };
}
