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
        <div class="p-2.5 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20">
          <UIcon name="i-heroicons-chart-bar" class="text-fuchsia-400 text-lg" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Polls</h2>
          <p class="text-xs text-gray-500">
            Native Discord polls with live progress bars and vote tracking
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('polls') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("polls") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- Module Overview -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-fuchsia-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div class="p-1.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20">
            <UIcon name="i-heroicons-information-circle" class="text-fuchsia-400" />
          </div>
          <h3 class="font-semibold text-white">About This Module</h3>
        </div>

        <div class="space-y-3 text-xs text-gray-400 leading-relaxed">
          <p>
            The Polls module uses Discord's <strong class="text-gray-300">native poll system</strong>,
            giving members live progress bars, real vote counts, and a built-in expiry timer
            — all rendered directly in the Discord client with no extra setup required.
          </p>

          <!-- Commands -->
          <div class="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
            <h4 class="text-sm font-semibold text-white">Available Commands</h4>
            <div class="space-y-3">
              <div class="flex items-start gap-3">
                <code class="text-fuchsia-400 bg-fuchsia-500/10 px-2 py-0.5 rounded text-[11px] shrink-0">
                  /poll create
                </code>
                <span>
                  Create a native Discord poll with a question, up to 10 options, a duration
                  (1–168 hours), and optional multi-select. Members see live progress bars
                  directly in the Discord client.
                </span>
              </div>
              <div class="flex items-start gap-3">
                <code class="text-fuchsia-400 bg-fuchsia-500/10 px-2 py-0.5 rounded text-[11px] shrink-0">
                  /poll end
                </code>
                <span>
                  End an active poll early by message ID. Finalizes vote counts immediately.
                  Requires <strong class="text-gray-300">Manage Messages</strong>.
                </span>
              </div>
              <div class="flex items-start gap-3">
                <code class="text-fuchsia-400 bg-fuchsia-500/10 px-2 py-0.5 rounded text-[11px] shrink-0">
                  /poll results
                </code>
                <span>
                  Fetch a live or finalized results snapshot for any poll by message ID.
                  Shows a progress bar and percentage breakdown per option.
                </span>
              </div>
            </div>
          </div>

          <!-- Feature list -->
          <ul class="space-y-1.5 list-none">
            <li class="flex items-start gap-2">
              <UIcon name="i-heroicons-chart-bar" class="text-fuchsia-400 mt-0.5 shrink-0" />
              <span>
                <strong class="text-gray-300">Live Progress Bars</strong> —
                Discord renders per-option progress bars natively in the client for every voter.
              </span>
            </li>
            <li class="flex items-start gap-2">
              <UIcon name="i-heroicons-clock" class="text-blue-400 mt-0.5 shrink-0" />
              <span>
                <strong class="text-gray-300">Auto-Expiry</strong> —
                Polls close automatically after 1–168 hours. Expire early anytime with
                <code class="bg-white/5 px-1 rounded">/poll end</code>.
              </span>
            </li>
            <li class="flex items-start gap-2">
              <UIcon name="i-heroicons-adjustments-horizontal" class="text-green-400 mt-0.5 shrink-0" />
              <span>
                <strong class="text-gray-300">Multi-Select</strong> —
                Optionally allow members to vote for more than one option per poll.
              </span>
            </li>
            <li class="flex items-start gap-2">
              <UIcon name="i-heroicons-shield-check" class="text-amber-400 mt-0.5 shrink-0" />
              <span>
                <strong class="text-gray-300">Permission Gated</strong> —
                Creating and ending polls requires Manage Messages. Viewing results is open
                to all members.
              </span>
            </li>
          </ul>
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
