<template>
  <div class="mtp">
    <!-- ═══ Master Transport ═══ -->
    <div class="mtp-transport">
      <button
        class="mtp-btn mtp-play"
        :disabled="!anyReady"
        @click="togglePlayPause"
      >
        <UIcon
          :name="
            isPlaying ? 'i-heroicons-pause-solid' : 'i-heroicons-play-solid'
          "
        />
      </button>

      <span class="mtp-time">
        <span class="mtp-time-cur">{{ fmtTime(currentTime) }}</span>
        <span class="mtp-time-sep">/</span>
        <span class="mtp-time-tot">{{ fmtTime(masterDuration) }}</span>
      </span>

      <!-- Seek bar -->
      <div class="mtp-seek" ref="seekRef" @click="onSeekClick">
        <div class="mtp-seek-rail">
          <div class="mtp-seek-fill" :style="{ width: seekPct + '%' }" />
        </div>
        <div class="mtp-seek-thumb" :style="{ left: seekPct + '%' }" />
      </div>

      <button
        class="mtp-btn"
        :disabled="!isPlaying && currentTime === 0"
        @click="stopAll"
      >
        <UIcon name="i-heroicons-stop-solid" class="text-sm" />
      </button>

      <div class="mtp-sep" />

      <!-- Downloads -->
      <button
        v-if="mixedFileId"
        class="mtp-dl"
        :disabled="downloadingMixed"
        @click="dlMixed"
        title="Download mixed audio"
      >
        <UIcon
          :name="
            downloadingMixed
              ? 'i-heroicons-arrow-path'
              : 'i-heroicons-arrow-down-tray'
          "
          :class="{ 'animate-spin': downloadingMixed }"
        />
        <span>Mix</span>
      </button>

      <button
        class="mtp-dl mtp-dl--primary"
        :disabled="downloadingAll"
        @click="dlZip"
        title="Download all tracks as ZIP"
      >
        <UIcon
          :name="
            downloadingAll
              ? 'i-heroicons-arrow-path'
              : 'i-heroicons-archive-box-arrow-down'
          "
          :class="{ 'animate-spin': downloadingAll }"
        />
        <span>ZIP</span>
      </button>
    </div>

    <!-- Loading bar -->
    <div v-if="loadingCount > 0" class="mtp-loading">
      <div class="mtp-loading-fill" :style="{ width: loadedPct + '%' }" />
    </div>

    <!-- ═══ Track List ═══ -->
    <div class="mtp-tracks">
      <div
        v-for="(t, i) in state"
        :key="t.id"
        class="mtp-track"
        :class="{
          'mtp-track--muted': t.effectiveMuted,
          'mtp-track--solo': t.soloed,
        }"
        :style="{
          '--tc': t.color,
          '--tc-dim': t.colorDim,
          '--tc-bg': t.colorBg,
        }"
      >
        <!-- Header -->
        <div class="mtp-track-head">
          <div class="mtp-track-id">
            <span class="mtp-track-dot" />
            <span class="mtp-track-name">{{ t.username }}</span>
          </div>

          <div class="mtp-track-ctrls">
            <!-- Volume -->
            <div class="mtp-vol">
              <button
                class="mtp-ctrl"
                :class="{ 'mtp-ctrl--active': t.muted }"
                @click="toggleMute(i)"
                :title="t.muted ? 'Unmute' : 'Mute'"
              >
                <UIcon
                  :name="
                    t.muted
                      ? 'i-heroicons-speaker-x-mark-solid'
                      : 'i-heroicons-speaker-wave-solid'
                  "
                />
              </button>
              <input
                type="range"
                min="0"
                max="100"
                :value="Math.round(t.volume * 100)"
                class="mtp-vol-slider"
                @input="onVolInput(i, $event)"
              />
            </div>

            <!-- Solo -->
            <button
              class="mtp-ctrl mtp-solo"
              :class="{ 'mtp-ctrl--solo-active': t.soloed }"
              @click="toggleSolo(i)"
              title="Solo"
            >
              S
            </button>

            <!-- Download single -->
            <button
              class="mtp-ctrl"
              :disabled="dlTrackId === t.id"
              @click="dlSingle(t)"
              title="Download this track"
            >
              <UIcon
                :name="
                  dlTrackId === t.id
                    ? 'i-heroicons-arrow-path'
                    : 'i-heroicons-arrow-down-tray'
                "
                :class="{ 'animate-spin': dlTrackId === t.id }"
              />
            </button>

            <span class="mtp-track-size">{{ fmtSize(t.fileSize) }}</span>
          </div>
        </div>

        <!-- Waveform -->
        <div class="mtp-wave-wrap">
          <div
            :ref="(el) => waveEls.set(i, el as HTMLElement)"
            class="mtp-wave-el"
          />
          <div v-if="!t.loaded && !t.error" class="mtp-wave-skeleton">
            <div class="mtp-wave-shimmer" />
          </div>
          <div v-if="t.error" class="mtp-wave-error">
            <UIcon
              name="i-heroicons-exclamation-triangle"
              class="text-red-400"
            />
            <span>Could not load audio</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from "vue";

// ── Props ────────────────────────────────────────────────────────────────
interface TrackProp {
  $id: string;
  user_id: string;
  username: string;
  file_id: string;
  file_size?: number;
}

const props = defineProps<{
  tracks: TrackProp[];
  mixedFileId?: string;
  recordingTitle?: string;
}>();

// ── Palette ──────────────────────────────────────────────────────────────
const COLORS = [
  { c: "#ef4444", dim: "#ef444460", bg: "#ef444412" },
  { c: "#3b82f6", dim: "#3b82f660", bg: "#3b82f612" },
  { c: "#10b981", dim: "#10b98160", bg: "#10b98112" },
  { c: "#f59e0b", dim: "#f59e0b60", bg: "#f59e0b12" },
  { c: "#8b5cf6", dim: "#8b5cf660", bg: "#8b5cf612" },
  { c: "#ec4899", dim: "#ec489960", bg: "#ec489912" },
  { c: "#06b6d4", dim: "#06b6d460", bg: "#06b6d412" },
  { c: "#f97316", dim: "#f9731660", bg: "#f9731612" },
];

// ── Track state ──────────────────────────────────────────────────────────
interface TrackState {
  id: string;
  userId: string;
  username: string;
  fileId: string;
  fileSize: number;
  color: string;
  colorDim: string;
  colorBg: string;
  volume: number;
  muted: boolean;
  soloed: boolean;
  effectiveMuted: boolean;
  loaded: boolean;
  error: boolean;
  duration: number;
  ws: any;
}

const state = ref<TrackState[]>([]);
const waveEls = reactive(new Map<number, HTMLElement>());
const seekRef = ref<HTMLElement>();

const isPlaying = ref(false);
const currentTime = ref(0);
const dlTrackId = ref<string | null>(null);
const downloadingAll = ref(false);
const downloadingMixed = ref(false);

let animFrame: number | null = null;
let WS: any = null; // wavesurfer constructor

// ── Computed ─────────────────────────────────────────────────────────────
const masterDuration = computed(() => {
  if (state.value.length === 0) return 0;
  return Math.max(...state.value.map((t) => t.duration || 0), 0.01);
});

const seekPct = computed(() => {
  if (masterDuration.value <= 0) return 0;
  return Math.min(100, (currentTime.value / masterDuration.value) * 100);
});

const anyReady = computed(() => state.value.some((t) => t.loaded));
const loadingCount = computed(
  () => state.value.filter((t) => !t.loaded && !t.error).length,
);
const loadedPct = computed(() => {
  if (state.value.length === 0) return 0;
  return (
    (state.value.filter((t) => t.loaded).length / state.value.length) * 100
  );
});
const anySoloed = computed(() => state.value.some((t) => t.soloed));

// ── Init ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  WS = (await import("wavesurfer.js")).default;

  state.value = props.tracks.map((t, i) => {
    const pal = COLORS[i % COLORS.length]!;
    return {
      id: t.$id,
      userId: t.user_id,
      username: t.username,
      fileId: t.file_id,
      fileSize: t.file_size ?? 0,
      color: pal.c,
      colorDim: pal.dim,
      colorBg: pal.bg,
      volume: 1,
      muted: false,
      soloed: false,
      effectiveMuted: false,
      loaded: false,
      error: false,
      duration: 0,
      ws: null,
    };
  });

  // Wait a tick for DOM refs to populate
  await new Promise((r) => setTimeout(r, 60));

  for (let i = 0; i < state.value.length; i++) {
    const t = state.value[i]!;
    const el = waveEls.get(i);
    if (!el) {
      t.error = true;
      continue;
    }

    try {
      const ws = WS.create({
        container: el,
        url: `/api/recordings/stream?file_id=${t.fileId}`,
        waveColor: t.colorDim,
        progressColor: t.color,
        cursorColor: "rgba(255,255,255,0.4)",
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 56,
        normalize: true,
        hideScrollbar: true,
      });

      ws.on("ready", () => {
        t.loaded = true;
        t.duration = ws.getDuration();
      });

      ws.on("error", () => {
        t.error = true;
      });

      ws.on("finish", () => {
        // If all tracks finished, stop
        const allFinished = state.value.every(
          (s) => !s.ws || s.ws.getCurrentTime() >= s.duration - 0.1,
        );
        if (allFinished) {
          isPlaying.value = false;
          stopTimeLoop();
        }
      });

      ws.on("interaction", (newTime: number) => {
        // User clicked on this waveform → sync all others
        const progress = t.duration > 0 ? Math.min(1, newTime / t.duration) : 0;
        for (let j = 0; j < state.value.length; j++) {
          const other = state.value[j];
          if (j !== i && other && other.ws && other.loaded) {
            other.ws.seekTo(progress);
          }
        }
        currentTime.value = newTime;
      });

      t.ws = ws;
    } catch {
      t.error = true;
    }
  }
});

onBeforeUnmount(() => {
  stopTimeLoop();
  for (const t of state.value) {
    try {
      t.ws?.destroy();
    } catch {}
  }
});

// ── Playback ─────────────────────────────────────────────────────────────
function togglePlayPause() {
  if (isPlaying.value) {
    pauseAll();
  } else {
    playAll();
  }
}

function playAll() {
  for (const t of state.value) {
    if (t.ws && t.loaded) t.ws.play();
  }
  isPlaying.value = true;
  startTimeLoop();
}

function pauseAll() {
  for (const t of state.value) {
    if (t.ws && t.loaded) t.ws.pause();
  }
  isPlaying.value = false;
  stopTimeLoop();
}

function stopAll() {
  for (const t of state.value) {
    if (t.ws && t.loaded) t.ws.stop();
  }
  isPlaying.value = false;
  currentTime.value = 0;
  stopTimeLoop();
}

function seekAllTo(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  for (const t of state.value) {
    if (t.ws && t.loaded) t.ws.seekTo(p);
  }
  currentTime.value = p * masterDuration.value;
}

function onSeekClick(e: MouseEvent) {
  if (!seekRef.value) return;
  const rect = seekRef.value.getBoundingClientRect();
  const progress = (e.clientX - rect.left) / rect.width;
  seekAllTo(progress);
}

// ── Time loop ────────────────────────────────────────────────────────────
function startTimeLoop() {
  const tick = () => {
    const first = state.value.find((t) => t.ws && t.loaded);
    if (first) currentTime.value = first.ws.getCurrentTime();
    if (isPlaying.value) animFrame = requestAnimationFrame(tick);
  };
  animFrame = requestAnimationFrame(tick);
}

function stopTimeLoop() {
  if (animFrame !== null) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
}

// ── Per-track controls ───────────────────────────────────────────────────
function toggleMute(i: number) {
  const track = state.value[i];
  if (track) track.muted = !track.muted;
  applyVolumes();
}

function toggleSolo(i: number) {
  const track = state.value[i];
  if (track) track.soloed = !track.soloed;
  applyVolumes();
}

function onVolInput(i: number, e: Event) {
  const val = (e.target as HTMLInputElement).valueAsNumber;
  const track = state.value[i];
  if (track) track.volume = val / 100;
  applyVolumes();
}

function applyVolumes() {
  const hasSolo = anySoloed.value;
  for (const t of state.value) {
    t.effectiveMuted = t.muted || (hasSolo && !t.soloed);
    if (t.ws) {
      t.ws.setMuted(t.effectiveMuted);
      if (!t.effectiveMuted) t.ws.setVolume(t.volume);
    }
  }
}

// ── Downloads ────────────────────────────────────────────────────────────
async function dlSingle(track: TrackState) {
  dlTrackId.value = track.id;
  try {
    const res = await fetch(`/api/recordings/stream?file_id=${track.fileId}`);
    const blob = await res.blob();
    triggerDownload(blob, `${track.username}.ogg`);
  } catch (err) {
    console.error("[Player] Download failed:", err);
  } finally {
    dlTrackId.value = null;
  }
}

async function dlMixed() {
  if (!props.mixedFileId) return;
  downloadingMixed.value = true;
  try {
    const res = await fetch(
      `/api/recordings/stream?file_id=${props.mixedFileId}`,
    );
    const blob = await res.blob();
    const name = props.recordingTitle
      ? `${props.recordingTitle}_mixed.ogg`
      : "mixed.ogg";
    triggerDownload(blob, name);
  } catch (err) {
    console.error("[Player] Mixed download failed:", err);
  } finally {
    downloadingMixed.value = false;
  }
}

async function dlZip() {
  downloadingAll.value = true;
  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const folder = zip.folder(props.recordingTitle || "recording")!;

    // Add individual tracks
    for (const t of state.value) {
      const res = await fetch(`/api/recordings/stream?file_id=${t.fileId}`);
      const blob = await res.blob();
      folder.file(`${t.username}.ogg`, blob);
    }

    // Add mixed file if available
    if (props.mixedFileId) {
      const res = await fetch(
        `/api/recordings/stream?file_id=${props.mixedFileId}`,
      );
      const blob = await res.blob();
      folder.file("_mixed_all_users.ogg", blob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const name = props.recordingTitle
      ? `${props.recordingTitle}_tracks.zip`
      : "recording_tracks.zip";
    triggerDownload(zipBlob, name);
  } catch (err) {
    console.error("[Player] ZIP download failed:", err);
  } finally {
    downloadingAll.value = false;
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Format helpers ───────────────────────────────────────────────────────
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<style scoped>
/* ── Container ── */
.mtp {
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(
    135deg,
    rgba(15, 15, 20, 0.95),
    rgba(10, 10, 15, 0.98)
  );
  border: 1px solid rgba(255, 255, 255, 0.06);
}

/* ── Transport bar ── */
.mtp-transport {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.mtp-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.mtp-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}
.mtp-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.mtp-play {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border-color: rgba(239, 68, 68, 0.3);
  color: white;
  font-size: 14px;
}
.mtp-play:hover:not(:disabled) {
  background: linear-gradient(135deg, #f87171, #ef4444);
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.3);
}

.mtp-time {
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  flex-shrink: 0;
}
.mtp-time-cur {
  color: rgba(255, 255, 255, 0.85);
}
.mtp-time-sep {
  margin: 0 2px;
}

/* Seek bar */
.mtp-seek {
  flex: 1;
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.mtp-seek-rail {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.mtp-seek-fill {
  height: 100%;
  background: linear-gradient(90deg, #ef4444, #f87171);
  border-radius: 2px;
  transition: width 0.05s linear;
}
.mtp-seek-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%);
  transition: left 0.05s linear;
  opacity: 0;
}
.mtp-seek:hover .mtp-seek-thumb {
  opacity: 1;
}

.mtp-sep {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

/* Download buttons */
.mtp-dl {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}
.mtp-dl:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}
.mtp-dl:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.mtp-dl--primary {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.2);
  color: rgba(239, 68, 68, 0.8);
}
.mtp-dl--primary:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* Loading bar */
.mtp-loading {
  height: 2px;
  background: rgba(255, 255, 255, 0.04);
}
.mtp-loading-fill {
  height: 100%;
  background: linear-gradient(90deg, #ef4444, #f59e0b);
  transition: width 0.3s ease;
}

/* ── Tracks ── */
.mtp-tracks {
  padding: 4px 0;
}

.mtp-track {
  padding: 10px 14px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}
.mtp-track:last-child {
  border-bottom: none;
}
.mtp-track--muted {
  opacity: 0.4;
}
.mtp-track--solo {
  background: var(--tc-bg);
}

.mtp-track-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.mtp-track-id {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mtp-track-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tc);
  flex-shrink: 0;
  box-shadow: 0 0 6px var(--tc-dim);
}

.mtp-track-name {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mtp-track-size {
  font-size: 10px;
  font-family: "JetBrains Mono", "SF Mono", monospace;
  color: rgba(255, 255, 255, 0.25);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Track controls */
.mtp-track-ctrls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.mtp-vol {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mtp-ctrl {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  transition: all 0.15s ease;
}
.mtp-ctrl:hover {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
}
.mtp-ctrl:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.mtp-ctrl--active {
  color: #ef4444 !important;
}
.mtp-ctrl--solo-active {
  color: #fbbf24 !important;
  background: rgba(251, 191, 36, 0.15) !important;
}

/* Volume slider */
.mtp-vol-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 60px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  outline: none;
  cursor: pointer;
}
.mtp-vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;
}
.mtp-vol-slider::-webkit-slider-thumb:hover {
  background: white;
}
.mtp-vol-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.6);
  border: none;
  cursor: pointer;
}

/* Solo button */
.mtp-solo {
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 10px;
  letter-spacing: -0.5px;
}

/* ── Waveform ── */
.mtp-wave-wrap {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
  min-height: 56px;
}

.mtp-wave-el {
  width: 100%;
}

.mtp-wave-skeleton {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.mtp-wave-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.04) 40%,
    rgba(255, 255, 255, 0.06) 50%,
    rgba(255, 255, 255, 0.04) 60%,
    transparent 100%
  );
  animation: shimmer 1.8s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.mtp-wave-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .mtp-transport {
    flex-wrap: wrap;
    gap: 8px;
  }
  .mtp-seek {
    order: 10;
    flex-basis: 100%;
  }
  .mtp-vol-slider {
    width: 40px;
  }
  .mtp-track-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
}
</style>
