/**
 * useEvents — dashboard calendar data + CRUD for the events module.
 */

export interface CalendarEvent {
  id: string;
  name: string;
  description: string | null;
  scheduledStartTime: string;
  scheduledEndTime: string | null;
  status: number;
  entityType: number;
  location: string | null;
  userCount: number;
}

export function useEvents(guildId: string) {
  const events = useState<CalendarEvent[]>(`calendar-events-${guildId}`, () => []);
  const loading = ref(true);
  const actionLoading = ref(false);
  const error = ref<string | null>(null);
  const toast = useToast();

  const fetchEvents = async () => {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch<{ events: CalendarEvent[] }>(
        "/api/discord/scheduled-events",
        { params: { guild_id: guildId } },
      );
      events.value = data.events;
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || "Failed to load events";
      toast.add({ title: "Error", description: error.value, color: "error" });
    } finally {
      loading.value = false;
    }
  };

  const createEvent = async (data: {
    name: string;
    description?: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    location: string;
  }) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch("/api/discord/scheduled-events", {
        method: "POST",
        body: { guild_id: guildId, ...data },
      });
      await fetchEvents();
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || "Failed to create event";
      toast.add({ title: "Error", description: error.value, color: "error" });
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const updateEvent = async (eventId: string, data: Record<string, any>) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch(`/api/discord/scheduled-events/${eventId}`, {
        method: "PATCH",
        body: { guild_id: guildId, ...data },
      });
      await fetchEvents();
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || "Failed to update event";
      toast.add({ title: "Error", description: error.value, color: "error" });
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const deleteEvent = async (eventId: string) => {
    actionLoading.value = true;
    error.value = null;
    try {
      await $fetch(`/api/discord/scheduled-events/${eventId}`, {
        method: "DELETE",
        params: { guild_id: guildId },
      });
      await fetchEvents();
    } catch (err: any) {
      error.value = err?.data?.statusMessage || err?.message || "Failed to delete event";
      toast.add({ title: "Error", description: error.value, color: "error" });
      throw err;
    } finally {
      actionLoading.value = false;
    }
  };

  const eventsByDay = computed(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events.value) {
      const key = new Date(ev.scheduledStartTime).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  });

  return {
    events,
    eventsByDay,
    loading,
    actionLoading,
    error,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
