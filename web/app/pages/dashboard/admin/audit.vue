<template>
  <div class="p-8 space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-black text-white tracking-tight gradient-text">
        Audit Trail
      </h1>
      <p class="text-gray-400 text-sm mt-1">
        Read-only history of bot-admin changes — module and music toggles,
        AI config, and premium changes. Sensitive values are redacted before
        they're ever stored.
      </p>
    </div>

    <!-- Filters -->
    <div class="glass-card rounded-2xl border border-white/8 p-4 flex flex-wrap items-end gap-3">
      <UFormField label="Actor ID" class="w-40">
        <UInput v-model="filters.actorId" placeholder="Discord user ID" />
      </UFormField>
      <UFormField label="Action" class="w-44">
        <UInput v-model="filters.action" placeholder="e.g. module.updated" />
      </UFormField>
      <UFormField label="Target Type" class="w-40">
        <USelectMenu
          v-model="filters.targetType"
          :items="targetTypeOptions"
          value-key="value"
          placeholder="All"
        />
      </UFormField>
      <UFormField label="Target ID" class="w-40">
        <UInput v-model="filters.targetId" placeholder="e.g. tickets" />
      </UFormField>
      <UFormField label="From" class="w-48">
        <UInput v-model="filters.from" type="datetime-local" />
      </UFormField>
      <UFormField label="To" class="w-48">
        <UInput v-model="filters.to" type="datetime-local" />
      </UFormField>
      <UButton variant="ghost" color="neutral" icon="i-heroicons-x-mark" @click="clearFilters">
        Clear
      </UButton>
      <UButton
        icon="i-heroicons-magnifying-glass"
        :loading="loading"
        class="ml-auto"
        @click="applyFilters"
      >
        Apply
      </UButton>
    </div>

    <!-- Loading -->
    <div v-if="loading && events.length === 0" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="w-8 h-8 animate-spin text-violet-400" />
    </div>

    <!-- Empty -->
    <div
      v-else-if="events.length === 0"
      class="glass-panel text-center py-16 rounded-3xl border-2 border-dashed border-white/8"
    >
      <UIcon name="i-heroicons-clipboard-document-list" class="w-12 h-12 text-gray-600 mx-auto mb-3" />
      <p class="text-gray-500">No audit events match these filters.</p>
    </div>

    <!-- Table -->
    <div v-else class="glass-card rounded-2xl border border-white/8 overflow-hidden">
      <UTable
        :data="events"
        :columns="columns"
        :ui="{
          thead: 'bg-gray-800/60',
          th: 'text-xs text-gray-400 font-medium uppercase tracking-wider',
          td: 'py-2.5 align-middle',
          tr: 'hover:bg-white/[0.02] transition-colors',
        }"
      >
        <template #expanded="{ row }">
          <div class="px-4 py-4 bg-gray-950/50 space-y-3">
            <p v-if="row.original.reason" class="text-sm text-gray-300">
              <span class="text-gray-500">Reason:</span> {{ row.original.reason }}
            </p>
            <p v-else class="text-xs text-gray-600 italic">No reason recorded.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Before</p>
                <pre class="text-xs text-gray-300 bg-black/30 rounded-lg p-3 overflow-x-auto">{{ formatJson(row.original.before) }}</pre>
              </div>
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">After</p>
                <pre class="text-xs text-gray-300 bg-black/30 rounded-lg p-3 overflow-x-auto">{{ formatJson(row.original.after) }}</pre>
              </div>
            </div>
            <p v-if="row.original.requestId" class="text-xs text-gray-600 font-mono">
              Request: {{ row.original.requestId }}
            </p>
          </div>
        </template>
      </UTable>
    </div>

    <!-- Load older -->
    <div v-if="nextCursor" class="flex justify-center">
      <UButton
        variant="soft"
        color="neutral"
        icon="i-lucide-history"
        :loading="loadingOlder"
        @click="loadOlder"
      >
        Load older
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, h, resolveComponent, onMounted } from "vue";
import type { TableColumn } from "@nuxt/ui";

const UButton = resolveComponent("UButton");
const UBadge = resolveComponent("UBadge");

interface AuditEvent {
  id: string;
  actorId: string;
  actorDisplay: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string | null;
  reasonRequired: boolean;
  requestId: string | null;
  createdAt: string;
}

interface AuditPage {
  items: AuditEvent[];
  nextCursor: string | null;
}

const targetTypeOptions = [
  { label: "All", value: "" },
  { label: "Module", value: "module" },
  { label: "Music", value: "music" },
  { label: "AI", value: "ai" },
  { label: "Premium", value: "premium" },
];

const filters = reactive({
  actorId: "",
  action: "",
  targetType: "",
  targetId: "",
  from: "",
  to: "",
});

const events = ref<AuditEvent[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const loadingOlder = ref(false);

const formatJson = (value: Record<string, unknown>): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "—";
  }
};

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const buildQuery = () => {
  const query: Record<string, string> = {};
  if (filters.actorId.trim()) query.actorId = filters.actorId.trim();
  if (filters.action.trim()) query.action = filters.action.trim();
  if (filters.targetType) query.targetType = filters.targetType;
  if (filters.targetId.trim()) query.targetId = filters.targetId.trim();
  if (filters.from) query.from = new Date(filters.from).toISOString();
  if (filters.to) query.to = new Date(filters.to).toISOString();
  return query;
};

const columns: TableColumn<AuditEvent>[] = [
  {
    id: "expand",
    header: "",
    cell: ({ row }) =>
      h(UButton, {
        color: "neutral",
        variant: "ghost",
        size: "xs",
        icon: row.getIsExpanded() ? "i-heroicons-chevron-up" : "i-heroicons-chevron-down",
        "aria-label": row.getIsExpanded() ? "Collapse details" : "Expand details",
        onClick: () => row.toggleExpanded(),
      }),
    meta: { class: { th: "w-10", td: "w-10" } },
  },
  {
    accessorKey: "createdAt",
    header: "Time",
    cell: ({ row }) =>
      h("span", { class: "text-gray-300 text-xs whitespace-nowrap" }, formatTime(row.original.createdAt)),
  },
  {
    accessorKey: "actorDisplay",
    header: "Actor",
    cell: ({ row }) =>
      h("span", { class: "text-white text-sm" }, row.original.actorDisplay || row.original.actorId),
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) =>
      h(UBadge, { color: "neutral", variant: "soft", size: "xs" }, () => row.original.action),
  },
  {
    id: "target",
    header: "Target",
    cell: ({ row }) =>
      h(
        "span",
        { class: "text-xs text-gray-400 font-mono" },
        `${row.original.targetType}:${row.original.targetId}`,
      ),
  },
  {
    accessorKey: "reason",
    header: "Reason",
    cell: ({ row }) =>
      h(
        "span",
        { class: "text-xs text-gray-400 truncate max-w-xs inline-block align-middle" },
        row.original.reason || "—",
      ),
  },
];

const fetchEvents = async (append = false) => {
  const query = buildQuery();
  if (append && nextCursor.value) query.cursor = nextCursor.value;
  if (append) query.limit = "50";

  if (append) loadingOlder.value = true;
  else loading.value = true;

  try {
    const page = await $fetch<AuditPage>("/api/admin/audit-events", { query });
    events.value = append ? [...events.value, ...page.items] : page.items;
    nextCursor.value = page.nextCursor;
  } catch (error) {
    console.error("Error fetching audit events:", error);
  } finally {
    loading.value = false;
    loadingOlder.value = false;
  }
};

const applyFilters = () => fetchEvents(false);
const clearFilters = () => {
  filters.actorId = "";
  filters.action = "";
  filters.targetType = "";
  filters.targetId = "";
  filters.from = "";
  filters.to = "";
  fetchEvents(false);
};
const loadOlder = () => fetchEvents(true);

onMounted(() => fetchEvents(false));
</script>

<style scoped>
.gradient-text {
  background: linear-gradient(to bottom right, #ffffff 30%, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
