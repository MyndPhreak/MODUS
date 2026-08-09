<template>
  <div class="p-6 lg:p-8 space-y-8">
    <!-- Top Header & Primary Tabs -->
    <header class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-white tracking-tight">
            Server Configuration
          </h1>
          <UBadge
            color="primary"
            variant="subtle"
            class="font-semibold text-xs px-2.5 py-0.5"
          >
            {{ activeModuleCount }} / {{ totalModuleCount }} Active
          </UBadge>
        </div>
        <p class="text-sm text-gray-400 mt-1">
          Manage and configure bot features, permissions, and settings for this server.
        </p>
      </div>

      <!-- Main Navigation Switcher (Modules vs Server Management) -->
      <div
        v-if="state.isServerOwnerOrAdmin"
        class="flex items-center p-1 bg-white/[0.04] border border-white/[0.08] rounded-xl self-start sm:self-auto shrink-0"
      >
        <button
          type="button"
          class="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
          :class="
            activeMainTab === 'modules'
              ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30 shadow-sm'
              : 'text-gray-400 hover:text-white'
          "
          @click="activeMainTab = 'modules'"
        >
          <UIcon name="i-lucide-layout-grid" class="w-4 h-4" />
          <span>Modules</span>
          <span
            class="text-[10px] px-1.5 py-0.2 rounded-full"
            :class="
              activeMainTab === 'modules'
                ? 'bg-primary-500/30 text-white'
                : 'bg-white/10 text-gray-400'
            "
          >
            {{ totalModuleCount }}
          </span>
        </button>
        <button
          type="button"
          class="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
          :class="
            activeMainTab === 'settings'
              ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30 shadow-sm'
              : 'text-gray-400 hover:text-white'
          "
          @click="activeMainTab = 'settings'"
        >
          <UIcon name="i-lucide-shield-check" class="w-4 h-4" />
          <span>Server Access & Danger Zone</span>
        </button>
      </div>
    </header>

    <!-- ======================================================== -->
    <!-- TAB 1: MODULES & FEATURES                                -->
    <!-- ======================================================== -->
    <div v-if="activeMainTab === 'modules'" class="space-y-8">
      <!-- Search & Category Filters Toolbar -->
      <section class="space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <!-- Search Input -->
          <div class="relative flex-1 max-w-md">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              placeholder="Search modules by name, keyword, or tag (e.g. spotify, spam, xp)..."
              class="w-full"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1"
              @click="searchQuery = ''"
            >
              <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Status Filter -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500 hidden sm:inline">Status:</span>
            <div class="flex items-center p-0.5 bg-white/[0.03] border border-white/[0.06] rounded-lg">
              <button
                type="button"
                class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                :class="
                  statusFilter === 'all'
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white'
                "
                @click="statusFilter = 'all'"
              >
                All
              </button>
              <button
                type="button"
                class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                :class="
                  statusFilter === 'enabled'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-gray-400 hover:text-white'
                "
                @click="statusFilter = 'enabled'"
              >
                Active
              </button>
              <button
                type="button"
                class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                :class="
                  statusFilter === 'disabled'
                    ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                    : 'text-gray-400 hover:text-white'
                "
                @click="statusFilter = 'disabled'"
              >
                Disabled
              </button>
            </div>
          </div>
        </div>

        <!-- Category Filter Pills -->
        <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 border"
            :class="
              selectedCategory === 'all'
                ? 'bg-white/15 text-white border-white/20 shadow-sm'
                : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:bg-white/[0.07] hover:text-gray-200'
            "
            @click="selectedCategory = 'all'"
          >
            <UIcon name="i-lucide-layout-grid" class="w-3.5 h-3.5" />
            <span>All Categories</span>
            <span class="text-[10px] opacity-70 ml-0.5">({{ totalModuleCount }})</span>
          </button>

          <button
            v-for="cat in MODULE_CATEGORIES"
            :key="cat.key"
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 border"
            :class="
              selectedCategory === cat.key
                ? 'bg-primary-500/20 text-primary-300 border-primary-500/30 shadow-sm'
                : 'bg-white/[0.03] text-gray-400 border-white/[0.06] hover:bg-white/[0.07] hover:text-gray-200'
            "
            @click="selectedCategory = cat.key"
          >
            <UIcon :name="cat.icon" class="w-3.5 h-3.5" />
            <span>{{ cat.label }}</span>
            <span class="text-[10px] opacity-70 ml-0.5">
              ({{ categoryCounts[cat.key]?.total || 0 }})
            </span>
          </button>
        </div>
      </section>

      <!-- Categorized Module Groups -->
      <div v-if="groupedModules.length > 0" class="space-y-10">
        <section
          v-for="group in groupedModules"
          :key="group.category.key"
          class="space-y-4"
        >
          <!-- Category Section Header -->
          <div class="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-primary-400">
                <UIcon :name="group.category.icon" class="w-4 h-4" />
              </div>
              <div>
                <h2 class="text-base font-bold text-white">
                  {{ group.category.label }}
                </h2>
                <p class="text-xs text-gray-500">
                  {{ group.category.description }}
                </p>
              </div>
            </div>
            <UBadge
              variant="subtle"
              color="neutral"
              class="text-[11px] font-medium"
            >
              {{ group.enabledCount }} / {{ group.modules.length }} enabled
            </UBadge>
          </div>

          <!-- Cards Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="module in group.modules"
              :key="module.$id"
              class="group relative rounded-xl border bg-white/[0.03] p-4 flex flex-col gap-3 transition-all duration-200 hover:bg-white/[0.06]"
              :class="
                isModuleEnabled(module.name)
                  ? 'border-white/15'
                  : 'border-white/[0.07] opacity-70'
              "
            >
              <!-- Top row: Icon + Toggle -->
              <div class="flex items-start justify-between">
                <div
                  class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  :class="getModuleDisplay(module).bgClass"
                >
                  <UIcon
                    :name="getModuleDisplay(module).icon"
                    class="w-5 h-5"
                    :class="getModuleDisplay(module).iconClass"
                  />
                </div>
                <USwitch
                  :model-value="isModuleEnabled(module.name)"
                  @update:model-value="
                    (val: boolean) => handleToggle(module.name, val)
                  "
                  :loading="updating === module.name"
                />
              </div>

              <!-- Name + Status -->
              <div class="flex items-center gap-2">
                <span class="font-semibold text-sm text-white">
                  {{ getModuleDisplay(module).displayName }}
                </span>
                <span
                  class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  :class="
                    isModuleEnabled(module.name)
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                      : 'bg-gray-600'
                  "
                />
              </div>

              <!-- Description -->
              <p class="text-xs text-gray-400 leading-relaxed line-clamp-2">
                {{ module.description }}
              </p>

              <!-- Tags list (clickable to search) -->
              <div class="flex flex-wrap gap-1.5 my-1">
                <button
                  v-for="tag in getModuleDisplay(module).tags.slice(0, 3)"
                  :key="tag"
                  type="button"
                  class="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] text-gray-400 hover:text-white transition-colors"
                  @click="setTagSearch(tag)"
                >
                  #{{ tag }}
                </button>
              </div>

              <!-- Configure link (bottom) -->
              <div class="mt-auto pt-2 border-t border-white/[0.06]">
                <NuxtLink
                  v-if="hasModuleSettings(module.name)"
                  :to="`/dashboard/server/${guildId}/modules/${module.name.toLowerCase()}`"
                  class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-primary-400 transition-colors duration-150"
                >
                  <UIcon name="i-lucide-settings-2" class="w-3.5 h-3.5" />
                  <span>Configure Settings</span>
                </NuxtLink>
                <span
                  v-else
                  class="text-[11px] text-gray-500 italic"
                >
                  No extra configuration required
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Zero Results State -->
      <div
        v-else
        class="text-center py-16 px-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]"
      >
        <template v-if="hasUnmetadataedModules">
          <UIcon
            name="i-lucide-refresh-cw"
            class="w-12 h-12 text-gray-500 mx-auto mb-3"
          />
          <h3 class="text-base font-bold text-white">Module metadata isn't available yet</h3>
          <p class="text-xs text-gray-400 max-w-sm mx-auto mt-1">
            This usually means the bot needs to restart after a recent update. Try refreshing in
            a moment.
          </p>
        </template>
        <template v-else>
          <UIcon
            name="i-lucide-search-x"
            class="w-12 h-12 text-gray-500 mx-auto mb-3"
          />
          <h3 class="text-base font-bold text-white">No modules found</h3>
          <p class="text-xs text-gray-400 max-w-sm mx-auto mt-1">
            No bot modules matched your query
            <span v-if="searchQuery" class="font-semibold text-white">"{{ searchQuery }}"</span>.
          </p>
          <UButton
            color="neutral"
            variant="outline"
            size="xs"
            class="mt-4"
            @click="resetFilters"
          >
            Reset Filters
          </UButton>
        </template>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- TAB 2: SERVER SETTINGS & ACCESS                           -->
    <!-- ======================================================== -->
    <div
      v-else-if="activeMainTab === 'settings' && state.isServerOwnerOrAdmin"
      class="space-y-8 max-w-4xl"
    >
      <!-- Dashboard Access Roles -->
      <section>
        <div class="mb-4">
          <h2 class="text-lg font-bold text-white">Dashboard Access Roles</h2>
          <p class="text-sm text-gray-400">
            Grant specific Discord roles access to this server's dashboard settings without requiring Administrator permission.
          </p>
        </div>

        <UCard :ui="{ root: 'border border-white/10 bg-white/[0.02]' }">
          <div class="space-y-4">
            <div class="flex items-center gap-3 mb-2">
              <div class="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <UIcon name="i-lucide-users" class="w-5 h-5" />
              </div>
              <div>
                <h3 class="font-semibold text-white">Delegated Dashboard Roles</h3>
                <p class="text-xs text-gray-400">
                  Members with any of these roles can view and adjust module settings for this server.
                </p>
              </div>
            </div>

            <div
              v-if="state.rolesLoading"
              class="flex items-center gap-2 py-3"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="w-4 h-4 animate-spin text-indigo-400"
              />
              <span class="text-sm text-gray-400">Loading server roles from Discord...</span>
            </div>

            <USelectMenu
              v-else-if="dashboardRoleOptions.length > 0"
              v-model="selectedDashboardRoles"
              :items="dashboardRoleOptions"
              value-key="value"
              multiple
              placeholder="Select roles..."
              class="w-full"
              @update:model-value="dashboardRolesDirty = true"
            />
            <p v-else class="text-sm text-gray-500 py-2">
              No roles available. Make sure the bot is in this server.
            </p>

            <div class="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <p class="text-xs text-gray-500">
                {{ selectedDashboardRoles.length }} role{{
                  selectedDashboardRoles.length !== 1 ? "s" : ""
                }} selected
              </p>
              <UButton
                color="primary"
                size="sm"
                :loading="savingDashboardRoles"
                :disabled="!dashboardRolesDirty"
                @click="handleSaveDashboardRoles"
              >
                Save Roles
              </UButton>
            </div>
          </div>
        </UCard>
      </section>

      <!-- Danger Zone -->
      <section>
        <div class="mb-4">
          <h2 class="text-lg font-bold text-red-400">Danger Zone</h2>
          <p class="text-sm text-gray-400">
            Irreversible actions for this server's configuration and records.
          </p>
        </div>

        <UCard :ui="{ root: 'border border-red-500/20 bg-red-500/[0.02]' }">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 class="font-semibold text-white">Remove Server from Dashboard</h3>
              <p class="text-xs text-gray-400 mt-0.5">
                Remove this server from your dashboard. This deletes all module configurations and audit records stored for this server.
              </p>
            </div>
            <UButton
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              class="shrink-0"
              @click="showRemoveConfirm = true"
              :loading="removing"
            >
              Remove Server
            </UButton>
          </div>
        </UCard>
      </section>
    </div>

    <!-- Remove Confirmation Modal -->
    <UModal v-model:open="showRemoveConfirm">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400">
              <UIcon
                name="i-lucide-triangle-alert"
                class="w-6 h-6"
              />
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">Remove Server</h3>
              <p class="text-xs text-gray-400">This action cannot be undone</p>
            </div>
          </div>

          <p class="text-sm text-gray-300">
            Are you sure you want to remove
            <strong class="text-white">{{ state.guild?.name }}</strong> from your dashboard? All
            module configurations and stored logs for this server will be permanently deleted.
          </p>

          <div class="flex justify-end gap-3 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showRemoveConfirm = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              :loading="removing"
              @click="handleRemove"
            >
              Remove Server
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  MODULE_CATEGORIES,
  getModuleDisplay,
  type ModuleCategoryKey,
} from "~/utils/module-metadata";

const route = useRoute();
const guildId = route.params.guild_id as string;
const {
  state,
  isModuleEnabled,
  hasModuleSettings,
  toggleModule,
  removeServer,
  loadRoles,
  saveDashboardRoles,
} = useServerSettings(guildId);

const activeMainTab = ref<"modules" | "settings">("modules");
const searchQuery = ref("");
const selectedCategory = ref<"all" | ModuleCategoryKey>("all");
const statusFilter = ref<"all" | "enabled" | "disabled">("all");

const updating = ref<string | null>(null);
const showRemoveConfirm = ref(false);
const removing = ref(false);

// Dashboard roles state
const selectedDashboardRoles = ref<string[]>([]);
const dashboardRolesDirty = ref(false);
const savingDashboardRoles = ref(false);

// Build role options for the select menu (exclude managed/bot roles)
const dashboardRoleOptions = computed(() =>
  state.value.roles
    .filter((r) => !r.managed)
    .map((r) => ({
      label: `@${r.name}`,
      value: r.id,
    })),
);

// Module counts
const activeModuleCount = computed(() => {
  return state.value.modules.filter((m) => isModuleEnabled(m.name)).length;
});
const totalModuleCount = computed(() => state.value.modules.length);

// Category module counts
const categoryCounts = computed(() => {
  const counts: Record<string, { total: number; enabled: number }> = {};
  for (const cat of MODULE_CATEGORIES) {
    counts[cat.key] = { total: 0, enabled: 0 };
  }
  for (const mod of state.value.modules) {
    const display = getModuleDisplay(mod);
    if (!display.category) continue;
    const catCount = counts[display.category];
    if (catCount) {
      catCount.total += 1;
      if (isModuleEnabled(mod.name)) {
        catCount.enabled += 1;
      }
    }
  }
  return counts;
});

// Grouped & filtered modules
const groupedModules = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  const filtered = state.value.modules.filter((mod) => {
    const display = getModuleDisplay(mod);
    if (!display.category) return false; // no meta declared — not a dashboard feature (e.g. reload)

    const enabled = isModuleEnabled(mod.name);

    if (statusFilter.value === "enabled" && !enabled) return false;
    if (statusFilter.value === "disabled" && enabled) return false;

    if (selectedCategory.value !== "all" && display.category !== selectedCategory.value) {
      return false;
    }

    if (query) {
      const matchName = mod.name.toLowerCase().includes(query);
      const matchDisplayName = display.displayName.toLowerCase().includes(query);
      const matchDesc = (mod.description || "").toLowerCase().includes(query);
      const matchTag = display.tags.some((t) => t.toLowerCase().includes(query));
      return matchName || matchDisplayName || matchDesc || matchTag;
    }

    return true;
  });

  const groups: Array<{
    category: (typeof MODULE_CATEGORIES)[number];
    modules: typeof state.value.modules;
    enabledCount: number;
  }> = [];

  for (const cat of MODULE_CATEGORIES) {
    if (selectedCategory.value !== "all" && selectedCategory.value !== cat.key) {
      continue;
    }
    const catMods = filtered
      .filter((m) => getModuleDisplay(m).category === cat.key)
      .sort((a, b) =>
        getModuleDisplay(a).displayName.localeCompare(getModuleDisplay(b).displayName),
      );
    if (catMods.length > 0) {
      groups.push({
        category: cat,
        modules: catMods,
        enabledCount: catMods.filter((m) => isModuleEnabled(m.name)).length,
      });
    }
  }

  return groups;
});

// Distinguishes "no modules matched your search/filter" from "the bot
// hasn't populated dashboard metadata yet" (every fetched module has
// category: null — e.g. right after this feature's DB migration, before
// the bot has restarted with the code that upserts `meta`). Only applies
// when no search/filter is active, since an active filter finding nothing
// is a normal "no results" case.
const hasUnmetadataedModules = computed(() => {
  const noActiveFilter =
    searchQuery.value.trim() === "" &&
    selectedCategory.value === "all" &&
    statusFilter.value === "all";
  return (
    noActiveFilter &&
    state.value.modules.length > 0 &&
    groupedModules.value.length === 0
  );
});

const setTagSearch = (tag: string) => {
  searchQuery.value = tag;
};

const resetFilters = () => {
  searchQuery.value = "";
  selectedCategory.value = "all";
  statusFilter.value = "all";
};

// Load roles and init selected values when section is visible
onMounted(async () => {
  if (state.value.isServerOwnerOrAdmin) {
    await loadRoles();
    selectedDashboardRoles.value = [...state.value.dashboardRoleIds];
  }
});

const handleSaveDashboardRoles = async () => {
  savingDashboardRoles.value = true;
  const success = await saveDashboardRoles(selectedDashboardRoles.value);
  if (success) {
    dashboardRolesDirty.value = false;
  }
  savingDashboardRoles.value = false;
};

const handleToggle = async (moduleName: string, enabled: boolean) => {
  updating.value = moduleName;
  await toggleModule(moduleName, enabled);
  updating.value = null;
};

const handleRemove = async () => {
  removing.value = true;
  await removeServer();
  removing.value = false;
};
</script>
