<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/dashboard/server/${guildId}/modules`"
        class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <UIcon name="i-heroicons-arrow-left" class="text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div class="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20">
          <UIcon
            name="i-heroicons-calendar-days"
            class="text-teal-400 text-lg"
          />
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

    <!-- Module Overview -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20"
          >
            <UIcon
              name="i-heroicons-information-circle"
              class="text-teal-400"
            />
          </div>
          <h3 class="font-semibold text-white">About This Module</h3>
        </div>

        <div class="space-y-3 text-xs text-gray-400 leading-relaxed">
          <p>
            The Events module provides Discord slash commands for creating
            native scheduled events directly from chat. A user-friendly form
            dialog opens when the command is used — no ISO timestamps needed.
          </p>

          <div
            class="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-3"
          >
            <h4 class="text-sm font-semibold text-white">Available Commands</h4>
            <div class="space-y-2">
              <div class="flex items-start gap-3">
                <code
                  class="text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded text-[11px] shrink-0"
                  >/event create</code
                >
                <span
                  >Opens a form to create an event with name, date, time,
                  timezone, and location. Optionally pass a
                  <code class="text-gray-300 bg-white/5 px-1 rounded text-[11px]">description</code>
                  parameter.</span
                >
              </div>
            </div>
          </div>

          <!-- Form fields breakdown -->
          <div
            class="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-3"
          >
            <h4 class="text-sm font-semibold text-white">Form Fields</h4>
            <div class="space-y-2">
              <div class="flex items-start gap-3">
                <span class="text-teal-400 font-mono text-[11px] shrink-0 w-20">Name</span>
                <span>The name of your event (required)</span>
              </div>
              <div class="flex items-start gap-3">
                <span class="text-teal-400 font-mono text-[11px] shrink-0 w-20">Date</span>
                <span>Accepts <code class="text-gray-300 bg-white/5 px-1 rounded text-[11px]">12/31/2026</code>, <code class="text-gray-300 bg-white/5 px-1 rounded text-[11px]">2026-12-31</code>, or <code class="text-gray-300 bg-white/5 px-1 rounded text-[11px]">Dec 31, 2026</code></span>
              </div>
              <div class="flex items-start gap-3">
                <span class="text-teal-400 font-mono text-[11px] shrink-0 w-20">Time</span>
                <span>Accepts <code class="text-gray-300 bg-white/5 px-1 rounded text-[11px]">8:00 PM</code> or <code class="text-gray-300 bg-white/5 px-1 rounded text-[11px]">20:00</code></span>
              </div>
              <div class="flex items-start gap-3">
                <span class="text-teal-400 font-mono text-[11px] shrink-0 w-20">Timezone</span>
                <span>Abbreviation like <code class="text-gray-300 bg-white/5 px-1 rounded text-[11px]">EST</code>, <code class="text-gray-300 bg-white/5 px-1 rounded text-[11px]">PST</code>, or offset like <code class="text-gray-300 bg-white/5 px-1 rounded text-[11px]">UTC+5</code> (defaults to UTC)</span>
              </div>
              <div class="flex items-start gap-3">
                <span class="text-teal-400 font-mono text-[11px] shrink-0 w-20">Location</span>
                <span>URL or text description (required)</span>
              </div>
            </div>
          </div>

          <ul class="space-y-1.5 list-none">
            <li class="flex items-start gap-2">
              <UIcon
                name="i-heroicons-calendar-days"
                class="text-teal-400 mt-0.5 shrink-0"
              />
              <span
                ><strong class="text-gray-300">Native Discord Events</strong>
                — Uses Discord's built-in scheduled events feature for
                maximum visibility.</span
              >
            </li>
            <li class="flex items-start gap-2">
              <UIcon
                name="i-heroicons-clock"
                class="text-blue-400 mt-0.5 shrink-0"
              />
              <span
                ><strong class="text-gray-300">Local Time Display</strong> —
                Discord automatically shows event times in each user's local
                timezone.</span
              >
            </li>
            <li class="flex items-start gap-2">
              <UIcon
                name="i-heroicons-shield-check"
                class="text-green-400 mt-0.5 shrink-0"
              />
              <span
                ><strong class="text-gray-300">Permission Gated</strong> —
                Requires the Manage Events permission to use.</span
              >
            </li>
          </ul>

          <div
            class="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10"
          >
            <UIcon
              name="i-heroicons-sparkles"
              class="text-amber-400 text-sm shrink-0"
            />
            <span class="text-xs text-amber-300">
              More configuration options (announcement channels, RSVP
              notifications, recurring events) will be added in a future
              update.
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const guildId = route.params.guild_id as string;
const { isModuleEnabled } = useServerSettings(guildId);
</script>
