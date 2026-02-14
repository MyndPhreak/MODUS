<script setup lang="ts">
import { ref, onMounted, computed } from "vue";

const userStore = useUserStore();
const { botHealthOnline, botLatency, healthChecking, lastHealthCheck } =
  useBotHealth();
const { state: serverSidebar } = useServerSidebar();
const isMounted = ref(false);

onMounted(() => {
  isMounted.value = true;
});

const isBotAdmin = computed(() => {
  if (!userStore.discordId) return false;
  const config = useRuntimeConfig();
  const adminIds = (config.public.botAdminIds || "")
    .split(",")
    .map((id: string) => id.trim());
  return adminIds.includes(userStore.discordId);
});

const navigation = computed(() => {
  const items = [
    {
      label: "Dashboard",
      icon: "i-heroicons-home",
      to: "/",
    },
    {
      label: "Discover",
      icon: "i-heroicons-magnifying-glass",
      to: "/discover",
    },
  ];

  if (isBotAdmin.value) {
    items.push({
      label: "Admin",
      icon: "i-heroicons-shield-check",
      to: "/admin",
    });
  }

  return items;
});

const isServerContext = computed(() => !!serverSidebar.value);

const userInitial = computed(() => userStore.userName.charAt(0).toUpperCase());

async function handleLogout() {
  await userStore.logout();
}
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
            <div
              class="absolute -inset-1 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl blur opacity-30 animate-pulse"
            ></div>
          </div>
          <div>
            <h1 class="text-base font-black text-white tracking-tight">
              MOD<span class="text-violet-400">US</span>
            </h1>
            <p
              class="text-[9px] font-bold uppercase tracking-widest text-gray-500"
            >
              Modular Discord Utility System
            </p>
          </div>
        </div>

        <!-- Server context header: guild info + back -->
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
          <!-- Guild info -->
          <div class="flex items-center gap-3 px-5 py-4">
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
      <nav class="flex-1 px-4 py-6 space-y-1">
        <!-- Default navigation -->
        <template v-if="!isServerContext">
          <UNavigationMenu
            v-if="isMounted"
            :items="navigation"
            orientation="vertical"
            class="w-full"
            :ui="{
              link: 'px-4 py-3 rounded-xl transition-all duration-200 text-sm font-semibold mb-1',
              linkLeadingIcon: 'w-5 h-5',
            }"
          />
        </template>

        <!-- Server context navigation -->
        <template v-else-if="serverSidebar">
          <p
            class="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600"
          >
            Configuration
          </p>
          <button
            v-for="tab in serverSidebar.tabs"
            :key="tab.id"
            class="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
            :class="
              serverSidebar.activeTab === tab.id
                ? 'bg-primary-500/15 text-primary-400 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
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
