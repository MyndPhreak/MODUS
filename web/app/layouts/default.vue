<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { Query } from "appwrite";

const userStore = useUserStore();
const { botHealthOnline, botLatency, healthChecking, lastHealthCheck } =
  useBotHealth();
const { state: serverSidebar } = useServerSidebar();
const { databases } = useAppwrite();
const isMounted = ref(false);
const route = useRoute();

// Sidebar servers list
const sidebarServers = ref<any[]>([]);

const databaseId = "discord_bot";
const serversCollectionId = "servers";

async function fetchSidebarServers() {
  if (!userStore.user) return;
  try {
    const userId = userStore.user.$id;

    // Primary: servers the user owns
    let ownerDocs: any[] = [];
    try {
      const res = await databases.listDocuments(
        databaseId,
        serversCollectionId,
        [Query.equal("owner_id", userId)],
      );
      ownerDocs = res.documents;
    } catch (e) {
      console.warn("[Sidebar] owner_id query failed:", e);
    }

    // Secondary: servers the user is listed as admin on
    let adminDocs: any[] = [];
    try {
      const res = await databases.listDocuments(
        databaseId,
        serversCollectionId,
        [Query.contains("admin_user_ids", [userId])],
      );
      adminDocs = res.documents;
    } catch {
      // admin_user_ids attribute may not exist on all docs yet
    }

    // Merge and deduplicate
    const seen = new Set<string>();
    sidebarServers.value = [...ownerDocs, ...adminDocs].filter((doc) => {
      if (seen.has(doc.$id)) return false;
      seen.add(doc.$id);
      return true;
    });
  } catch {
    // silently ignore
  }
}

// Fetch when user is ready
watch(
  () => userStore.initialized,
  async (ready) => {
    if (ready && userStore.isLoggedIn) {
      await fetchSidebarServers();
    }
  },
  { immediate: true },
);

onMounted(() => {
  isMounted.value = true;
});

const isBotAdmin = computed(() => userStore.isAdmin);

const isServerContext = computed(() => !!serverSidebar.value);

const userInitial = computed(() => userStore.userName.charAt(0).toUpperCase());

// Active link helper for default nav
function isActive(to: string) {
  if (to === "/") return route.path === "/";
  return route.path.startsWith(to);
}

function getGuildIconUrl(guildId: string, iconHash: string, size = 32) {
  if (!iconHash) return null;
  const ext = iconHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=${size}`;
}

async function handleLogout() {
  await userStore.logout();
}

const mainNavLinks = computed(() => {
  const links = [
    {
      label: "Dashboard",
      icon: "i-heroicons-home",
      to: "/",
    },
  ];

  if (isBotAdmin.value) {
    links.push({
      label: "Admin",
      icon: "i-heroicons-shield-check",
      to: "/admin",
    });
  }

  return links;
});
</script>

<template>
  <DashboardGroup>
    <!-- Sidebar -->
    <!-- Ambient Background Effects -->
    <div class="ambient-orb ambient-orb-1"></div>
    <div class="ambient-orb ambient-orb-2"></div>

    <DashboardSidebar>
      <template #header>
        <!-- Default header: brand -->
        <div
          v-if="!isServerContext"
          class="flex items-center gap-3 px-6 py-6 border-b border-white/5 bg-[#050507]/20"
        >
          <div class="relative flex-shrink-0">
            <img
              src="/modus2-animated.svg"
              alt="MODUS Logo"
              class="relative w-16 rounded-xl"
            />
          </div>
          <div>
            <h1 class="text-base font-black text-white tracking-tight">
              MODUS
            </h1>
            <p
              class="text-[9px] font-bold uppercase tracking-widest text-gray-500"
            >
              Modular Discord Utility System
            </p>
          </div>
        </div>

        <!-- Server / Admin context header: guild info + back -->
        <div v-else class="border-b border-white/5 bg-[#050507]/20">
          <!-- Back to dashboard -->
          <NuxtLink
            to="/"
            class="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-500 hover:text-white transition-colors border-b border-white/5 group"
          >
            <UIcon
              name="i-heroicons-arrow-left"
              class="text-sm group-hover:-translate-x-0.5 transition-transform"
            />
            Back to Dashboard
          </NuxtLink>

          <!-- Admin context header -->
          <div
            v-if="serverSidebar?.guild?.id === '__admin__'"
            class="flex items-center gap-3 px-5 py-4"
          >
            <div
              class="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-400/30 flex items-center justify-center"
            >
              <UIcon
                name="i-heroicons-shield-check"
                class="w-4 h-4 text-violet-300"
              />
            </div>
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-bold text-white truncate">Bot Admin</h2>
              <p
                class="text-[9px] text-violet-400 uppercase tracking-wider font-semibold"
              >
                Admin Panel
              </p>
            </div>
          </div>

          <!-- Guild info (server context) -->
          <div v-else class="flex items-center gap-3 px-5 py-4">
            <UAvatar
              v-if="serverSidebar?.guild?.icon"
              :src="`https://cdn.discordapp.com/icons/${serverSidebar.guild.id}/${serverSidebar.guild.icon}.png`"
              :alt="serverSidebar?.guild?.name"
              size="sm"
            />
            <UAvatar
              v-else
              :alt="serverSidebar?.guild?.name || '?'"
              size="sm"
            />
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-bold text-white truncate">
                {{ serverSidebar?.guild?.name }}
              </h2>
              <p
                class="text-[9px] text-gray-500 uppercase tracking-wider font-semibold"
              >
                Server Settings
              </p>
            </div>
          </div>
        </div>
      </template>

      <!-- Navigation -->
      <nav class="flex-1 px-4 py-6 overflow-y-auto custom-scrollbar">
        <!-- Default navigation -->
        <template v-if="!isServerContext">
          <!-- Section: Main -->
          <p
            class="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600"
          >
            Main
          </p>
          <template v-for="link in mainNavLinks" :key="link.to">
            <NuxtLink
              :to="link.to"
              class="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 mb-1"
              :class="
                isActive(link.to)
                  ? 'bg-secondary-500/15 text-secondary-400 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              "
            >
              <UIcon :name="link.icon" class="text-base shrink-0" />
              <span>{{ link.label }}</span>
            </NuxtLink>
          </template>

          <!-- Divider -->
          <div class="my-3 mx-1 border-t border-white/5" />

          <!-- Section: Servers -->
          <p
            class="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600"
          >
            My Servers
          </p>

          <!-- Connected servers list -->
          <template v-if="sidebarServers.length > 0">
            <NuxtLink
              v-for="server in sidebarServers"
              :key="server.$id"
              :to="`/server/${server.$id}/modules`"
              class="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 mb-1 group"
              :class="
                route.path.startsWith(`/server/${server.$id}`)
                  ? 'bg-secondary-500/15 text-secondary-400 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              "
            >
              <!-- Guild icon or fallback -->
              <div class="relative shrink-0 w-5 h-5">
                <img
                  v-if="server.icon"
                  :src="
                    getGuildIconUrl(server.$id, server.icon, 32) || undefined
                  "
                  :alt="server.name"
                  class="w-5 h-5 rounded-md object-cover ring-1 ring-white/10"
                />
                <div
                  v-else
                  class="w-5 h-5 rounded-md bg-gradient-to-br from-violet-600/40 to-indigo-600/40 border border-white/10 flex items-center justify-center"
                >
                  <span class="text-[8px] font-black text-white/60">{{
                    server.name?.charAt(0)?.toUpperCase() || "?"
                  }}</span>
                </div>
              </div>
              <span class="truncate">{{ server.name }}</span>
            </NuxtLink>
          </template>
          <p v-else class="px-3 py-1.5 text-xs text-gray-600 italic">
            No servers yet
          </p>

          <!-- Add Server link -->
          <NuxtLink
            to="/discover"
            class="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 mt-1"
            :class="
              isActive('/discover')
                ? 'bg-secondary-500/15 text-secondary-400 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            "
          >
            <UIcon name="i-heroicons-plus-circle" class="text-base shrink-0" />
            <span>Add Server</span>
          </NuxtLink>
        </template>

        <!-- Server context navigation -->
        <template v-else-if="serverSidebar">
          <p
            class="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600"
          >
            Configuration
          </p>
          <template v-for="tab in serverSidebar.tabs" :key="tab.id">
            <!-- Separator -->
            <div
              v-if="tab.separator"
              class="my-2 mx-3 border-t border-white/5"
            />
            <!-- Route-based tab (NuxtLink) -->
            <NuxtLink
              v-if="tab.to && !tab.disabled"
              :to="tab.to"
              class="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
              :class="
                serverSidebar.activeTab === tab.id
                  ? 'bg-secondary-500/15 text-secondary-400 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              "
            >
              <UIcon :name="tab.icon" class="text-base shrink-0" />
              <span>{{ tab.label }}</span>
              <UBadge
                v-if="tab.badge"
                variant="soft"
                color="neutral"
                size="xs"
                class="ml-auto"
              >
                {{ tab.badge }}
              </UBadge>
            </NuxtLink>
            <!-- Action-based tab (button) -->
            <button
              v-else
              class="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
              :class="
                serverSidebar.activeTab === tab.id
                  ? 'bg-secondary-500/15 text-secondary-200 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
                  : tab.disabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
              "
              :disabled="tab.disabled"
              @click="tab.action?.()"
            >
              <UIcon :name="tab.icon" class="text-base shrink-0" />
              <span>{{ tab.label }}</span>
              <UBadge
                v-if="tab.badge"
                variant="soft"
                color="neutral"
                size="xs"
                class="ml-auto"
              >
                {{ tab.badge }}
              </UBadge>
            </button>
          </template>
        </template>
      </nav>

      <!-- User Profile Section -->
      <template #footer>
        <div v-if="isMounted" class="p-6 bg-black/40 border-t border-white/5">
          <div
            class="flex items-center gap-3 p-3 rounded-2xl glass-card border-white/10 hover:bg-white/10 transition-all cursor-pointer group"
          >
            <div class="relative flex-shrink-0">
              <div
                class="absolute -inset-1 bg-gradient-to-br from-violet-500 to-indigo-500 rounded-xl blur opacity-0 group-hover:opacity-40 transition-opacity"
              ></div>
              <!-- Discord avatar or fallback -->
              <img
                v-if="userStore.userAvatar"
                :src="userStore.userAvatar"
                :alt="userStore.userName"
                class="w-10 h-10 rounded-xl ring-2 ring-white/10 object-cover"
              />
              <div
                v-else
                class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center ring-2 ring-white/10"
              >
                <span class="text-white font-bold text-sm">{{
                  userInitial
                }}</span>
              </div>
            </div>
            <div class="flex-1 min-w-0 text-left text-slate-200">
              <p class="text-sm font-bold truncate">
                {{ userStore.userName }}
              </p>
              <p
                v-if="userStore.discordId"
                class="text-[10px] text-gray-400 font-medium truncate uppercase tracking-wider"
              >
                Discord Connected
              </p>
              <p
                v-else-if="userStore.userEmail"
                class="text-[10px] text-gray-400 font-medium truncate uppercase tracking-wider"
              >
                {{ userStore.userEmail }}
              </p>
            </div>
          </div>
          <UButton
            @click="handleLogout"
            color="neutral"
            variant="ghost"
            size="sm"
            class="w-full mt-4 rounded-xl border border-white/5 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            icon="i-heroicons-arrow-left-on-rectangle"
          >
            Logout
          </UButton>
        </div>
      </template>
    </DashboardSidebar>

    <!-- Main Content Panel -->
    <DashboardPanel>
      <template #header>
        <DashboardNavbar>
          <template #left>
            <h2
              class="text-xl font-black text-white tracking-tight gradient-text ml-4"
            >
              Dashboard
            </h2>
          </template>

          <template #right>
            <div class="flex items-center gap-3 mr-4">
              <div
                v-if="isMounted"
                class="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-glass-sm transition-all duration-300"
                :class="
                  botHealthOnline
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : healthChecking && !lastHealthCheck
                      ? 'bg-yellow-500/5 border-yellow-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                "
              >
                <div
                  :class="[
                    'w-2 h-2 rounded-full transition-colors duration-300',
                    botHealthOnline
                      ? 'bg-emerald-400 animate-pulse shadow-[0_0_12px_rgba(74,222,128,0.6)]'
                      : healthChecking && !lastHealthCheck
                        ? 'bg-yellow-400 animate-spin shadow-[0_0_12px_rgba(250,204,21,0.4)]'
                        : 'bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.4)]',
                  ]"
                ></div>
                <span
                  class="text-[10px] font-bold uppercase tracking-widest"
                  :class="
                    botHealthOnline
                      ? 'text-emerald-300'
                      : healthChecking && !lastHealthCheck
                        ? 'text-yellow-300'
                        : 'text-red-300'
                  "
                >
                  {{
                    botHealthOnline
                      ? "Live"
                      : healthChecking && !lastHealthCheck
                        ? "Checking"
                        : "Offline"
                  }}
                </span>
                <span
                  v-if="botHealthOnline && botLatency > 0"
                  class="text-[9px] font-mono text-gray-500 border-l border-white/10 pl-2"
                >
                  {{ botLatency }}ms
                </span>
              </div>

              <UButton
                icon="i-heroicons-bell"
                color="neutral"
                variant="ghost"
                class="rounded-full w-9 h-9 p-0 border border-white/5"
              />
            </div>
          </template>
        </DashboardNavbar>
      </template>

      <!-- Page Content -->
      <slot />
    </DashboardPanel>
  </DashboardGroup>
</template>

<style>
.gradient-text {
  background: linear-gradient(to bottom right, #ffffff 30%, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Ensure glass classes are available if main.css isn't fully loaded yet */
.glass-sidebar {
  background: rgba(13, 13, 16, 0.7);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.shadow-glass-sm {
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.4);
}
</style>
