<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/server/${guildId}/modules`"
        class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <UIcon name="i-heroicons-arrow-left" class="text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div
          class="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20"
        >
          <UIcon
            name="i-heroicons-musical-note"
            class="text-violet-400 text-lg"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Music</h2>
          <p class="text-xs text-gray-500">
            Now playing, queue & server configuration
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('Music') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("Music") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════════
         NOW PLAYING — Spotify-inspired full-width player
         ═══════════════════════════════════════════════════════════════════════ -->
    <div
      class="now-playing-container relative overflow-hidden rounded-2xl border border-white/10"
    >
      <!-- Album art background — blurred, desaturated -->
      <div class="absolute inset-0 z-0">
        <img
          v-if="playerState.currentTrack?.thumbnail"
          :src="playerState.currentTrack.thumbnail"
          class="w-full h-full object-cover scale-110"
          style="filter: blur(60px) saturate(0.5) brightness(0.3)"
          alt=""
        />
        <div
          v-else
          class="w-full h-full bg-gradient-to-br from-violet-950/80 via-gray-950 to-indigo-950/80"
        />
        <!-- Overlay gradient for readability -->
        <div
          class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/40"
        />
        <div
          class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30"
        />
      </div>

      <!-- Content layout: Left = Player | Right = Queue -->
      <div class="relative z-10 flex flex-col lg:flex-row min-h-[420px]">
        <!-- ─── Left: Now Playing ─── -->
        <div
          class="flex-shrink-0 w-full lg:w-[480px] p-6 lg:p-8 flex flex-col justify-between"
        >
          <!-- Top: Connection status -->
          <div class="flex items-center gap-2 mb-4">
            <div
              class="w-2 h-2 rounded-full"
              :class="
                connected
                  ? playerState.isPlaying
                    ? 'bg-green-400 animate-pulse'
                    : 'bg-yellow-400'
                  : 'bg-red-400'
              "
            />
            <span
              class="text-[10px] font-medium uppercase tracking-widest text-gray-400"
            >
              {{
                !connected
                  ? "Bot Offline"
                  : playerState.isPlaying
                    ? `Playing in ${playerState.voiceChannel || "voice"}`
                    : playerState.isPaused
                      ? "Paused"
                      : "Nothing Playing"
              }}
            </span>
          </div>

          <!-- Track Info -->
          <div
            v-if="playerState.currentTrack"
            class="space-y-4 flex-1 flex flex-col justify-center"
          >
            <!-- Thumbnail -->
            <div class="flex items-start gap-5">
              <div
                class="w-28 h-28 lg:w-36 lg:h-36 rounded-xl overflow-hidden shadow-2xl shadow-black/50 shrink-0 border border-white/10"
              >
                <img
                  :src="
                    playerState.currentTrack.thumbnail ||
                    '/placeholder-album.png'
                  "
                  :alt="playerState.currentTrack.title"
                  class="w-full h-full object-cover"
                />
              </div>
              <div class="min-w-0 flex-1 pt-1">
                <h3
                  class="text-xl lg:text-2xl font-bold text-white truncate leading-tight"
                  :title="playerState.currentTrack.title"
                >
                  {{ playerState.currentTrack.title }}
                </h3>
                <p class="text-sm text-gray-400 mt-1 truncate">
                  {{ playerState.currentTrack.author }}
                </p>
                <p class="text-xs text-gray-500 mt-0.5">
                  Requested by {{ playerState.currentTrack.requestedBy }}
                </p>
                <a
                  v-if="playerState.currentTrack.url"
                  :href="playerState.currentTrack.url"
                  target="_blank"
                  class="inline-flex items-center gap-1 mt-2 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <UIcon
                    name="i-heroicons-arrow-top-right-on-square"
                    class="w-3 h-3"
                  />
                  Open in browser
                </a>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="space-y-1.5">
              <div
                class="w-full h-1.5 rounded-full bg-white/10 overflow-hidden group cursor-pointer"
              >
                <div
                  class="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-1000 ease-linear group-hover:from-violet-400 group-hover:to-indigo-300"
                  :style="{ width: `${progressPercent}%` }"
                />
              </div>
              <div
                class="flex justify-between text-[10px] text-gray-500 tabular-nums"
              >
                <span>{{ formatMs(playerState.progress) }}</span>
                <span>{{ playerState.currentTrack.duration }}</span>
              </div>
            </div>

            <!-- Controls -->
            <div class="flex items-center justify-center gap-3">
              <button
                class="player-btn p-2 rounded-full"
                title="Shuffle"
                :disabled="actionLoading"
                @click="shuffleFn"
              >
                <UIcon name="i-heroicons-arrows-right-left" class="w-4 h-4" />
              </button>

              <button
                class="player-btn p-2.5 rounded-full"
                title="Skip"
                :disabled="actionLoading"
                @click="skipFn"
              >
                <UIcon name="i-heroicons-backward" class="w-5 h-5" />
              </button>

              <button
                class="player-btn-primary p-3.5 rounded-full"
                :title="playerState.isPaused ? 'Resume' : 'Pause'"
                :disabled="actionLoading"
                @click="playerState.isPaused ? resumeFn() : pauseFn()"
              >
                <UIcon
                  :name="
                    playerState.isPaused
                      ? 'i-heroicons-play-solid'
                      : 'i-heroicons-pause-solid'
                  "
                  class="w-6 h-6"
                />
              </button>

              <button
                class="player-btn p-2.5 rounded-full"
                title="Skip"
                :disabled="actionLoading"
                @click="skipFn"
              >
                <UIcon name="i-heroicons-forward" class="w-5 h-5" />
              </button>

              <button
                class="player-btn p-2 rounded-full"
                title="Stop"
                :disabled="actionLoading"
                @click="stopFn"
              >
                <UIcon name="i-heroicons-stop" class="w-4 h-4" />
              </button>
            </div>

            <!-- Volume -->
            <div class="flex items-center gap-3 mt-1">
              <UIcon
                :name="
                  playerState.volume === 0
                    ? 'i-heroicons-speaker-x-mark'
                    : playerState.volume < 50
                      ? 'i-heroicons-speaker-wave'
                      : 'i-heroicons-speaker-wave'
                "
                class="text-gray-400 w-4 h-4 shrink-0"
              />
              <USlider
                :model-value="volumeLocal"
                :min="0"
                :max="100"
                :step="1"
                class="flex-1"
                @update:model-value="onVolumeChange"
              />
              <span
                class="text-[10px] text-gray-500 w-7 text-right tabular-nums"
              >
                {{ volumeLocal }}%
              </span>
            </div>
          </div>

          <!-- Empty state -->
          <div
            v-else
            class="flex-1 flex flex-col items-center justify-center text-center py-8"
          >
            <div
              class="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4"
            >
              <UIcon
                name="i-heroicons-musical-note"
                class="w-10 h-10 text-gray-600"
              />
            </div>
            <p class="text-gray-400 font-medium">Nothing playing</p>
            <p class="text-xs text-gray-600 mt-1">
              Play a song from Discord or add to the queue below
            </p>
            <p
              v-if="preQueueList.length > 0"
              class="text-[10px] text-violet-400 mt-2"
            >
              📋 {{ preQueueList.length }} song{{
                preQueueList.length !== 1 ? "s" : ""
              }}
              queued — use
              <code class="bg-white/5 px-1 rounded">/playqueue</code> in Discord
            </p>
          </div>
        </div>

        <!-- ─── Right: Queue Playlist ─── -->
        <div
          class="flex-1 border-t lg:border-t-0 lg:border-l border-white/5 flex flex-col min-h-0"
        >
          <!-- Queue header -->
          <div
            class="flex items-center justify-between px-5 py-3.5 border-b border-white/5"
          >
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-queue-list"
                class="text-gray-400 w-4 h-4"
              />
              <span class="text-sm font-semibold text-white">{{
                isBotActive ? "Queue" : "Playlist"
              }}</span>
              <UBadge
                v-if="isBotActive && playerState.queue.length > 0"
                color="neutral"
                variant="soft"
                size="xs"
              >
                {{ playerState.queue.length }} track{{
                  playerState.queue.length !== 1 ? "s" : ""
                }}
              </UBadge>
              <UBadge
                v-else-if="!isBotActive && preQueueList.length > 0"
                color="primary"
                variant="soft"
                size="xs"
              >
                {{ preQueueList.length }} pending
              </UBadge>
            </div>
            <button
              v-if="!isBotActive && preQueueList.length > 0"
              class="text-[10px] text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-white/5"
              @click="clearPreQueueFn"
            >
              Clear all
            </button>
          </div>

          <!-- Add song input -->
          <div
            ref="searchContainerRef"
            class="px-4 py-3 border-b border-white/5"
          >
            <div class="relative">
              <UInput
                v-model="searchQuery"
                placeholder="Search or paste a URL to add..."
                icon="i-heroicons-magnifying-glass"
                size="sm"
                :loading="searchLoadingState"
                class="w-full"
                @keydown.enter="onSearchSubmit"
                @keydown.escape="clearSearchFn"
              />
            </div>

            <!-- Search results dropdown -->
            <div
              v-if="searchResultsList.length > 0"
              class="mt-2 rounded-lg border border-white/10 bg-gray-900/95 backdrop-blur-xl max-h-64 overflow-y-auto"
            >
              <!-- Playlist header banner -->
              <div
                v-if="isPlaylistResult && searchResultsList.length > 1"
                class="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-violet-500/10 border-b border-violet-500/20 backdrop-blur-xl"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <UIcon
                    name="i-heroicons-queue-list"
                    class="text-violet-400 w-4 h-4 shrink-0"
                  />
                  <span class="text-xs font-medium text-violet-300 truncate">
                    {{ playlistTitle || "Playlist" }} ·
                    {{ playlistTrackCount || searchResultsList.length }} tracks
                  </span>
                </div>
                <button
                  type="button"
                  class="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-md bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 hover:text-violet-200 transition-colors border border-violet-500/20"
                  :disabled="actionLoading"
                  @click="addAllPlaylistTracks"
                >
                  Add all
                  {{ playlistTrackCount || searchResultsList.length }} tracks
                </button>
              </div>

              <button
                v-for="(result, i) in searchResultsList"
                :key="i"
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                @click="addToQueue(result)"
              >
                <span
                  v-if="isPlaylistResult"
                  class="w-5 text-center text-[10px] text-gray-600 tabular-nums shrink-0"
                >
                  {{ i + 1 }}
                </span>
                <img
                  :src="result.thumbnail || '/placeholder-album.png'"
                  class="w-10 h-10 rounded object-cover shrink-0"
                  :alt="result.title"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium text-white truncate">
                    {{ result.title }}
                  </p>
                  <p class="text-[10px] text-gray-500 truncate">
                    {{ result.author }} · {{ result.duration }}
                  </p>
                </div>
                <UIcon
                  name="i-heroicons-plus-circle"
                  class="text-violet-400 w-5 h-5 shrink-0"
                />
              </button>
            </div>
          </div>

          <!-- Queue list -->
          <div class="flex-1 overflow-y-auto custom-scrollbar">
            <!-- Currently playing row -->
            <div
              v-if="playerState.currentTrack"
              class="flex items-center gap-3 px-4 py-2.5 bg-violet-500/10 border-l-2 border-violet-500"
            >
              <div class="w-5 flex items-center justify-center">
                <div v-if="playerState.isPlaying" class="playing-bars">
                  <span /><span /><span />
                </div>
                <UIcon
                  v-else
                  name="i-heroicons-pause-solid"
                  class="text-violet-400 w-3.5 h-3.5"
                />
              </div>
              <img
                :src="
                  playerState.currentTrack.thumbnail || '/placeholder-album.png'
                "
                class="w-10 h-10 rounded object-cover shrink-0"
                :alt="playerState.currentTrack.title"
              />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-violet-300 truncate">
                  {{ playerState.currentTrack.title }}
                </p>
                <p class="text-[10px] text-violet-400/60 truncate">
                  {{ playerState.currentTrack.author }}
                </p>
              </div>
              <span
                class="text-[10px] text-violet-400/60 tabular-nums shrink-0"
              >
                {{ playerState.currentTrack.duration }}
              </span>
            </div>

            <!-- Queued tracks (live) -->
            <template v-if="isBotActive">
              <div
                v-for="(track, idx) in playerState.queue"
                :key="`live-${idx}-${track.url}`"
                class="queue-row flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors group"
              >
                <span
                  class="w-5 text-center text-[10px] text-gray-600 tabular-nums"
                >
                  {{ idx + 1 }}
                </span>
                <img
                  :src="track.thumbnail || '/placeholder-album.png'"
                  class="w-10 h-10 rounded object-cover shrink-0"
                  :alt="track.title"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium text-gray-300 truncate">
                    {{ track.title }}
                  </p>
                  <p class="text-[10px] text-gray-600 truncate">
                    {{ track.author }}
                  </p>
                </div>
                <span
                  class="text-[10px] text-gray-600 tabular-nums shrink-0 mr-1"
                >
                  {{ track.duration }}
                </span>
                <!-- Reorder & Remove controls -->
                <div
                  class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <button
                    v-if="idx > 0"
                    class="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                    title="Move up"
                    @click="reorderTrackFn(idx, idx - 1)"
                  >
                    <UIcon name="i-heroicons-chevron-up" class="w-3.5 h-3.5" />
                  </button>
                  <button
                    v-if="idx < playerState.queue.length - 1"
                    class="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                    title="Move down"
                    @click="reorderTrackFn(idx, idx + 1)"
                  >
                    <UIcon
                      name="i-heroicons-chevron-down"
                      class="w-3.5 h-3.5"
                    />
                  </button>
                  <button
                    class="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                    title="Remove"
                    @click="removeTrackFn(idx)"
                  >
                    <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <!-- Empty live queue state -->
              <div
                v-if="
                  playerState.queue.length === 0 && !playerState.currentTrack
                "
                class="flex flex-col items-center justify-center py-16 text-center"
              >
                <UIcon
                  name="i-heroicons-queue-list"
                  class="w-8 h-8 text-gray-700 mb-2"
                />
                <p class="text-xs text-gray-600">Queue is empty</p>
                <p class="text-[10px] text-gray-700 mt-0.5">
                  Search above to add songs
                </p>
              </div>

              <div
                v-else-if="
                  playerState.queue.length === 0 && playerState.currentTrack
                "
                class="flex flex-col items-center justify-center py-12 text-center"
              >
                <p class="text-xs text-gray-600">No upcoming tracks</p>
                <p class="text-[10px] text-gray-700 mt-0.5">
                  Add more songs to keep the music going
                </p>
              </div>
            </template>

            <!-- Pre-queue tracks (bot offline) -->
            <template v-else>
              <div
                v-for="(item, idx) in preQueueList"
                :key="`pq-${idx}-${item.url}`"
                class="queue-row flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors group"
              >
                <span
                  class="w-5 text-center text-[10px] text-gray-600 tabular-nums"
                >
                  {{ idx + 1 }}
                </span>
                <img
                  :src="item.thumbnail || '/placeholder-album.png'"
                  class="w-10 h-10 rounded object-cover shrink-0"
                  :alt="item.title"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium text-gray-300 truncate">
                    {{ item.title }}
                  </p>
                  <p class="text-[10px] text-gray-600 truncate">
                    {{ item.author }}
                  </p>
                </div>
                <span
                  class="text-[10px] text-gray-600 tabular-nums shrink-0 mr-1"
                >
                  {{ item.duration }}
                </span>
                <!-- Reorder & Remove -->
                <div
                  class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <button
                    v-if="idx > 0"
                    class="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                    title="Move up"
                    @click="reorderPreQueueFn(idx, idx - 1)"
                  >
                    <UIcon name="i-heroicons-chevron-up" class="w-3.5 h-3.5" />
                  </button>
                  <button
                    v-if="idx < preQueueList.length - 1"
                    class="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                    title="Move down"
                    @click="reorderPreQueueFn(idx, idx + 1)"
                  >
                    <UIcon
                      name="i-heroicons-chevron-down"
                      class="w-3.5 h-3.5"
                    />
                  </button>
                  <button
                    class="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                    title="Remove"
                    @click="removeFromPreQueueFn(idx)"
                  >
                    <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <!-- Empty pre-queue state -->
              <div
                v-if="preQueueList.length === 0"
                class="flex flex-col items-center justify-center py-16 text-center"
              >
                <UIcon
                  name="i-heroicons-queue-list"
                  class="w-8 h-8 text-gray-700 mb-2"
                />
                <p class="text-xs text-gray-600">Playlist is empty</p>
                <p class="text-[10px] text-gray-700 mt-0.5 max-w-[220px]">
                  Search above to queue songs, then use
                  <code class="text-violet-400">/playqueue</code> in Discord
                </p>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════════
         SETTINGS — Existing settings cards
         ═══════════════════════════════════════════════════════════════════════ -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- Playback Section -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5 space-y-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
            >
              <UIcon name="i-heroicons-play" class="text-violet-400" />
            </div>
            <h3 class="font-semibold text-white">Playback</h3>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">
              Default Volume: {{ musicSettings.defaultVolume }}%
            </label>
            <USlider
              v-model="musicSettings.defaultVolume"
              :min="1"
              :max="100"
              :step="1"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Max Queue Size</label>
            <UInput
              v-model.number="musicSettings.maxQueueSize"
              type="number"
              :min="1"
              :max="1000"
              size="sm"
            />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <label class="text-sm font-medium">Update Channel Topic</label>
              <p class="text-[10px] text-gray-500">
                Show current song in voice channel topic
              </p>
            </div>
            <USwitch v-model="musicSettings.updateChannelTopic" />
          </div>
        </div>
      </div>

      <!-- Permissions Section -->
      <div
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5 space-y-5"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
        />
        <div class="relative space-y-5">
          <div class="flex items-center gap-2 mb-1">
            <div
              class="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
            >
              <UIcon name="i-heroicons-key" class="text-indigo-400" />
            </div>
            <h3 class="font-semibold text-white">Permissions</h3>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">DJ Role ID</label>
            <UInput
              v-model="musicSettings.djRoleId"
              placeholder="Leave empty for no restriction"
              size="sm"
            />
            <p class="text-[10px] text-gray-500 mt-1">
              Only users with this role can control music. Leave empty to allow
              everyone.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Audio Effects Section (full width) -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none"
      />
      <div class="relative">
        <div class="flex items-center gap-2 mb-4">
          <div
            class="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
          >
            <UIcon name="i-heroicons-sparkles" class="text-violet-400" />
          </div>
          <div>
            <h4 class="text-sm font-semibold text-white">Audio Effects</h4>
            <p class="text-[10px] text-gray-500">
              Auto-applied when music starts playing
            </p>
          </div>
          <UBadge
            v-if="musicSettings.activeFilters.length > 0"
            color="primary"
            variant="soft"
            size="xs"
            class="ml-auto"
          >
            {{ musicSettings.activeFilters.length }} active
          </UBadge>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          <button
            v-for="(info, key) in availableFilters"
            :key="key"
            type="button"
            class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 text-left"
            :class="
              musicSettings.activeFilters.includes(key as string)
                ? 'bg-violet-500/20 border border-violet-500/40 text-violet-300 ring-1 ring-violet-500/30'
                : 'bg-gray-800/50 border border-white/5 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
            "
            @click="toggleFilter(key as string)"
          >
            <span class="text-base leading-none">{{ info.emoji }}</span>
            <div class="min-w-0">
              <div class="truncate">{{ info.label }}</div>
              <div class="text-[9px] opacity-60 truncate">
                {{ info.description }}
              </div>
            </div>
            <UIcon
              v-if="musicSettings.activeFilters.includes(key as string)"
              name="i-heroicons-check-circle-solid"
              class="ml-auto text-violet-400 shrink-0"
            />
          </button>
        </div>

        <button
          v-if="musicSettings.activeFilters.length > 0"
          type="button"
          class="w-full mt-3 text-[10px] text-gray-500 hover:text-red-400 transition-colors py-1"
          @click="musicSettings.activeFilters = []"
        >
          Clear all effects
        </button>
      </div>
    </div>

    <!-- Save Button -->
    <div class="flex justify-end">
      <UButton
        color="primary"
        size="lg"
        icon="i-heroicons-check"
        :loading="saving"
        class="min-w-[200px]"
        @click="save"
      >
        Save Music Settings
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { state, isModuleEnabled, saveModuleSettings, getModuleConfig } =
  useServerSettings(guildId);
const toast = useToast();

// ── Music Player (live state) ──
const {
  state: playerState,
  loading: playerLoading,
  actionLoading,
  searchResults: searchResultsList,
  searchLoading: searchLoadingState,
  isPlaylistResult,
  playlistTrackCount,
  playlistTitle,
  connected,
  error: playerError,
  isBotActive,
  skip: skipFn,
  pause: pauseFn,
  resume: resumeFn,
  stop: stopFn,
  shuffle: shuffleFn,
  setVolume,
  removeTrack: removeTrackFn,
  reorderTrack: reorderTrackFn,
  play: playFn,
  search: searchFn,
  clearSearch: clearSearchFn,
  preQueue: preQueueList,
  addToPreQueue: addToPreQueueFn,
  removeFromPreQueue: removeFromPreQueueFn,
  reorderPreQueue: reorderPreQueueFn,
  clearPreQueue: clearPreQueueFn,
} = useMusicPlayer(guildId);

// ── Settings ──
const saving = ref(false);

const musicSettings = ref({
  defaultVolume: 50,
  djRoleId: "",
  updateChannelTopic: false,
  maxQueueSize: 200,
  activeFilters: [] as string[],
});

// Volume local state (debounced)
const volumeLocal = ref(50);
let volumeDebounce: ReturnType<typeof setTimeout> | null = null;

watch(
  () => playerState.value.volume,
  (val) => {
    // Only update local volume when we're not actively dragging
    if (!volumeDebounce) {
      volumeLocal.value = val;
    }
  },
  { immediate: true },
);

const onVolumeChange = (val: number | undefined) => {
  if (val == null) return;
  volumeLocal.value = val;
  if (volumeDebounce) clearTimeout(volumeDebounce);
  volumeDebounce = setTimeout(() => {
    setVolume(val);
    volumeDebounce = null;
  }, 300);
};

// ── Progress ──
const progressPercent = computed(() => {
  const { progress, totalDuration } = playerState.value;
  if (!totalDuration || totalDuration <= 0) return 0;
  return Math.min(100, (progress / totalDuration) * 100);
});

const formatMs = (ms: number): string => {
  if (!ms || ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// ── Search / Add ──
const searchQuery = ref("");
const searchContainerRef = ref<HTMLElement | null>(null);
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

watch(searchQuery, (val) => {
  if (searchDebounce) clearTimeout(searchDebounce);
  if (!val || val.length < 2) {
    clearSearchFn();
    return;
  }
  searchDebounce = setTimeout(() => {
    searchFn(val);
  }, 400);
});

// Click-outside to close search results
const onClickOutsideSearch = (e: MouseEvent) => {
  if (
    searchContainerRef.value &&
    !searchContainerRef.value.contains(e.target as Node)
  ) {
    clearSearchFn();
  }
};

onMounted(() => {
  document.addEventListener("click", onClickOutsideSearch);
});

onUnmounted(() => {
  document.removeEventListener("click", onClickOutsideSearch);
});

const onSearchSubmit = async () => {
  if (!searchQuery.value) return;

  // If it looks like a URL, add directly
  if (/^https?:\/\//i.test(searchQuery.value)) {
    try {
      if (isBotActive.value) {
        await playFn(searchQuery.value);
        toast.add({
          title: "Added to queue",
          color: "success",
        });
      } else {
        const result = await addToPreQueueFn(searchQuery.value);
        const added = result?.addedCount ?? 1;
        const total = result?.totalFound ?? added;
        const capped = added < total;
        toast.add({
          title:
            added > 1
              ? `Added ${added} song${added !== 1 ? "s" : ""} to playlist`
              : "Added to playlist",
          description: capped
            ? `Playlist had ${total} tracks but only ${added} fit (queue limit).`
            : undefined,
          color: "success",
        });
      }
      searchQuery.value = "";
      clearSearchFn();
    } catch {
      toast.add({
        title: "Error",
        description: isBotActive.value
          ? "Could not add that song. Is the bot in a voice channel?"
          : "Could not add that song to the playlist.",
        color: "error",
      });
    }
    return;
  }

  // Otherwise search
  await searchFn(searchQuery.value);
};

const addToQueue = async (searchResult: { url: string; title: string }) => {
  try {
    if (isBotActive.value) {
      await playFn(searchResult.url);
      toast.add({
        title: "Added to queue",
        description: searchResult.title,
        color: "success",
      });
    } else {
      const result = await addToPreQueueFn(searchResult.url);
      const added = result?.addedCount ?? 1;
      const total = result?.totalFound ?? added;
      const capped = added < total;
      toast.add({
        title:
          added > 1
            ? `Added ${added} song${added !== 1 ? "s" : ""} to playlist`
            : "Added to playlist",
        description: capped
          ? `Playlist had ${total} tracks but only ${added} fit (queue limit).`
          : searchResult.title,
        color: "success",
      });
    }
    searchQuery.value = "";
    clearSearchFn();
  } catch {
    toast.add({
      title: "Error",
      description: isBotActive.value
        ? "Could not add that song. Is the bot in a voice channel?"
        : "Could not add that song to the playlist.",
      color: "error",
    });
  }
};

// ── Add all playlist tracks at once ──
const addAllPlaylistTracks = async () => {
  const tracks = [...searchResultsList.value];
  if (tracks.length === 0) return;

  const name = playlistTitle.value || "Playlist";
  searchQuery.value = "";
  clearSearchFn();

  try {
    let addedTotal = 0;
    // Add tracks in sequence to avoid overwhelming the bot
    for (const track of tracks) {
      try {
        if (isBotActive.value) {
          await playFn(track.url);
        } else {
          await addToPreQueueFn(track.url);
        }
        addedTotal++;
      } catch {
        // Skip individual failures and continue
      }
    }

    toast.add({
      title: `Added ${addedTotal} track${addedTotal !== 1 ? "s" : ""} from ${name}`,
      description:
        addedTotal < tracks.length
          ? `${tracks.length - addedTotal} track(s) could not be added (queue limit or errors).`
          : undefined,
      color: "success",
    });
  } catch {
    toast.add({
      title: "Error",
      description: `Could not add tracks from ${name}.`,
      color: "error",
    });
  }
};

// ── Audio filters ──
const availableFilters: Record<
  string,
  { label: string; emoji: string; description: string }
> = {
  bassboost: {
    label: "Bass Boost",
    emoji: "🔊",
    description: "Enhances low frequencies",
  },
  bassboost_high: {
    label: "Bass Boost (Heavy)",
    emoji: "💥",
    description: "Extreme bass enhancement",
  },
  nightcore: {
    label: "Nightcore",
    emoji: "🌙",
    description: "Higher pitch + faster tempo",
  },
  vaporwave: {
    label: "Vaporwave",
    emoji: "🌊",
    description: "Slowed down + lower pitch",
  },
  "8D": {
    label: "8D Audio",
    emoji: "🎧",
    description: "Rotating spatial audio",
  },
  karaoke: {
    label: "Karaoke",
    emoji: "🎤",
    description: "Reduces vocal frequencies",
  },
  tremolo: {
    label: "Tremolo",
    emoji: "〰️",
    description: "Wavering volume effect",
  },
  vibrato: {
    label: "Vibrato",
    emoji: "🎻",
    description: "Wavering pitch effect",
  },
  lofi: {
    label: "Lo-Fi",
    emoji: "📻",
    description: "Warm, low-fidelity sound",
  },
  phaser: {
    label: "Phaser",
    emoji: "🔮",
    description: "Sweeping phase effect",
  },
  chorus: {
    label: "Chorus",
    emoji: "👥",
    description: "Rich, layered vocal effect",
  },
  flanger: {
    label: "Flanger",
    emoji: "✨",
    description: "Jet-like sweeping effect",
  },
  treble: {
    label: "Treble Boost",
    emoji: "🔔",
    description: "Enhances high frequencies",
  },
  normalizer: {
    label: "Normalizer",
    emoji: "📊",
    description: "Levels out volume",
  },
  fadein: {
    label: "Fade In",
    emoji: "🌅",
    description: "Gradually increases volume",
  },
  surrounding: {
    label: "Surround",
    emoji: "🔈",
    description: "Spatial surround sound",
  },
};

const toggleFilter = (key: string) => {
  const idx = musicSettings.value.activeFilters.indexOf(key);
  if (idx >= 0) {
    musicSettings.value.activeFilters.splice(idx, 1);
  } else {
    musicSettings.value.activeFilters.push(key);
  }
};

const save = async () => {
  saving.value = true;
  await saveModuleSettings("music", musicSettings.value);
  saving.value = false;
};

// Load existing settings
onMounted(() => {
  const saved = getModuleConfig("music");
  if (saved && Object.keys(saved).length > 0) {
    musicSettings.value = {
      defaultVolume: saved.defaultVolume ?? 50,
      djRoleId: saved.djRoleId ?? "",
      updateChannelTopic: saved.updateChannelTopic ?? false,
      maxQueueSize: saved.maxQueueSize ?? 200,
      activeFilters: saved.activeFilters ?? [],
    };
  }
});
</script>

<style scoped>
/* Now Playing container */
.now-playing-container {
  background: rgba(10, 10, 15, 0.9);
  backdrop-filter: blur(20px);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

/* Player controls */
.player-btn {
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s ease;
}
.player-btn:hover:not(:disabled) {
  color: white;
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.15);
  transform: scale(1.08);
}
.player-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.player-btn-primary {
  color: #0a0a0f;
  background: white;
  border: none;
  transition: all 0.2s ease;
  box-shadow: 0 4px 20px rgba(255, 255, 255, 0.15);
}
.player-btn-primary:hover:not(:disabled) {
  transform: scale(1.1);
  box-shadow: 0 6px 30px rgba(255, 255, 255, 0.25);
}
.player-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Playing animation bars */
.playing-bars {
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  height: 14px;
}
.playing-bars span {
  display: block;
  width: 2.5px;
  border-radius: 1px;
  background: #a78bfa;
}
.playing-bars span:nth-child(1) {
  animation: bar-bounce 0.8s ease-in-out infinite;
  height: 6px;
}
.playing-bars span:nth-child(2) {
  animation: bar-bounce 0.8s ease-in-out 0.15s infinite;
  height: 10px;
}
.playing-bars span:nth-child(3) {
  animation: bar-bounce 0.8s ease-in-out 0.3s infinite;
  height: 4px;
}

@keyframes bar-bounce {
  0%,
  100% {
    height: 4px;
  }
  50% {
    height: 14px;
  }
}

/* Queue scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Queue row hover */
.queue-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
}
</style>
