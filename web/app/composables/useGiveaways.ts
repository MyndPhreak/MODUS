/**
 * useGiveaways — dashboard CRUD for giveaways (create/edit/cancel) and the
 * list view. Settings (hostRoleIds) go through useServerSettings's generic
 * saveModuleSettings/getModuleConfig, same as every other module.
 */
export interface GiveawayRequirements {
  requiredRoleIds: string[];
  blockedRoleIds: string[];
  minAccountAgeDays?: number;
  minServerAgeDays?: number;
}

export interface Giveaway {
  id: string;
  channelId: string;
  messageId: string;
  title: string;
  description: string | null;
  prizeKind: "key" | "gift" | "physical" | "other";
  prizeValue: string | null;
  imageUrl: string | null;
  winnerCount: number;
  entrantCount: number;
  endsAt: string;
  status: "active" | "ended" | "cancelled";
  winnerIds: string[];
  requirements: GiveawayRequirements;
  source: "slash" | "dashboard";
  createdAt: string;
}

export interface CreateGiveawayInput {
  channel_id: string;
  title: string;
  duration_minutes: number;
  winner_count: number;
  prize_kind: Giveaway["prizeKind"];
  prize_value: string;
  description?: string;
  image_url?: string;
  required_role_ids?: string[];
  blocked_role_ids?: string[];
  min_account_age_days?: number;
  min_server_age_days?: number;
}

export function useGiveaways(guildId: string) {
  const giveaways = useState<Giveaway[]>(`giveaways-${guildId}`, () => []);
  const loading = ref(true);
  const actionLoading = ref(false);
  const error = ref<string | null>(null);

  const fetchGiveaways = async () => {
    error.value = null;
    try {
      const data = (await $fetch("/api/giveaways/list", {
        params: { guild_id: guildId },
      })) as { giveaways: Giveaway[] };
      giveaways.value = data.giveaways;
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || "Failed to load giveaways";
    }
  };

  const createGiveaway = async (data: CreateGiveawayInput) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/giveaways/create", { method: "POST", body: { guild_id: guildId, ...data } });
      await fetchGiveaways();
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || "Failed to create giveaway";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const updateGiveaway = async (id: string, data: Record<string, any>) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/giveaways/update", { method: "POST", body: { guild_id: guildId, id, ...data } });
      await fetchGiveaways();
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || "Failed to update giveaway";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const cancelGiveaway = async (id: string) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/giveaways/cancel", { method: "POST", body: { guild_id: guildId, id } });
      await fetchGiveaways();
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || "Failed to cancel giveaway";
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  onMounted(async () => {
    loading.value = true;
    await fetchGiveaways();
    loading.value = false;
  });

  return {
    giveaways: readonly(giveaways),
    loading: readonly(loading),
    actionLoading: readonly(actionLoading),
    error: readonly(error),
    fetchGiveaways,
    createGiveaway,
    updateGiveaway,
    cancelGiveaway,
  };
}
