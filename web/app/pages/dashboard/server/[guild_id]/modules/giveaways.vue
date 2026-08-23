<script setup lang="ts">
const route = useRoute();
const guildId = route.params.guild_id as string;

const { state, isModuleEnabled, loadChannels, loadRoles, channelOptions, roleOptions, getModuleConfig, saveModuleSettings } =
  useServerSettings(guildId);
const { giveaways, loading, actionLoading, error, createGiveaway, updateGiveaway, cancelGiveaway, deleteGiveaway } =
  useGiveaways(guildId);

const currentGiveaways = computed(() => giveaways.value.filter((g) => g.status === "active"));
const pastGiveaways = computed(() => giveaways.value.filter((g) => g.status !== "active"));

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(value));

const timeLeft = (value: string) => {
  const remaining = new Date(value).getTime() - Date.now();
  if (remaining <= 0) return "Ending soon";
  const minutes = Math.floor(remaining / 60000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h left` : `${hours}h ${minutes % 60}m left`;
};

const memberLabel = (member: { id: string; displayName: string; username: string | null }) => {
  if (member.displayName === member.id) return member.id;
  if (member.username && member.username !== member.displayName) {
    return `${member.displayName} (@${member.username})`;
  }
  return member.displayName;
};

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
  // prize_kind is not editable (the API ignores it) — don't pretend otherwise.
  delete payload.prize_kind;
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

const removePastGiveaway = async (id: string) => {
  if (!window.confirm("Delete this past giveaway from the dashboard history? The Discord message will remain.")) return;
  try {
    await deleteGiveaway(id);
  } catch {
    // deleteGiveaway surfaces the error in the page alert.
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
      <form class="space-y-5" @submit.prevent="submitCreate">
        <div class="space-y-3">
          <p class="text-xs font-semibold text-gray-400">Basics</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UFormField label="Channel" class="md:col-span-2">
              <USelect v-model="form.channel_id" :items="channelOptions" placeholder="Select a channel" class="w-full" />
            </UFormField>
            <UFormField label="Winners">
              <UInput v-model.number="form.winner_count" type="number" min="1" max="50" class="w-full" />
            </UFormField>
            <UFormField label="Title" class="md:col-span-2">
              <UInput v-model="form.title" placeholder="e.g. Nitro Giveaway" required maxlength="200" class="w-full" />
            </UFormField>
            <UFormField label="Duration (minutes)">
              <UInput v-model.number="form.duration_minutes" type="number" min="5" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="border-t border-white/5 pt-4 space-y-3">
          <p class="text-xs font-semibold text-gray-400">Prize</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField label="Prize Type">
              <USelect
                v-model="form.prize_kind"
                :items="[
                  { label: '🔑 Key / Code', value: 'key' },
                  { label: '🎁 Gift', value: 'gift' },
                  { label: '📦 Physical Item', value: 'physical' },
                  { label: '🏆 Other', value: 'other' },
                ]"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Prize Value" description="The code or item shown to the winner(s).">
              <UInput v-model="form.prize_value" placeholder="Prize value / code" required maxlength="500" class="w-full" />
            </UFormField>
            <UFormField label="Description" description="Optional — shown in the giveaway embed." class="md:col-span-2">
              <UTextarea v-model="form.description" placeholder="Tell entrants what they're winning" :rows="2" class="w-full" />
            </UFormField>
            <UFormField label="Image URL" hint="Optional" class="md:col-span-2">
              <UInput v-model="form.image_url" placeholder="https://…" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="border-t border-white/5 pt-4 space-y-3">
          <p class="text-xs font-semibold text-gray-400">Entry Requirements</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField label="Required Roles" hint="Optional">
              <USelectMenu v-model="form.required_role_ids" :items="roleOptions" multiple placeholder="Any role can enter" class="w-full" />
            </UFormField>
            <UFormField label="Blocked Roles" hint="Optional">
              <USelectMenu v-model="form.blocked_role_ids" :items="roleOptions" multiple placeholder="No roles blocked" class="w-full" />
            </UFormField>
            <UFormField label="Min. Account Age (days)" hint="Optional">
              <UInput v-model.number="form.min_account_age_days" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Min. Server Age (days)" hint="Optional">
              <UInput v-model.number="form.min_server_age_days" type="number" min="0" class="w-full" />
            </UFormField>
          </div>
        </div>

        <div class="flex justify-end">
          <UButton type="submit" :loading="actionLoading">Post Giveaway</UButton>
        </div>
      </form>
    </UCard>

    <UCard>
      <template #header>Host roles</template>
      <USelectMenu v-model="hostRoleIds" :items="roleOptions" multiple placeholder="Roles allowed to manage giveaways" />
      <UButton class="mt-2" size="sm" @click="saveHostRoles">Save</UButton>
    </UCard>

    <div v-if="loading">Loading…</div>
    <div v-else class="space-y-8">
      <section>
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="text-lg font-semibold text-white">Current giveaways</h3>
            <p class="text-sm text-muted">Live campaigns and their entry activity.</p>
          </div>
          <UBadge color="success" variant="soft">{{ currentGiveaways.length }}</UBadge>
        </div>
        <div v-if="currentGiveaways.length" class="space-y-3">
        <UCard v-for="g in currentGiveaways" :key="g.id">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">{{ g.title }}</div>
            <div class="text-sm text-muted">{{ timeLeft(g.endsAt) }} · ends {{ formatDate(g.endsAt) }}</div>
          </div>
          <div class="flex gap-2" v-if="g.status === 'active' && editing !== g.id">
            <UButton size="sm" variant="soft" @click="startEdit(g)">Edit</UButton>
            <UButton size="sm" color="error" variant="soft" :loading="actionLoading" @click="cancel(g.id)">
              Cancel
            </UButton>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div class="rounded-lg bg-white/5 p-3"><div class="text-muted">Prize</div><div class="text-white font-medium">{{ g.prizeValue || g.prizeKind }}</div></div>
          <div class="rounded-lg bg-white/5 p-3"><div class="text-muted">Who entered</div><div class="text-white font-medium break-words">{{ g.entrants.length ? g.entrants.map(memberLabel).join(", ") : "No entries yet" }}</div></div>
          <div class="rounded-lg bg-white/5 p-3"><div class="text-muted">Winners</div><div class="text-white font-medium">{{ g.winnerCount }}</div></div>
        </div>

        <form v-if="editing === g.id" class="mt-4 space-y-5" @submit.prevent="submitEdit">
          <div class="space-y-3">
            <p class="text-xs font-semibold text-gray-400">Basics</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormField label="Title">
                <UInput v-model="editForm.title" placeholder="Title" required maxlength="200" class="w-full" />
              </UFormField>
              <UFormField label="Winners">
                <UInput v-model.number="editForm.winner_count" type="number" min="1" max="50" class="w-full" />
              </UFormField>
              <UFormField
                label="New Duration (minutes)"
                hint="Optional"
                description="From now. Leave blank to keep the current end time."
                class="md:col-span-2"
              >
                <UInput v-model.number="editForm.duration_minutes" type="number" min="5" class="w-full" />
              </UFormField>
            </div>
          </div>

          <div class="border-t border-white/5 pt-4 space-y-3">
            <p class="text-xs font-semibold text-gray-400">Prize</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Prize type is fixed after creation: changing a "key" giveaway to
                   another kind would unmask its code in the public embed. -->
              <UFormField label="Prize Type" description="Can't be changed after creation — cancel and recreate instead.">
                <USelect
                  v-model="editForm.prize_kind"
                  disabled
                  :items="[
                    { label: '🔑 Key / Code', value: 'key' },
                    { label: '🎁 Gift', value: 'gift' },
                    { label: '📦 Physical Item', value: 'physical' },
                    { label: '🏆 Other', value: 'other' },
                  ]"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Prize Value">
                <UInput
                  v-model="editForm.prize_value"
                  :placeholder="
                    editForm.prize_kind === 'key'
                      ? 'Leave blank to keep the existing code'
                      : 'Prize value / code'
                  "
                  maxlength="500"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Description" class="md:col-span-2">
                <UTextarea v-model="editForm.description" placeholder="Description" :rows="2" class="w-full" />
              </UFormField>
              <UFormField label="Image URL" hint="Optional" class="md:col-span-2">
                <UInput v-model="editForm.image_url" placeholder="Image URL" class="w-full" />
              </UFormField>
            </div>
          </div>

          <div class="border-t border-white/5 pt-4 space-y-3">
            <p class="text-xs font-semibold text-gray-400">Entry Requirements</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormField label="Required Roles" hint="Optional">
                <USelectMenu v-model="editForm.required_role_ids" :items="roleOptions" multiple placeholder="Any role can enter" class="w-full" />
              </UFormField>
              <UFormField label="Blocked Roles" hint="Optional">
                <USelectMenu v-model="editForm.blocked_role_ids" :items="roleOptions" multiple placeholder="No roles blocked" class="w-full" />
              </UFormField>
              <UFormField label="Min. Account Age (days)" hint="Optional">
                <UInput v-model.number="editForm.min_account_age_days" type="number" min="0" class="w-full" />
              </UFormField>
              <UFormField label="Min. Server Age (days)" hint="Optional">
                <UInput v-model.number="editForm.min_server_age_days" type="number" min="0" class="w-full" />
              </UFormField>
            </div>
          </div>

          <div class="flex gap-2">
            <UButton type="submit" size="sm" :loading="actionLoading">Save</UButton>
            <UButton type="button" size="sm" variant="ghost" @click="cancelEdit">Discard</UButton>
          </div>
        </form>
      </UCard>
        </div>
        <div v-else class="text-muted">No current giveaways.</div>
      </section>

      <section>
        <div class="flex items-center justify-between mb-3">
          <div><h3 class="text-lg font-semibold text-white">Past giveaways</h3><p class="text-sm text-muted">A record of finished and cancelled campaigns.</p></div>
          <UBadge color="neutral" variant="soft">{{ pastGiveaways.length }}</UBadge>
        </div>
        <div v-if="pastGiveaways.length" class="space-y-3">
          <UCard v-for="g in pastGiveaways" :key="g.id">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="flex items-center gap-2"><div class="font-medium text-white">{{ g.title }}</div><UBadge :color="g.status === 'ended' ? 'neutral' : 'warning'" variant="soft">{{ g.status }}</UBadge></div>
                <div class="text-sm text-muted">Ended {{ formatDate(g.endsAt) }} · created {{ formatDate(g.createdAt) }}</div>
              </div>
              <UButton size="sm" color="error" variant="soft" :loading="actionLoading" @click="removePastGiveaway(g.id)">Delete record</UButton>
            </div>
            <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div class="rounded-lg bg-white/5 p-3"><div class="text-muted">Prize</div><div class="text-white font-medium">{{ g.prizeValue || g.prizeKind }}</div></div>
              <div class="rounded-lg bg-white/5 p-3"><div class="text-muted">Who entered ({{ g.entrantCount }})</div><div class="text-white font-medium break-words">{{ g.entrants.length ? g.entrants.map(memberLabel).join(", ") : "No entries" }}</div></div>
              <div class="rounded-lg bg-white/5 p-3"><div class="text-muted">Winners</div><div v-if="g.winners.length" class="text-white font-medium break-words">{{ g.winners.map(memberLabel).join(", ") }}</div><div v-else class="text-muted">No winners</div></div>
            </div>
          </UCard>
        </div>
        <div v-else class="text-muted">No past giveaways.</div>
      </section>
    </div>

    <DashboardModuleAccessSection :guild-id="guildId" module-name="giveaways" />
  </div>
</template>
