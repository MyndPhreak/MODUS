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
          class="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0"
        >
          <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-teal-400" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Server Events</h2>
          <p class="text-xs text-gray-500">
            Schedule and manage Discord native events
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('events') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("events") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Settings -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-5">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0"
          >
            <UIcon name="i-heroicons-cog-6-tooth" class="text-teal-400" />
          </div>
          <h3 class="font-semibold text-white">General</h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <UFormField
            label="Announcement Channel"
            hint="Where new events are announced. Leave empty to skip announcements."
          >
            <USelectMenu
              v-model="settings.announcementChannelId"
              :items="channelOptions"
              value-key="value"
              placeholder="No announcement channel"
              :loading="state.channelsLoading"
              :clear="{ ariaLabel: 'Clear channel selection' }"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Notify Roles"
            hint="Roles pinged when an event is announced."
          >
            <USelectMenu
              v-model="settings.notifyRoleIds"
              :items="roleOptions"
              value-key="value"
              multiple
              placeholder="No roles"
              :loading="state.rolesLoading"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="flex justify-end">
          <UButton
            color="primary"
            icon="i-heroicons-check"
            :loading="savingSettings"
            @click="saveSettings"
          >
            Save Settings
          </UButton>
        </div>
      </div>
    </div>

    <!-- Calendar -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent pointer-events-none"
      />
      <div class="relative flex flex-col lg:flex-row gap-5">
        <!-- Month grid -->
        <div class="flex-[2] min-w-0">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-white">{{ monthLabel }}</h3>
            <div class="flex items-center gap-1">
              <UButton
                icon="i-heroicons-chevron-left"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="prevMonth"
              />
              <UButton color="neutral" variant="ghost" size="xs" @click="goToday">
                Today
              </UButton>
              <UButton
                icon="i-heroicons-chevron-right"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="nextMonth"
              />
            </div>
          </div>

          <div class="grid grid-cols-7 gap-1 mb-1">
            <div
              v-for="d in ['S', 'M', 'T', 'W', 'T', 'F', 'S']"
              :key="d"
              class="text-center text-[10px] text-gray-500 uppercase tracking-wider py-1"
            >
              {{ d }}
            </div>
          </div>
          <div class="grid grid-cols-7 gap-1">
            <div
              v-for="cell in calendarCells"
              :key="cell.date.toISOString()"
              class="aspect-square rounded-lg border p-1 text-[11px] cursor-pointer transition-colors overflow-hidden"
              :class="[
                cell.inCurrentMonth
                  ? 'bg-white/[0.02] border-white/10 hover:border-teal-500/40'
                  : 'bg-transparent border-white/5 opacity-40',
                cell.isToday ? 'border-teal-500 border-2' : '',
              ]"
              @click="openDayModal(cell.date)"
            >
              <div class="font-semibold text-gray-300">{{ cell.date.getDate() }}</div>
              <div class="space-y-0.5 mt-0.5">
                <div
                  v-for="ev in cell.events.slice(0, 2)"
                  :key="ev.id"
                  class="truncate rounded bg-teal-500/80 text-white px-1 text-[9px] leading-tight"
                >
                  {{ ev.name }}
                </div>
                <div v-if="cell.events.length > 2" class="text-[9px] text-gray-500">
                  +{{ cell.events.length - 2 }} more
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- This month's events -->
        <div class="flex-1 min-w-0 lg:border-l lg:border-white/10 lg:pl-5">
          <div class="label mb-2 text-[10px] text-gray-500 uppercase tracking-wider">
            Events this month
          </div>
          <div v-if="loading" class="text-xs text-gray-500 py-4 text-center">
            Loading…
          </div>
          <div v-else-if="eventsThisMonth.length === 0" class="text-xs text-gray-500 py-4 text-center">
            No events scheduled this month
          </div>
          <div v-else class="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            <div
              v-for="ev in eventsThisMonth"
              :key="ev.id"
              class="flex items-start gap-3 rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 cursor-pointer hover:border-teal-500/30"
              @click="openDayModal(new Date(ev.scheduledStartTime))"
            >
              <div class="w-9 text-center shrink-0">
                <div class="text-sm font-bold text-teal-400 leading-none">
                  {{ new Date(ev.scheduledStartTime).getDate() }}
                </div>
                <div class="text-[9px] text-gray-500 uppercase">
                  {{ new Date(ev.scheduledStartTime).toLocaleDateString("en-US", { month: "short" }) }}
                </div>
              </div>
              <div class="min-w-0">
                <div class="text-xs font-semibold text-white truncate">{{ ev.name }}</div>
                <div class="text-[10px] text-gray-500">
                  {{ new Date(ev.scheduledStartTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) }}
                  · {{ ev.userCount }} interested
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const {
  state,
  isModuleEnabled,
  saveModuleSettings,
  getModuleConfig,
  loadChannels,
  loadRoles,
  channelOptions,
  roleOptions,
} = useServerSettings(guildId);
const { events, eventsByDay, loading, fetchEvents } = useEvents(guildId);

// ── Settings ──
const settings = ref({
  announcementChannelId: "" as string,
  notifyRoleIds: [] as string[],
});
const savingSettings = ref(false);

const saveSettings = async () => {
  savingSettings.value = true;
  await saveModuleSettings("events", {
    announcementChannelId: settings.value.announcementChannelId || null,
    notifyRoleIds: settings.value.notifyRoleIds,
  });
  savingSettings.value = false;
};

// ── Calendar ──
const viewDate = ref(new Date());

const monthLabel = computed(() =>
  viewDate.value.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
);

interface CalendarCell {
  date: Date;
  inCurrentMonth: boolean;
  isToday: boolean;
  events: import("~/composables/useEvents").CalendarEvent[];
}

const calendarCells = computed<CalendarCell[]>(() => {
  const year = viewDate.value.getFullYear();
  const month = viewDate.value.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  const today = new Date();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    cells.push({
      date,
      inCurrentMonth: date.getMonth() === month,
      isToday: date.toDateString() === today.toDateString(),
      events: eventsByDay.value.get(date.toDateString()) || [],
    });
  }
  return cells;
});

const eventsThisMonth = computed(() => {
  const year = viewDate.value.getFullYear();
  const month = viewDate.value.getMonth();
  return events.value
    .filter((e) => {
      const d = new Date(e.scheduledStartTime);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .sort(
      (a, b) =>
        new Date(a.scheduledStartTime).getTime() - new Date(b.scheduledStartTime).getTime(),
    );
});

function prevMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() - 1, 1);
}
function nextMonth() {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + 1, 1);
}
function goToday() {
  viewDate.value = new Date();
}

// Placeholder — replaced with a real day-detail/create modal in the next task.
function openDayModal(date: Date) {
  console.log("day clicked", date);
}

onMounted(() => {
  const saved = getModuleConfig("events");
  if (saved && Object.keys(saved).length > 0) {
    settings.value = {
      announcementChannelId: saved.announcementChannelId ?? "",
      notifyRoleIds: saved.notifyRoleIds ?? [],
    };
  }
  loadChannels();
  loadRoles();
  fetchEvents();
});
</script>
