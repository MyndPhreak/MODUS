<template>
  <div>
    <div class="mb-10 flex flex-wrap items-center justify-between gap-6">
      <div class="flex items-center gap-6">
        <div
          v-if="!loading"
          class="glass-card px-6 py-3 rounded-2xl flex items-center gap-4 border border-white/8 shadow-glow-subtle relative overflow-hidden group"
        >
          <!-- Subtle shimmer effect on hover -->
          <div
            class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"
          ></div>

          <div class="relative z-10 flex items-center gap-4">
            <div
              :class="[
                'w-2.5 h-2.5 rounded-full ring-4',
                botOnline
                  ? 'bg-emerald-400 ring-emerald-400/20 status-pulse'
                  : 'bg-red-400 ring-red-400/20',
              ]"
            ></div>
            <div class="flex items-center gap-4">
              <span
                class="text-sm font-black uppercase tracking-widest"
                :class="botOnline ? 'text-emerald-400' : 'text-red-400'"
              >
                Bot {{ botOnline ? "Active" : "Offline" }}
              </span>
              <span
                v-if="allShards.length > 0"
                class="text-[10px] font-bold uppercase tracking-widest text-gray-500 border-l border-white/10 pl-4"
              >
                {{ shardsOnlineCount }} / {{ totalExpectedShards }} Shards
              </span>
              <span
                v-if="botStatus"
                class="text-[10px] font-bold text-gray-500 bg-white/5 px-2 py-0.5 rounded-md border border-white/10"
              >
                v{{ botStatus.version }}
              </span>
            </div>
          </div>
        </div>

        <div
          v-if="allShards.length > 0"
          class="hidden lg:flex items-center gap-3"
        >
          <UBadge
            v-for="shard in visibleShards.slice(0, 4)"
            :key="shard.$id"
            variant="subtle"
            color="success"
            size="md"
            class="rounded-xl px-3 py-1 font-bold text-[10px] uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
          >
            <UIcon
              name="i-heroicons-cpu-chip"
              class="w-3.5 h-3.5 mr-1.5 opacity-70"
            />
            Shard {{ shard.shard_id ?? getShardDisplayId(shard) }}
          </UBadge>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <UButton
          v-if="!loading"
          icon="i-heroicons-plus"
          color="primary"
          class="rounded-xl px-6 font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-glow-medium border-none transition-all hover:scale-105"
          to="/discover"
        >
          Connect Server
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-20">
      <div class="glass-card p-8 rounded-3xl text-center">
        <UIcon
          name="i-heroicons-arrow-path"
          class="w-12 h-12 text-purple-400 mx-auto animate-spin mb-4"
        />
        <p class="text-gray-300">Loading dashboard...</p>
      </div>
    </div>

    <!-- Dashboard Content -->
    <div v-else class="space-y-8">
      <!-- Stats Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Total Servers Card -->
        <div
          class="glass-card stat-card-purple rounded-2xl p-6 hover:scale-[1.02] smooth-transition cursor-pointer group relative overflow-hidden"
        >
          <!-- Ambient glow -->
          <div
            class="absolute -top-12 -right-12 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl group-hover:bg-violet-500/20 transition-all duration-500"
          ></div>

          <div class="relative z-10">
            <div class="flex items-center justify-between mb-4">
              <div class="icon-container">
                <UIcon
                  name="i-heroicons-server-stack"
                  class="w-6 h-6 text-violet-400"
                />
              </div>
              <UIcon
                name="i-heroicons-arrow-trending-up"
                class="w-5 h-5 text-emerald-400 opacity-60"
              />
            </div>
            <h3 class="text-4xl font-bold text-white mb-1 tracking-tight">
              {{ servers.length }}
            </h3>
            <p class="text-gray-400 text-sm font-medium">Total Servers</p>
          </div>
        </div>

        <!-- Online Servers Card -->
        <div
          class="glass-card stat-card-green rounded-2xl p-6 hover:scale-[1.02] smooth-transition cursor-pointer group relative overflow-hidden"
        >
          <!-- Ambient glow -->
          <div
            class="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-500"
          ></div>

          <div class="relative z-10">
            <div class="flex items-center justify-between mb-4">
              <div class="icon-container">
                <UIcon
                  name="i-heroicons-check-circle"
                  class="w-6 h-6 text-emerald-400"
                />
              </div>
              <div
                class="w-2 h-2 bg-emerald-400 rounded-full status-pulse"
              ></div>
            </div>
            <h3 class="text-4xl font-bold text-white mb-1 tracking-tight">
              {{ servers.filter((s) => isServerOnline(s)).length }}
            </h3>
            <p class="text-gray-400 text-sm font-medium">Servers Online</p>
          </div>
        </div>

        <!-- Active Shards Card -->
        <div
          class="glass-card stat-card-blue rounded-2xl p-6 hover:scale-[1.02] smooth-transition cursor-pointer group relative overflow-hidden"
        >
          <!-- Ambient glow -->
          <div
            class="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500"
          ></div>

          <div class="relative z-10">
            <div class="flex items-center justify-between mb-4">
              <div class="icon-container">
                <UIcon
                  name="i-heroicons-cube-transparent"
                  class="w-6 h-6 text-blue-400"
                />
              </div>
              <UIcon
                name="i-heroicons-signal"
                class="w-5 h-5 text-blue-400 opacity-60"
              />
            </div>
            <h3 class="text-4xl font-bold text-white mb-1 tracking-tight">
              {{ shardsOnlineCount }}/{{ totalExpectedShards }}
            </h3>
            <p class="text-gray-400 text-sm font-medium">Active Shards</p>
          </div>
        </div>

        <!-- Quick Actions Card -->
        <div
          class="glass-card rounded-2xl p-6 hover:scale-[1.02] smooth-transition cursor-pointer group relative overflow-hidden border-violet-500/20"
        >
          <!-- Ambient glow -->
          <div
            class="absolute -top-12 -right-12 w-32 h-32 bg-violet-500/15 rounded-full blur-3xl group-hover:bg-violet-500/25 transition-all duration-500"
          ></div>

          <div class="relative z-10">
            <div class="flex items-center justify-between mb-4">
              <div
                class="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-400/30 shadow-glow-subtle"
              >
                <UIcon
                  name="i-heroicons-rocket-launch"
                  class="w-6 h-6 text-violet-300"
                />
              </div>
            </div>
            <h3 class="text-lg font-bold text-white mb-3 tracking-tight">
              Quick Actions
            </h3>
            <div class="space-y-2">
              <UButton
                to="/discover"
                block
                size="sm"
                color="primary"
                variant="soft"
                class="bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                :ui="{ rounded: 'rounded-lg' }"
              >
                <UIcon name="i-heroicons-plus" class="w-4 h-4 mr-1" />
                Add Server
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Servers Section -->
      <section>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-2xl font-bold gradient-text-purple-pink mb-1">
              My Servers
            </h2>
            <p class="text-gray-400 text-sm font-medium">
              Manage and monitor your Discord servers
            </p>
          </div>
          <div class="flex items-center gap-3">
            <UButton
              v-if="isBotAdmin"
              icon="i-heroicons-shield-check"
              color="gray"
              variant="soft"
              to="/admin"
              class="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10"
              :ui="{ rounded: 'rounded-xl' }"
            >
              Admin Panel
            </UButton>
            <UButton
              icon="i-heroicons-arrow-path"
              variant="ghost"
              color="gray"
              square
              size="lg"
              :loading="serversLoading"
              @click="fetchServers"
              :ui="{ rounded: 'rounded-xl' }"
              class="glass-card hover:bg-white/10 border border-white/8"
            />
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-if="servers.length === 0"
          class="glass-panel text-center py-16 rounded-3xl border-2 border-dashed border-white/8"
        >
          <div class="relative inline-block mb-6">
            <div
              class="absolute inset-0 bg-violet-500/20 rounded-3xl blur-2xl opacity-40"
            ></div>
            <div
              class="relative p-6 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 rounded-3xl border border-violet-500/20"
            >
              <UIcon
                name="i-heroicons-server-stack"
                class="w-16 h-16 text-gray-400 mx-auto"
              />
            </div>
          </div>
          <h3 class="text-2xl font-bold text-white mb-2">No servers yet</h3>
          <p class="text-gray-400 mb-6 max-w-md mx-auto">
            Start by adding your first Discord server to begin monitoring and
            managing it from this dashboard.
          </p>
          <UButton
            color="primary"
            size="lg"
            to="/discover"
            :ui="{ rounded: 'rounded-xl' }"
            class="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-glow-medium border-none transition-all hover:scale-105"
          >
            <UIcon name="i-heroicons-globe-alt" class="w-5 h-5 mr-2" />
            Discover Servers
          </UButton>
        </div>

        <!-- Servers Grid -->
        <div
          v-else
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          <div
            v-for="server in servers"
            :key="server.$id"
            class="glass-card rounded-2xl p-6 hover:scale-[1.02] smooth-transition group relative overflow-hidden border border-white/8"
          >
            <!-- Guild Icon Blurred Backdrop -->
            <div
              v-if="server.icon"
              class="absolute inset-0 -z-10 overflow-hidden"
            >
              <img
                :src="getGuildIconUrl(server.$id, server.icon, 128)"
                alt=""
                class="absolute inset-0 w-full h-full object-cover scale-150 blur-3xl opacity-15 group-hover:opacity-25 transition-opacity duration-500"
              />
            </div>

            <!-- Status Indicator Glow -->
            <div
              v-if="isServerOnline(server)"
              class="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-3xl -z-10 group-hover:bg-emerald-500/15 transition-all duration-500"
            ></div>

            <!-- Header -->
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <!-- Guild Icon -->
                <div class="relative shrink-0">
                  <img
                    v-if="server.icon"
                    :src="getGuildIconUrl(server.$id, server.icon, 64)"
                    :alt="server.name"
                    class="w-10 h-10 rounded-xl ring-2 ring-white/10 object-cover"
                  />
                  <div
                    v-else
                    class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/30 to-indigo-600/30 border border-white/10 flex items-center justify-center"
                  >
                    <span class="text-sm font-black text-white/60">{{
                      server.name?.charAt(0)?.toUpperCase() || "?"
                    }}</span>
                  </div>
                  <div
                    :class="[
                      'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#111116]',
                      isServerOnline(server)
                        ? 'bg-emerald-400 status-pulse'
                        : 'bg-red-400',
                    ]"
                  ></div>
                </div>
                <div class="min-w-0">
                  <h3
                    class="font-bold text-white text-lg truncate leading-tight"
                  >
                    {{ server.name }}
                  </h3>
                  <p class="text-[10px] font-mono text-gray-500 truncate">
                    {{ server.$id }}
                  </p>
                </div>
              </div>
              <UBadge
                v-if="server.shard_id !== undefined"
                variant="soft"
                color="neutral"
                size="sm"
                class="bg-white/5 border border-white/10 text-gray-400 shrink-0"
              >
                S{{ server.shard_id }}
              </UBadge>
            </div>

            <!-- Status -->
            <div
              class="flex items-center justify-between mb-4 pb-4 border-b border-white/8"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  :name="
                    isServerOnline(server)
                      ? 'i-heroicons-check-circle'
                      : 'i-heroicons-x-circle'
                  "
                  :class="
                    isServerOnline(server) ? 'text-emerald-400' : 'text-red-400'
                  "
                  class="w-5 h-5"
                />
                <span
                  class="text-sm font-medium"
                  :class="
                    isServerOnline(server) ? 'text-emerald-400' : 'text-red-400'
                  "
                >
                  {{ isServerOnline(server) ? "Healthy" : "Offline" }}
                </span>
              </div>
              <span class="text-xs text-gray-500">
                {{ formatLastChecked(server.last_checked) }}
              </span>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2">
              <UButton
                size="sm"
                color="primary"
                variant="soft"
                :to="`/server/${server.$id}/settings`"
                :ui="{ rounded: 'rounded-xl' }"
                class="bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-300 hover:text-violet-200 transition-all flex-1"
              >
                <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 mr-1.5" />
                Manage Server
              </UButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { Query } from "appwrite";

const userStore = useUserStore();
const { databases } = useAppwrite();
const serversCollectionId = "servers";
const botStatusCollectionId = "bot_status";

const modules = ref([]);
const servers = ref([]);
const botStatus = ref(null);
const loading = ref(true);
const serversLoading = ref(false);
const databaseId = "discord_bot";
const config = useRuntimeConfig();

const isBotAdmin = computed(() => userStore.isAdmin);

const allShards = ref([]);

const getGuildIconUrl = (guildId, iconHash, size = 64) => {
  if (!iconHash) return null;
  const ext = iconHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=${size}`;
};

const botOnline = computed(() => {
  return visibleShards.value.length > 0;
});

const shardsOnlineCount = computed(() => {
  return visibleShards.value.length;
});

const visibleShards = computed(() => {
  return sortedShards.value.filter((shard) => isShardOnline(shard));
});

const totalExpectedShards = computed(() => {
  if (visibleShards.value.length > 0) {
    return visibleShards.value[0].total_shards ?? sortedShards.value.length;
  }
  return sortedShards.value.length;
});

const sortedShards = computed(() => {
  const uniqueShards = new Map();
  [...allShards.value].forEach((shard) => {
    const sid = shard.shard_id ?? -1;
    const existing = uniqueShards.get(sid);
    if (!existing || new Date(shard.last_seen) > new Date(existing.last_seen)) {
      uniqueShards.set(sid, shard);
    }
  });

  return Array.from(uniqueShards.values()).sort(
    (a, b) => (a.shard_id ?? 0) - (b.shard_id ?? 0),
  );
});

const getShardDisplayId = (shard) => {
  const fromId = shard.bot_id.split("(")[1]?.replace(")", "") || "";
  if (fromId.toLowerCase().includes("shard")) {
    return fromId.replace(/shard\s*/i, "");
  }
  return fromId || shard.$id;
};

const isShardOnline = (shard) => {
  if (!shard?.last_seen) return false;
  const lastSeen = new Date(shard.last_seen).getTime();
  const now = Date.now();
  return now - lastSeen < 120000;
};

const isServerOnline = (server) => {
  if (server.shard_id === undefined) return false;
  const shard = sortedShards.value.find((s) => s.shard_id === server.shard_id);

  if (!shard && totalExpectedShards.value === 1) {
    const shard0 = sortedShards.value.find((s) => s.shard_id === 0);
    return isShardOnline(shard0);
  }

  return isShardOnline(shard);
};

const fetchBotStatus = async () => {
  try {
    const response = await databases.listDocuments(
      databaseId,
      botStatusCollectionId,
    );
    allShards.value = response.documents;
    if (response.total > 0) {
      botStatus.value =
        response.documents.find((d) => d.bot_id.includes("Shard 0")) ||
        response.documents[0];
    }
  } catch (error) {
    console.error("Error fetching bot status:", error);
  }
};

const fetchServers = async () => {
  if (!userStore.user) return;
  serversLoading.value = true;
  try {
    const response = await databases.listDocuments(
      databaseId,
      serversCollectionId,
      [Query.equal("ownerId", userStore.user.$id)],
    );
    servers.value = response.documents;

    // Backfill missing icons from Discord guild data
    const discordGuilds = userStore.userGuilds || [];
    if (discordGuilds.length > 0) {
      for (const server of servers.value) {
        if (!server.icon) {
          const guild = discordGuilds.find((g) => g.id === server.$id);
          if (guild?.icon) {
            try {
              await databases.updateDocument(
                databaseId,
                serversCollectionId,
                server.$id,
                { icon: guild.icon },
              );
              server.icon = guild.icon;
            } catch {
              // Silently skip if update fails
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error fetching servers:", error);
  } finally {
    serversLoading.value = false;
  }
};

// Wait for store init, redirect if not logged in
watch(
  () => userStore.initialized,
  async (ready) => {
    if (!ready) return;
    if (!userStore.isLoggedIn) {
      navigateTo("/login");
      return;
    }
    try {
      await Promise.all([fetchServers(), fetchBotStatus()]);
      setInterval(fetchBotStatus, 30000);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const formatLastChecked = (dateString) => {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
</script>

<style scoped>
/* Additional component-specific styles if needed */
</style>
