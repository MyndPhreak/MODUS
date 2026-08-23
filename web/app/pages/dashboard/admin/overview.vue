<template>
  <main class="operations-overview p-5 sm:p-8 space-y-6 sm:space-y-8">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/80">
          Fleet operations
        </p>
        <h1 class="mt-1 text-2xl font-black tracking-tight text-white gradient-text">
          Operations overview
        </h1>
        <p class="mt-1 text-sm text-gray-400">
          Review fleet state and address the signals that need action.
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="loading"
        :disabled="loading"
        class="self-start border border-white/8 bg-white/[0.03]"
        @click="loadOverview"
      >
        Refresh
      </UButton>
    </header>

    <section
      v-if="loading && !overview"
      class="glass-card rounded-2xl border border-white/8 px-6 py-16 text-center"
      aria-live="polite"
      aria-busy="true"
    >
      <UIcon name="i-lucide-loader-circle" class="mx-auto size-8 animate-spin text-violet-400" />
      <p class="mt-3 text-sm font-medium text-white">Loading operations overview</p>
      <p class="mt-1 text-sm text-gray-300">Checking the latest reported fleet state.</p>
    </section>

    <section
      v-else-if="requestError"
      class="glass-card rounded-2xl border border-error/30 bg-error/5 px-6 py-10 text-center"
      role="alert"
    >
      <UIcon name="i-lucide-triangle-alert" class="mx-auto size-8 text-error" />
      <h2 class="mt-3 text-base font-bold text-white">Overview unavailable</h2>
      <p class="mx-auto mt-1 max-w-md text-sm text-gray-400">{{ requestError }}</p>
      <UButton class="mt-5" icon="i-lucide-refresh-cw" @click="loadOverview">
        Retry loading overview
      </UButton>
    </section>

    <template v-else-if="overview">
      <section
        class="glass-card relative overflow-hidden rounded-2xl border border-white/8 px-5 py-5 sm:px-6"
        aria-labelledby="fleet-signal-heading"
      >
        <div class="flex flex-col gap-1 border-b border-white/8 pb-4 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 id="fleet-signal-heading" class="text-sm font-bold text-white">Fleet signal</h2>
          <p class="text-xs text-gray-300">Generated {{ formatTimestamp(overview.generatedAt) }}</p>
        </div>
        <div class="relative mt-5">
          <div aria-hidden="true" class="absolute left-[16.67%] right-[16.67%] top-5 hidden h-px bg-gradient-to-r from-violet-500/30 via-indigo-400/50 to-violet-500/30 md:block" />
          <ol class="relative grid gap-4 md:grid-cols-3 md:gap-8">
            <li v-for="station in signalStations" :key="station.id" class="flex items-start gap-3">
              <span
                class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border"
                :class="stationClass(station.status)"
              >
                <UIcon :name="statusIcon(station.status)" class="size-5" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-300">{{ station.label }}</p>
                <p class="mt-1 text-sm font-bold text-white">{{ station.value }}</p>
                <p class="mt-0.5 text-xs text-gray-400">{{ statusLabel(station.status) }}</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section
        class="glass-card rounded-2xl border px-5 py-5 sm:px-6"
        :class="attentionItems.length ? 'border-warning/50 bg-warning/10 ring-1 ring-warning/30' : 'border-white/8'"
        aria-labelledby="attention-heading"
        aria-live="polite"
      >
        <div class="flex flex-col gap-3 border-b border-white/8 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-start gap-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-xl border"
              :class="attentionItems.length ? 'border-warning/40 bg-warning/15 text-warning' : 'border-success/30 bg-success/10 text-success'"
            >
              <UIcon :name="attentionItems.length ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check-big'" class="size-5" aria-hidden="true" />
            </span>
            <div>
              <p v-if="attentionItems.length" class="text-xs font-bold uppercase tracking-[0.16em] text-warning">Action needed</p>
              <h2 id="attention-heading" class="text-base font-bold text-white">Needs attention</h2>
              <p class="mt-0.5 text-xs text-gray-300">
                {{ attentionItems.length ? 'Unhealthy and degraded signals are listed first.' : 'The latest checks did not find any signals that need attention.' }}
              </p>
            </div>
          </div>
          <UBadge :color="attentionItems.length ? 'warning' : 'success'" variant="soft">
            {{ attentionItems.length ? `${attentionItems.length} open` : 'All clear' }}
          </UBadge>
        </div>
        <div v-if="attentionItems.length" class="mt-1 divide-y divide-white/10">
          <component
            :is="item.href ? NuxtLink : 'div'"
            v-for="item in attentionItems"
            :key="item.key"
            :to="item.href"
            class="group flex gap-4 px-1 py-5 sm:px-2"
            :class="item.href ? 'transition-colors hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset' : ''"
          >
            <span class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border" :class="stationClass(item.severity)">
              <UIcon :name="statusIcon(item.severity)" class="size-5" aria-hidden="true" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-base font-bold text-white">{{ item.title }}</h3>
                <UBadge :color="statusColor(item.severity)" variant="soft" size="xs">{{ statusLabel(item.severity) }}</UBadge>
              </div>
              <p class="mt-1 text-sm text-gray-300">{{ item.description }}</p>
              <p v-if="item.occurredAt" class="mt-1 text-xs text-gray-300">Reported {{ formatTimestamp(item.occurredAt) }}</p>
            </div>
            <UIcon v-if="item.href" name="i-lucide-arrow-up-right" class="mt-1 size-5 shrink-0 text-gray-400 transition-colors group-hover:text-violet-300" aria-hidden="true" />
          </component>
        </div>
      </section>

      <section aria-label="Fleet summary" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article v-for="summary in fleetSummary" :key="summary.label" class="glass-card rounded-2xl border border-white/8 p-5 motion-reduce:hover:transform-none">
          <div class="flex items-start justify-between gap-3">
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-300">{{ summary.label }}</p>
            <UIcon :name="summary.icon" class="size-4 shrink-0 text-violet-300" aria-hidden="true" />
          </div>
          <p class="mt-3 text-2xl font-black tracking-tight text-white">{{ summary.value }}</p>
          <p class="mt-1 text-xs text-gray-400">{{ summary.detail }}</p>
        </article>
      </section>

      <section class="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.85fr)]">
        <div class="space-y-6">
          <section class="glass-card rounded-2xl border border-white/8" aria-labelledby="dependency-heading">
            <div class="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
              <div>
                <h2 id="dependency-heading" class="text-sm font-bold text-white">Dependencies</h2>
                <p class="mt-0.5 text-xs text-gray-300">Latest connection checks</p>
              </div>
              <UBadge :color="statusColor(dependencyStatus)" variant="soft">
                {{ dependencyStatusLabel }}
              </UBadge>
            </div>
            <ul v-if="overview.dependencies.length" class="divide-y divide-white/6">
              <li v-for="dependency in overview.dependencies" :key="dependency.key" class="flex items-center gap-3 px-5 py-4 sm:px-6">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-lg border" :class="stationClass(dependency.status)">
                  <UIcon :name="statusIcon(dependency.status)" class="size-4" aria-hidden="true" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p class="text-sm font-semibold text-white">{{ dependency.label }}</p>
                    <span v-if="dependency.required" class="text-xs text-gray-300">Required</span>
                  </div>
                  <p class="mt-0.5 text-xs text-gray-400">{{ dependency.message }}</p>
                </div>
                <div class="shrink-0 text-right">
                  <p v-if="dependency.latencyMs !== undefined" class="font-mono text-xs text-gray-300">{{ dependency.latencyMs }} ms</p>
                  <p class="mt-0.5 text-xs text-gray-300">{{ formatRelativeTime(dependency.checkedAt) }}</p>
                </div>
              </li>
            </ul>
            <div v-else class="px-6 py-10 text-center">
              <UIcon name="i-lucide-circle-help" class="mx-auto size-7 text-gray-400" aria-hidden="true" />
              <p class="mt-3 text-sm text-gray-400">No dependency checks were reported.</p>
            </div>
          </section>

          <section class="glass-card rounded-2xl border border-white/8" aria-labelledby="storage-heading">
            <div class="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
              <div>
                <h2 id="storage-heading" class="text-sm font-bold text-white">R2 usage</h2>
                <p class="mt-0.5 text-xs text-gray-300">Storage analytics</p>
              </div>
              <UBadge :color="statusColor(overview.r2Usage.status)" variant="soft">
                {{ statusLabel(overview.r2Usage.status) }}
              </UBadge>
            </div>
            <template v-if="overview.r2Usage.status === 'available'">
              <div class="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-300">Stored data</p>
                  <p class="mt-2 text-xl font-black text-white">{{ overview.r2Usage.payloadSizeFormatted }}</p>
                </div>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-300">Objects</p>
                  <p class="mt-2 text-xl font-black text-white">{{ formatNumber(overview.r2Usage.objectCount) }}</p>
                </div>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-300">Uploads</p>
                  <p class="mt-2 text-xl font-black text-white">{{ formatNumber(overview.r2Usage.uploadCount) }}</p>
                </div>
              </div>
              <p class="border-t border-white/6 px-5 py-3 text-xs text-gray-300 sm:px-6">
                Last reported {{ formatTimestamp(overview.r2Usage.sampledAt) }} · Metadata {{ overview.r2Usage.metadataSizeFormatted }}
              </p>
            </template>
            <div v-else class="px-5 py-6 sm:px-6">
              <p class="text-sm text-gray-300">{{ overview.r2Usage.message }}</p>
              <p class="mt-1 text-xs text-gray-300">R2 usage is last reported analytics, not a real-time storage scan.</p>
            </div>
          </section>
        </div>

        <section class="glass-card rounded-2xl border border-white/8" aria-labelledby="recent-heading">
          <div class="border-b border-white/8 px-5 py-4 sm:px-6">
            <h2 id="recent-heading" class="text-sm font-bold text-white">Recent activity</h2>
            <p class="mt-0.5 text-xs text-gray-300">Retained log and registration summaries</p>
          </div>
          <div class="divide-y divide-white/6">
            <article v-for="window in recentWindows" :key="window.label" class="px-5 py-5 sm:px-6">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-sm font-semibold text-white">{{ window.label }}</h3>
                <UBadge :color="window.historyComplete ? 'success' : 'warning'" variant="soft" size="xs">
                  {{ window.historyComplete ? 'Full history' : 'Partial retained history' }}
                </UBadge>
              </div>
              <dl class="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <dt class="text-xs text-gray-300">Errors</dt>
                  <dd class="mt-1 font-mono text-sm font-semibold text-white">{{ formatNumber(window.errors) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-gray-300">Warnings</dt>
                  <dd class="mt-1 font-mono text-sm font-semibold text-white">{{ formatNumber(window.warnings) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-gray-300">Registered servers</dt>
                  <dd class="mt-1 font-mono text-sm font-semibold text-white">{{ formatNumber(window.registeredServers) }}</dd>
                </div>
              </dl>
            </article>
          </div>
        </section>
      </section>

    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { NuxtLink } from '#components'
import { getFleetTelemetryPresentation } from '~/utils/admin-operations'
import type {
  AdminOverviewResponse,
  DependencyStatus,
} from '../../../../server/utils/admin-operations/types'

type DisplayStatus = DependencyStatus | 'available' | 'unavailable'
type BadgeColor = 'success' | 'warning' | 'error' | 'neutral'

interface SignalStation {
  id: string
  label: string
  value: string
  status: DisplayStatus
}

const overview = shallowRef<AdminOverviewResponse | null>(null)
const loading = ref(true)
const requestError = ref<string | null>(null)

const fleetTelemetry = computed(() => {
  if (!overview.value) return null
  return getFleetTelemetryPresentation(overview.value.fleet)
})

const attentionItems = computed(() => overview.value?.attentionItems ?? [])

const dependencyStatus = computed<DependencyStatus>(() => {
  if (!overview.value?.dependencies.length) return 'unconfigured'
  if (overview.value.dependencies.some((dependency) => dependency.status === 'unhealthy')) return 'unhealthy'
  if (overview.value.dependencies.some((dependency) => dependency.status === 'degraded')) return 'degraded'
  if (overview.value.dependencies.some((dependency) => dependency.status === 'healthy')) return 'healthy'
  return 'unconfigured'
})

const dependencyStatusLabel = computed(() => {
  const dependencies = overview.value?.dependencies ?? []
  return `${dependencies.filter((dependency) => dependency.status === 'healthy').length}/${dependencies.length} healthy`
})

const signalStations = computed<SignalStation[]>(() => {
  if (!overview.value || !fleetTelemetry.value) return []
  const telemetry = fleetTelemetry.value
  const dependencyCount = overview.value.dependencies.filter((dependency) => dependency.status === 'healthy').length

  return [
    {
      id: 'overall',
      label: 'Overall state',
      value: statusLabel(overview.value.overallStatus),
      status: overview.value.overallStatus,
    },
    {
      id: 'shards',
      label: 'Active shards',
      value: telemetry.shardValue,
      status: telemetry.shardStatus,
    },
    {
      id: 'dependencies',
      label: 'Dependencies',
      value: `${dependencyCount} / ${overview.value.dependencies.length} healthy`,
      status: dependencyStatus.value,
    },
  ]
})

const fleetSummary = computed(() => {
  if (!overview.value || !fleetTelemetry.value) return []
  const { fleet } = overview.value
  const telemetry = fleetTelemetry.value
  return [
    {
      label: 'Servers',
      value: formatNumber(fleet.servers.registered),
      detail: `${formatNumber(fleet.servers.online)} online · ${formatNumber(fleet.servers.offline)} offline`,
      icon: 'i-lucide-server',
    },
    {
      label: 'Shards',
      value: telemetry.shardValue,
      detail: telemetry.shardDetail,
      icon: 'i-lucide-network',
    },
    {
      label: 'Music',
      value: fleet.music.enabled ? 'Enabled' : 'Disabled',
      detail: fleet.music.enabled ? 'Fleet-wide playback is available' : (fleet.music.reason ?? 'Fleet-wide playback is disabled'),
      icon: 'i-lucide-music-2',
    },
    {
      label: 'Versions',
      value: telemetry.versionValue,
      detail: telemetry.versionDetail,
      icon: 'i-lucide-git-compare-arrows',
    },
  ]
})

const recentWindows = computed(() => {
  if (!overview.value) return []
  return [
    { label: 'Last 24 hours', ...overview.value.recentSummaries.last24Hours },
    { label: 'Last 7 days', ...overview.value.recentSummaries.last7Days },
  ]
})

function statusLabel(status: DisplayStatus): string {
  return {
    healthy: 'Healthy',
    degraded: 'Degraded',
    unhealthy: 'Unhealthy',
    unconfigured: 'Not configured',
    available: 'Available',
    unavailable: 'Unavailable',
  }[status]
}

function statusColor(status: DisplayStatus): BadgeColor {
  if (status === 'healthy' || status === 'available') return 'success'
  if (status === 'degraded') return 'warning'
  if (status === 'unhealthy' || status === 'unavailable') return 'error'
  return 'neutral'
}

function statusIcon(status: DisplayStatus): string {
  if (status === 'healthy' || status === 'available') return 'i-lucide-circle-check-big'
  if (status === 'degraded') return 'i-lucide-triangle-alert'
  if (status === 'unhealthy' || status === 'unavailable') return 'i-lucide-circle-x'
  return 'i-lucide-circle-help'
}

function stationClass(status: DisplayStatus): string {
  if (status === 'healthy' || status === 'available') return 'border-success/30 bg-success/10 text-success'
  if (status === 'degraded') return 'border-warning/30 bg-warning/10 text-warning'
  if (status === 'unhealthy' || status === 'unavailable') return 'border-error/30 bg-error/10 text-error'
  return 'border-white/10 bg-white/[0.03] text-gray-400'
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'an unknown time'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Reported recently'
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}

async function loadOverview(): Promise<void> {
  loading.value = true
  requestError.value = null
  try {
    overview.value = await $fetch<AdminOverviewResponse>('/api/admin/overview')
  } catch {
    requestError.value = 'The latest operations data could not be loaded. Retry to check the fleet again.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadOverview()
})
</script>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .operations-overview .glass-card,
  .operations-overview .glass-card::before,
  .operations-overview .group,
  .operations-overview .group * {
    animation: none !important;
    transition: none !important;
  }

  .operations-overview .glass-card,
  .operations-overview .glass-card:hover,
  .operations-overview .glass-card::before,
  .operations-overview .glass-card:hover::before {
    transform: none !important;
  }
}
</style>
