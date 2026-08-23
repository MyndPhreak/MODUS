<template>
  <main class="log-explorer flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6 lg:p-8">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/80">Fleet evidence</p><h1 class="mt-1 text-2xl font-black tracking-tight text-white gradient-text">Log explorer</h1><p class="mt-1 text-sm text-gray-400">Search retained history while live events continue to stream.</p></div>
      <div class="flex flex-wrap gap-2"><UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" class="border border-white/8" @click="clearView">Clear view</UButton><UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" class="border border-white/8" :loading="historyLoading" @click="refreshHistory">Refresh</UButton></div>
    </header>

    <section class="glass-card rounded-2xl border border-white/8 p-4" aria-label="Log search filters">
      <div class="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_10rem_10rem_auto]">
        <UInput v-model="filters.search" icon="i-lucide-search" placeholder="Search log messages" aria-label="Search log messages" />
        <USelect v-model="filters.level" :items="levelItems" aria-label="Log level" />
        <USelect v-model="filters.scope" :items="scopeItems" aria-label="Log scope" />
        <UButton :icon="filtersOpen ? 'i-lucide-chevron-up' : 'i-lucide-sliders-horizontal'" color="neutral" variant="soft" :aria-expanded="filtersOpen" aria-controls="advanced-log-filters" @click="filtersOpen = !filtersOpen">More filters</UButton>
      </div>
      <div v-if="filtersOpen" id="advanced-log-filters" class="mt-3 grid gap-3 border-t border-white/8 pt-3 sm:grid-cols-2 xl:grid-cols-5">
        <UInput v-model="filters.guildId" placeholder="Guild ID" aria-label="Guild ID" inputmode="numeric" />
        <UInput v-model="filters.shardId" placeholder="Shard ID" aria-label="Shard ID" inputmode="numeric" />
        <UInput v-model="filters.source" placeholder="Source" aria-label="Log source" />
        <UInput v-model="filters.from" type="datetime-local" aria-label="Logs from" />
        <UInput v-model="filters.to" type="datetime-local" aria-label="Logs to" />
      </div>
    </section>

    <section class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/8 bg-gray-950/55 px-4 py-2.5 text-xs" aria-live="polite">
      <span class="inline-flex items-center gap-2 font-semibold text-gray-200"><span class="size-2 rounded-full" :class="connectionDotClass" aria-hidden="true" />Live stream: {{ connectionLabel }}</span>
      <span class="text-gray-400">{{ state.visible.length.toLocaleString() }} shown</span>
      <span v-if="state.pendingCount" class="font-semibold text-warning">{{ state.pendingCount }} pending</span>
      <span v-if="historyError" class="text-error" role="alert">{{ historyError }}</span>
      <div class="ml-auto flex flex-wrap items-center gap-3"><label class="flex cursor-pointer items-center gap-2 text-gray-300"><USwitch v-model="autoScroll" size="sm" /> Auto-scroll</label><UButton size="xs" :icon="state.paused ? 'i-lucide-play' : 'i-lucide-pause'" :color="state.paused ? 'primary' : 'neutral'" variant="soft" @click="togglePaused">{{ state.paused ? `Resume${state.pendingCount ? ` (${state.pendingCount})` : ''}` : 'Pause' }}</UButton></div>
    </section>

    <section class="min-h-[24rem] flex-1 overflow-hidden rounded-2xl border border-gray-800/70 bg-gray-950 shadow-inner" aria-label="Log results">
      <div v-if="historyLoading && !state.visible.length" class="flex h-full min-h-[24rem] items-center justify-center text-sm text-gray-400" aria-busy="true"><UIcon name="i-lucide-loader-circle" class="mr-2 size-5 animate-spin" /> Searching retained logs</div>
      <div v-else-if="!state.visible.length" class="flex h-full min-h-[24rem] flex-col items-center justify-center px-6 text-center"><UIcon name="i-lucide-terminal" class="size-8 text-gray-600" /><p class="mt-3 text-sm font-semibold text-gray-200">No logs in this view</p><p class="mt-1 max-w-md text-xs text-gray-500">Adjust the filters, refresh retained history, or wait for a matching live event.</p></div>
      <div v-else ref="terminal" class="h-full overflow-auto font-mono text-[11px] leading-5" tabindex="0" aria-label="Scrollable log entries">
        <article v-for="log in state.visible" :key="log.$id" class="group grid min-w-[48rem] grid-cols-[5.5rem_3.5rem_3rem_minmax(0,1fr)] gap-x-3 border-b border-white/[0.035] px-4 py-1.5 hover:bg-white/[0.035]">
          <time class="text-gray-500" :datetime="String(log.timestamp)">{{ formatTime(log.timestamp) }}</time><span class="font-black uppercase" :class="levelClass(log.level)">[{{ log.level }}]</span><span class="text-cyan-400/70">S{{ log.shardId ?? '—' }}</span>
          <div class="min-w-0"><div class="flex flex-wrap items-baseline gap-x-2"><NuxtLink v-if="guildLink(log.guildId)" :to="guildLink(log.guildId)!" class="rounded text-violet-300/80 underline-offset-2 hover:text-violet-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">[{{ log.guildId }}]</NuxtLink><span v-else-if="log.guildId" class="text-gray-500">[{{ log.guildId }}]</span><span v-if="log.source" class="text-emerald-300/70">[{{ log.source }}]</span><span class="break-words text-gray-200">{{ log.message }}</span></div></div>
        </article>
        <div v-if="state.nextCursor" class="sticky bottom-0 flex justify-center border-t border-white/8 bg-gray-950/90 p-3 backdrop-blur"><UButton size="sm" color="neutral" variant="soft" icon="i-lucide-history" :loading="olderLoading" @click="loadOlder">Load older</UButton></div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { applyHistoryPage, applyLiveLog, beginHistoryRequest, clearLogView, createAdminLogExplorerState, historyQuery, isCurrentHistoryRequest, matchesLogFilters, refreshLogHistory, routeQueryToLogFilters, serializeLogFilters, type AdminLogExplorerFilters, type AdminLogExplorerState } from '~/utils/admin-log-explorer'
import { resumeLiveLogs, type ClientLogDoc } from '~/utils/admin-log-state'

interface LogPage { items: ClientLogDoc[]; nextCursor: string | null }
type ConnectionState = 'connecting' | 'connected' | 'reconnecting'
const route = useRoute(); const router = useRouter(); const initialFilters = routeQueryToLogFilters(route.query)
const filters = reactive<AdminLogExplorerFilters>(initialFilters); const state = ref<AdminLogExplorerState>(createAdminLogExplorerState())
const historyLoading = ref(false); const olderLoading = ref(false); const historyError = ref<string | null>(null); const connection = ref<ConnectionState>('connecting'); const autoScroll = ref(true)
const filtersOpen = ref(Boolean(initialFilters.guildId || initialFilters.shardId || initialFilters.source || initialFilters.from || initialFilters.to)); const terminal = ref<HTMLElement | null>(null)
let eventSource: EventSource | null = null; let searchTimer: ReturnType<typeof setTimeout> | null = null; let syncingRoute = false
const levelItems = [{ label: 'All levels', value: 'all' }, { label: 'Info', value: 'info' }, { label: 'Warnings', value: 'warn' }, { label: 'Errors', value: 'error' }]
const scopeItems = [{ label: 'All scopes', value: 'all' }, { label: 'System', value: 'global' }, { label: 'Guild', value: 'guild' }]
const connectionLabel = computed(() => ({ connecting: 'Connecting', connected: 'Connected', reconnecting: 'Reconnecting' })[connection.value])
const connectionDotClass = computed(() => connection.value === 'connected' ? 'bg-success' : connection.value === 'reconnecting' ? 'bg-warning' : 'bg-gray-500')

async function fetchHistory(append = false): Promise<void> {
  const started = beginHistoryRequest(state.value); state.value = started.state; append ? olderLoading.value = true : historyLoading.value = true; historyError.value = null
  try {
    const page = await $fetch<LogPage>('/api/admin/logs', { query: historyQuery(filters, append ? state.value.nextCursor : null) })
    if (isCurrentHistoryRequest(state.value, started.requestId)) state.value = applyHistoryPage(state.value, page.items, page.nextCursor, append)
  } catch { if (isCurrentHistoryRequest(state.value, started.requestId)) historyError.value = 'Retained logs could not be loaded. Refresh to try again.' }
  finally { if (isCurrentHistoryRequest(state.value, started.requestId)) { historyLoading.value = false; olderLoading.value = false } }
}
async function syncUrlAndFetch(): Promise<void> { syncingRoute = true; await router.replace({ query: serializeLogFilters(filters) }); syncingRoute = false; state.value = clearLogView(refreshLogHistory(state.value)); await fetchHistory(false) }
watch(() => filters.search, () => { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => void syncUrlAndFetch(), 350) })
watch(() => [filters.level, filters.scope, filters.guildId, filters.shardId, filters.source, filters.from, filters.to], () => { if (searchTimer) clearTimeout(searchTimer); void syncUrlAndFetch() }, { deep: true })
watch(() => route.fullPath, () => { if (!syncingRoute) Object.assign(filters, routeQueryToLogFilters(route.query)) })
function loadOlder(): void { void fetchHistory(true) }; function clearView(): void { state.value = clearLogView(state.value) }; function refreshHistory(): void { state.value = refreshLogHistory(state.value); void fetchHistory(false) }
function togglePaused(): void { state.value = state.value.paused ? resumeLiveLogs(state.value, 1_000) as AdminLogExplorerState : { ...state.value, paused: true } }
function guildLink(guildId: string | null | undefined): string | null { return guildId && guildId !== 'global' ? `/dashboard/server/${encodeURIComponent(guildId)}/logs` : null }
function levelClass(level: string): string { return level === 'error' ? 'text-error' : level === 'warn' ? 'text-warning' : 'text-info' }
function formatTime(timestamp: string | Date): string { const date = new Date(timestamp); return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleTimeString([], { hour12: false }) }
async function scrollToLatest(): Promise<void> { if (!autoScroll.value || state.value.paused) return; await nextTick(); terminal.value?.scrollTo({ top: 0, behavior: 'smooth' }) }
function setupRealtime(): void {
  eventSource = new EventSource('/api/events/logs', { withCredentials: true }); eventSource.onopen = () => { connection.value = 'connected' }; eventSource.onerror = () => { connection.value = 'reconnecting' }
  eventSource.onmessage = (event) => { try { const payload = JSON.parse(event.data) as { kind?: string; log?: ClientLogDoc }; if (payload.kind === 'create' && payload.log && matchesLogFilters(payload.log, filters)) { state.value = applyLiveLog(state.value, payload.log); void scrollToLatest() } } catch { /* Ignore malformed events without interrupting reconnect. */ } }
}
onMounted(() => { void fetchHistory(); setupRealtime() }); onUnmounted(() => { if (searchTimer) clearTimeout(searchTimer); eventSource?.close(); eventSource = null })
</script>

<style scoped>
.gradient-text { background: linear-gradient(to bottom right, #fff 30%, #a855f7); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
@media (prefers-reduced-motion: reduce) { .log-explorer *, .log-explorer *::before, .log-explorer *::after { scroll-behavior: auto !important; transition: none !important; animation-duration: 0.01ms !important; } }
</style>
