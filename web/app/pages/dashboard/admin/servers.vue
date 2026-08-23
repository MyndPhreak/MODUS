<template>
  <div class="p-8 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-black text-white tracking-tight gradient-text">
          Registered Servers
        </h1>
        <p class="text-gray-400 text-sm mt-1">
          Manage premium status for all servers using the bot. Premium unlocks
          hosted AI features.
        </p>
      </div>
      <UButton
        icon="i-heroicons-arrow-path"
        variant="ghost"
        color="neutral"
        :loading="serversLoading"
        aria-label="Refresh registered servers"
        title="Refresh registered servers"
        @click="fetchServers"
        class="glass-card rounded-xl border border-white/8 hover:bg-white/10"
      />
    </div>

    <!-- Filter bar -->
    <div class="flex items-center gap-6">
      <USelect
        v-model="statusFilter"
        :items="statusItems"
        class="w-40"
        aria-label="Server status"
      />
      <label class="flex items-center gap-2">
        <USwitch v-model="premiumOnly" color="warning" aria-label="Show premium servers only" />
        <span class="text-sm text-gray-400">Premium only</span>
      </label>
      <span class="ml-auto text-sm text-gray-500">
        {{ total.toLocaleString() }} server{{ total === 1 ? "" : "s" }}
      </span>
    </div>

    <!-- Table -->
    <div class="glass-card rounded-2xl border border-white/8 overflow-hidden">
      <UTable
        :data="servers"
        :columns="columns"
        :loading="serversLoading"
        :ui="{
          thead: 'bg-gray-800/60',
          th: 'text-xs text-gray-400 font-medium uppercase tracking-wider',
          td: 'py-2.5 align-middle',
          tr: 'hover:bg-white/[0.02] transition-colors',
        }"
      >
        <template #empty>
          <div class="text-center py-16">
            <UIcon
              name="i-heroicons-server-stack"
              class="w-12 h-12 text-gray-600 mx-auto mb-3"
            />
            <p class="text-gray-500">{{ emptyMessage }}</p>
          </div>
        </template>
      </UTable>
    </div>

    <!-- Pagination -->
    <div v-if="total > limit" class="flex justify-center">
      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="limit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, h, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";

const UBadge = resolveComponent("UBadge");
const NuxtLink = resolveComponent("NuxtLink");
const USwitchEl = resolveComponent("USwitch");

const toast = useToast();

interface ServerRow {
  $id: string;
  guild_id: string;
  name: string;
  icon: string | null;
  member_count: number | null;
  shard_id: number | null;
  status: boolean;
  premium: boolean;
  createdAt: string | null;
}

const servers = ref<ServerRow[]>([]);
const serversLoading = ref(false);
const updatingPremium = ref<string | null>(null);

const page = ref(1);
const limit = 25;
const total = ref(0);
const statusFilter = ref<"online" | "offline" | "all">("online");
const premiumOnly = ref(false);

const statusItems = [
  { label: "Online", value: "online" },
  { label: "Offline", value: "offline" },
  { label: "All", value: "all" },
];

const emptyMessage = computed(() => {
  if (premiumOnly.value) return "No premium servers match this filter.";
  if (statusFilter.value === "offline") return "No offline servers.";
  if (statusFilter.value === "online") return "No servers online.";
  return "No servers registered yet.";
});

/** Handles both legacy full CDN URLs and icon hashes */
const getIconUrl = (server: ServerRow): string => {
  if (!server.icon) return "";
  if (server.icon.startsWith("http")) return server.icon;
  const guildId = server.guild_id || server.$id;
  return `https://cdn.discordapp.com/icons/${guildId}/${server.icon}.webp?size=64`;
};

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const columns: TableColumn<ServerRow>[] = [
  {
    id: "server",
    header: "Server",
    cell: ({ row }) =>
      h("div", { class: "flex items-center gap-3 min-w-0" }, [
        row.original.icon
          ? h("img", {
              src: getIconUrl(row.original),
              alt: row.original.name,
              class:
                "w-8 h-8 rounded-lg object-cover ring-1 ring-white/10 flex-shrink-0",
            })
          : h(
              "div",
              {
                class:
                  "w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600/30 to-indigo-600/30 border border-white/10 flex items-center justify-center flex-shrink-0",
              },
              h(
                "span",
                { class: "text-xs font-black text-white/60" },
                row.original.name?.charAt(0)?.toUpperCase() || "?",
              ),
            ),
        h(
          "span",
          { class: "font-bold text-white truncate" },
          row.original.name,
        ),
      ]),
  },
  {
    accessorKey: "guild_id",
    header: "Guild ID",
    cell: ({ row }) =>
      h(
        NuxtLink,
        {
          to: `/dashboard/admin/logs?guildId=${encodeURIComponent(row.original.guild_id || row.original.$id)}`,
          class: "rounded text-xs text-violet-300/80 font-mono hover:text-violet-200 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          title: `View logs for ${row.original.name}`,
        },
        () => row.original.guild_id || row.original.$id,
      ),
  },
  {
    accessorKey: "member_count",
    header: "Members",
    cell: ({ row }) =>
      h(
        "span",
        { class: "text-gray-200" },
        row.original.member_count?.toLocaleString() ?? "—",
      ),
  },
  {
    accessorKey: "shard_id",
    header: "Shard",
    cell: ({ row }) =>
      h("span", { class: "text-gray-200" }, String(row.original.shard_id ?? "—")),
  },
  {
    accessorKey: "createdAt",
    header: "Joined",
    cell: ({ row }) =>
      h(
        "span",
        { class: "text-gray-200" },
        row.original.createdAt ? formatDate(row.original.createdAt) : "—",
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      h(
        UBadge,
        {
          color: row.original.status ? "success" : "neutral",
          variant: "soft",
          size: "xs",
        },
        () => (row.original.status ? "Online" : "Offline"),
      ),
  },
  {
    id: "premium",
    header: "Premium",
    cell: ({ row }) =>
      h(USwitchEl, {
        modelValue: row.original.premium === true,
        "onUpdate:modelValue": (v: boolean) => togglePremium(row.original, v),
        loading: updatingPremium.value === row.original.$id,
        color: "warning",
        "aria-label": `${row.original.premium ? "Disable" : "Enable"} premium for ${row.original.name}`,
      }),
    meta: { class: { th: "w-24", td: "w-24" } },
  },
];

const fetchServers = async () => {
  serversLoading.value = true;
  try {
    const res = await $fetch<{ rows: ServerRow[]; total: number }>(
      "/api/admin/servers",
      {
        query: {
          page: page.value,
          limit,
          status: statusFilter.value,
          ...(premiumOnly.value ? { premium: "true" } : {}),
        },
      },
    );
    servers.value = res.rows;
    total.value = res.total;
    // Data shrank while we sat on a deep page (e.g. refresh) — snap back;
    // the page watcher refetches.
    if (res.rows.length === 0 && res.total > 0 && page.value > 1) {
      page.value = 1;
    }
  } catch (error) {
    console.error("Error fetching servers:", error);
    toast.add({
      title: "Error",
      description: "Failed to load servers.",
      color: "error",
    });
  } finally {
    serversLoading.value = false;
  }
};

// Filter changes restart from page 1. When already on page 1 the page
// watcher won't fire, so fetch directly; when deeper in, resetting the
// page triggers the page watcher's fetch — avoids a double request.
watch([statusFilter, premiumOnly], () => {
  if (page.value !== 1) {
    page.value = 1;
  } else {
    fetchServers();
  }
});

watch(page, () => fetchServers());

const togglePremium = async (server: ServerRow, premium: boolean) => {
  updatingPremium.value = server.$id;
  try {
    await $fetch(
      `/api/admin/servers/${encodeURIComponent(server.guild_id)}/premium`,
      { method: "PATCH", body: { premium } },
    );
    server.premium = premium;
    toast.add({
      title: premium ? "Premium Enabled" : "Premium Removed",
      description: `${server.name} is now ${premium ? "premium" : "standard"}.`,
      color: premium ? "warning" : "neutral",
    });
  } catch (error) {
    console.error("Error toggling premium:", error);
    toast.add({
      title: "Error",
      description: "Failed to update premium status.",
      color: "error",
    });
  } finally {
    updatingPremium.value = null;
  }
};

onMounted(() => fetchServers());
</script>

<style scoped>
.gradient-text {
  background: linear-gradient(to bottom right, #ffffff 30%, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
