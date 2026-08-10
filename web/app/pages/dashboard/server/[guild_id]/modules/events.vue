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

    <!-- Day detail / create / edit modal -->
    <UModal v-model:open="showDayModal" :title="selectedDateLabel">
      <template #body>
        <div class="space-y-4 p-1">
          <div v-if="selectedDayEvents.length > 0" class="space-y-2">
            <div class="text-[10px] text-gray-500 uppercase tracking-wider">
              Events on this day
            </div>
            <div
              v-for="ev in selectedDayEvents"
              :key="ev.id"
              class="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5"
            >
              <div class="min-w-0">
                <div class="text-xs font-semibold text-white truncate">{{ ev.name }}</div>
                <div class="text-[10px] text-gray-500">
                  {{ new Date(ev.scheduledStartTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) }}
                  · {{ ev.userCount }} interested
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <UButton
                  v-if="ev.entityType === 3"
                  icon="i-heroicons-pencil"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="startEdit(ev)"
                />
                <UButton
                  v-else
                  icon="i-heroicons-pencil"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  disabled
                  title="This event isn't managed by this calendar."
                />
                <UButton
                  icon="i-heroicons-trash"
                  color="error"
                  variant="ghost"
                  size="xs"
                  @click="removeEvent(ev)"
                />
              </div>
            </div>
          </div>

          <div class="text-[10px] text-gray-500 uppercase tracking-wider">
            {{ editingEventId ? "Edit event" : "Add an event" }}
          </div>
          <UFormField label="Name">
            <UInput v-model="form.name" placeholder="e.g. Community Game Night" class="w-full" />
          </UFormField>
          <UFormField label="Date & Time" hint="In your local timezone.">
            <UInput v-model="form.datetime" type="datetime-local" class="w-full" />
          </UFormField>
          <UFormField label="Location">
            <UInput v-model="form.location" placeholder="Voice channel, URL, or text" class="w-full" />
          </UFormField>
          <UFormField label="Description (optional)">
            <UTextarea v-model="form.description" :rows="2" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end w-full">
          <UButton v-if="editingEventId" variant="ghost" color="neutral" @click="cancelEdit">
            Cancel Edit
          </UButton>
          <UButton
            color="primary"
            :icon="editingEventId ? 'i-heroicons-check' : 'i-heroicons-plus'"
            :loading="actionLoading"
            @click="submitForm"
          >
            {{ editingEventId ? "Save Changes" : "Add Event" }}
          </UButton>
        </div>
      </template>
    </UModal>
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
const { events, eventsByDay, loading, actionLoading, fetchEvents, createEvent, updateEvent, deleteEvent } =
  useEvents(guildId);

// ── Settings ──
const settings = ref({
  announcementChannelId: "" as string,
  notifyRoleIds: [] as string[],
});
const savingSettings = ref(false);

const saveSettings = async () => {
  savingSettings.value = true;
  await saveModuleSettings("events", {
    announcementChannelId: settings.value.announcementChannelId || undefined,
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

// ── Day modal ──
const showDayModal = ref(false);
const selectedDate = ref<Date | null>(null);
const editingEventId = ref<string | null>(null);
const toast = useToast();

const selectedDateLabel = computed(() =>
  selectedDate.value
    ? selectedDate.value.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "",
);

const selectedDayEvents = computed(() =>
  selectedDate.value ? eventsByDay.value.get(selectedDate.value.toDateString()) || [] : [],
);

const form = ref({
  name: "",
  datetime: "",
  location: "",
  description: "",
});

/** Format an ISO timestamp as a `datetime-local` input value, in the browser's local time. */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resetForm(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  form.value = {
    name: "",
    datetime: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T19:00`,
    location: "",
    description: "",
  };
  editingEventId.value = null;
}

function openDayModal(date: Date) {
  selectedDate.value = date;
  resetForm(date);
  showDayModal.value = true;
}

function startEdit(ev: import("~/composables/useEvents").CalendarEvent) {
  editingEventId.value = ev.id;
  form.value = {
    name: ev.name,
    datetime: toDatetimeLocalValue(ev.scheduledStartTime),
    location: ev.location || "",
    description: ev.description || "",
  };
}

function cancelEdit() {
  if (selectedDate.value) resetForm(selectedDate.value);
}

/**
 * Compute the end time for the submitted start time. When editing an
 * existing event, preserve its original duration instead of forcing a flat
 * 1-hour window (which would silently truncate multi-hour events). New
 * events default to 1 hour.
 */
function computeEndDate(startDate: Date): Date {
  if (editingEventId.value) {
    const original = events.value.find((e) => e.id === editingEventId.value);
    if (original?.scheduledEndTime) {
      const originalStart = new Date(original.scheduledStartTime).getTime();
      const originalEnd = new Date(original.scheduledEndTime).getTime();
      const duration = originalEnd - originalStart;
      if (duration > 0) return new Date(startDate.getTime() + duration);
    }
  }
  return new Date(startDate.getTime() + 60 * 60 * 1000);
}

async function submitForm() {
  if (!form.value.name.trim() || !form.value.datetime || !form.value.location.trim()) {
    toast.add({
      title: "Missing fields",
      description: "Name, date/time, and location are required.",
      color: "error",
    });
    return;
  }

  const startDate = new Date(form.value.datetime);
  const endDate = computeEndDate(startDate);

  try {
    if (editingEventId.value) {
      await updateEvent(editingEventId.value, {
        name: form.value.name,
        description: form.value.description || undefined,
        scheduled_start_time: startDate.toISOString(),
        scheduled_end_time: endDate.toISOString(),
        location: form.value.location,
      });
      toast.add({ title: "Event updated", color: "success" });
    } else {
      await createEvent({
        name: form.value.name,
        description: form.value.description || undefined,
        scheduled_start_time: startDate.toISOString(),
        scheduled_end_time: endDate.toISOString(),
        location: form.value.location,
      });
      toast.add({ title: "Event created", color: "success" });
    }
    if (selectedDate.value) resetForm(selectedDate.value);
  } catch {
    // Error toast already shown by useEvents.
  }
}

async function removeEvent(ev: import("~/composables/useEvents").CalendarEvent) {
  if (!confirm(`Delete "${ev.name}"? This cannot be undone.`)) return;
  try {
    await deleteEvent(ev.id);
    toast.add({ title: "Event deleted", color: "success" });
    if (editingEventId.value === ev.id && selectedDate.value) resetForm(selectedDate.value);
  } catch {
    // Error toast already shown by useEvents.
  }
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
