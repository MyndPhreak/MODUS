<script setup lang="ts">
const route = useRoute();
const guildId = route.params.guild_id as string;

const { state, isModuleEnabled, loadChannels, loadRoles, channelOptions, roleOptions, getModuleConfig, saveModuleSettings } =
  useServerSettings(guildId);
const { giveaways, loading, actionLoading, error, createGiveaway, updateGiveaway, cancelGiveaway } =
  useGiveaways(guildId);

const hostRoleIds = ref<string[]>(getModuleConfig("giveaways").hostRoleIds ?? []);

const saveHostRoles = async () => {
  try {
    await saveModuleSettings("giveaways", { hostRoleIds: hostRoleIds.value });
  } catch {
    // saveModuleSettings surfaces failures via its own toast — this just
    // prevents an unhandled promise rejection.
  }
};

const showCreateForm = ref(false);
const form = reactive({
  channel_id: "",
  title: "",
  duration_minutes: 60,
  winner_count: 1,
  prize_kind: "gift" as "key" | "gift" | "physical" | "other",
  prize_value: "",
  description: "",
  image_url: "",
  required_role_ids: [] as string[],
  blocked_role_ids: [] as string[],
  min_account_age_days: undefined as number | undefined,
  min_server_age_days: undefined as number | undefined,
});

const submitCreate = async () => {
  try {
    await createGiveaway({ ...form });
    showCreateForm.value = false;
  } catch {
    // createGiveaway re-throws after populating `error` — the banner at
    // the top of the page already surfaces it, this just prevents an
    // unhandled promise rejection.
  }
};

const editing = ref<string | null>(null);
const editForm = reactive({
  title: "",
  description: "",
  prize_kind: "gift" as "key" | "gift" | "physical" | "other",
  prize_value: "",
  image_url: "",
  winner_count: 1,
  duration_minutes: undefined as number | undefined,
  required_role_ids: [] as string[],
  blocked_role_ids: [] as string[],
  min_account_age_days: undefined as number | undefined,
  min_server_age_days: undefined as number | undefined,
});

const startEdit = (g: (typeof giveaways.value)[number]) => {
  editing.value = g.id;
  editForm.title = g.title;
  editForm.description = g.description ?? "";
  editForm.prize_kind = g.prizeKind;
  editForm.prize_value = g.prizeValue ?? "";
  editForm.image_url = g.imageUrl ?? "";
  editForm.winner_count = g.winnerCount;
  editForm.duration_minutes = undefined; // blank = keep the current end time
  editForm.required_role_ids = [...g.requirements.requiredRoleIds];
  editForm.blocked_role_ids = [...g.requirements.blockedRoleIds];
  editForm.min_account_age_days = g.requirements.minAccountAgeDays;
  editForm.min_server_age_days = g.requirements.minServerAgeDays;
};

const submitEdit = async () => {
  if (!editing.value) return;
  const payload: Record<string, any> = { ...editForm };
  if (payload.duration_minutes === undefined) delete payload.duration_minutes;
  try {
    await updateGiveaway(editing.value, payload);
    editing.value = null;
  } catch {
    // updateGiveaway re-throws after populating `error` — see submitCreate.
  }
};

const cancelEdit = () => {
  editing.value = null;
};

const cancel = async (id: string) => {
  try {
    await cancelGiveaway(id);
  } catch {
    // cancelGiveaway re-throws after populating `error` — see submitCreate.
  }
};

onMounted(() => {
  loadChannels();
  loadRoles();
});
</script>

<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/dashboard/server/${guildId}/modules`"
        class="w-9 h-9 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center shrink-0"
      >
        <UIcon name="i-heroicons-arrow-left" class="w-5 h-5 text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div
          class="w-9 h-9 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center shrink-0"
        >
          <UIcon
            name="i-heroicons-gift"
            class="w-5 h-5 text-yellow-400"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Giveaways</h2>
          <p class="text-xs text-gray-500">
            Configurable giveaways with entry requirements and structured prizes
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('giveaways') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("giveaways") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <div class="flex justify-end">
      <UButton icon="i-lucide-plus" @click="showCreateForm = !showCreateForm">
        {{ showCreateForm ? "Close" : "Create Giveaway" }}
      </UButton>
    </div>

    <UAlert v-if="error" color="error" :title="error" />

    <UCard v-if="showCreateForm">
      <form class="space-y-4" @submit.prevent="submitCreate">
        <USelect v-model="form.channel_id" :items="channelOptions" placeholder="Channel" />
        <UInput v-model="form.title" placeholder="Title" required maxlength="200" />
        <UInput v-model.number="form.duration_minutes" type="number" min="5" placeholder="Duration (minutes)" />
        <UInput v-model.number="form.winner_count" type="number" min="1" max="50" placeholder="Winners" />
        <USelect
          v-model="form.prize_kind"
          :items="[
            { label: '🔑 Key / Code', value: 'key' },
            { label: '🎁 Gift', value: 'gift' },
            { label: '📦 Physical Item', value: 'physical' },
            { label: '🏆 Other', value: 'other' },
          ]"
        />
        <UInput v-model="form.prize_value" placeholder="Prize value / code" required maxlength="500" />
        <UTextarea v-model="form.description" placeholder="Description (optional)" />
        <UInput v-model="form.image_url" placeholder="Image URL (optional)" />
        <USelectMenu v-model="form.required_role_ids" :items="roleOptions" multiple placeholder="Required roles" />
        <USelectMenu v-model="form.blocked_role_ids" :items="roleOptions" multiple placeholder="Blocked roles" />
        <UInput v-model.number="form.min_account_age_days" type="number" placeholder="Min. account age (days)" />
        <UInput v-model.number="form.min_server_age_days" type="number" placeholder="Min. server age (days)" />
        <UButton type="submit" :loading="actionLoading">Post Giveaway</UButton>
      </form>
    </UCard>

    <UCard>
      <template #header>Host roles</template>
      <USelectMenu v-model="hostRoleIds" :items="roleOptions" multiple placeholder="Roles allowed to manage giveaways" />
      <UButton class="mt-2" size="sm" @click="saveHostRoles">Save</UButton>
    </UCard>

    <div v-if="loading">Loading…</div>
    <div v-else class="space-y-3">
      <UCard v-for="g in giveaways" :key="g.id">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">{{ g.title }}</div>
            <div class="text-sm text-muted">
              {{ g.status }} — {{ g.entrantCount }} entrant(s) — {{ g.winnerCount }} winner(s)
            </div>
          </div>
          <div class="flex gap-2" v-if="g.status === 'active' && editing !== g.id">
            <UButton size="sm" variant="soft" @click="startEdit(g)">Edit</UButton>
            <UButton size="sm" color="error" variant="soft" :loading="actionLoading" @click="cancel(g.id)">
              Cancel
            </UButton>
          </div>
        </div>

        <form v-if="editing === g.id" class="mt-4 space-y-3" @submit.prevent="submitEdit">
          <UInput v-model="editForm.title" placeholder="Title" required maxlength="200" />
          <UTextarea v-model="editForm.description" placeholder="Description" />
          <USelect
            v-model="editForm.prize_kind"
            :items="[
              { label: '🔑 Key / Code', value: 'key' },
              { label: '🎁 Gift', value: 'gift' },
              { label: '📦 Physical Item', value: 'physical' },
              { label: '🏆 Other', value: 'other' },
            ]"
          />
          <UInput v-model="editForm.prize_value" placeholder="Prize value / code" required maxlength="500" />
          <UInput v-model="editForm.image_url" placeholder="Image URL" />
          <UInput v-model.number="editForm.winner_count" type="number" min="1" max="50" placeholder="Winners" />
          <UInput
            v-model.number="editForm.duration_minutes"
            type="number"
            min="5"
            placeholder="New duration in minutes from now (leave blank to keep the current end time)"
          />
          <USelectMenu v-model="editForm.required_role_ids" :items="roleOptions" multiple placeholder="Required roles" />
          <USelectMenu v-model="editForm.blocked_role_ids" :items="roleOptions" multiple placeholder="Blocked roles" />
          <UInput v-model.number="editForm.min_account_age_days" type="number" placeholder="Min. account age (days)" />
          <UInput v-model.number="editForm.min_server_age_days" type="number" placeholder="Min. server age (days)" />
          <div class="flex gap-2">
            <UButton type="submit" size="sm" :loading="actionLoading">Save</UButton>
            <UButton type="button" size="sm" variant="ghost" @click="cancelEdit">Discard</UButton>
          </div>
        </form>
      </UCard>
      <div v-if="giveaways.length === 0" class="text-muted">No giveaways yet.</div>
    </div>
  </div>
</template>
