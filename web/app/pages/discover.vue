<template>
  <div class="py-10 px-4 md:px-10">
    <div class="mb-10">
      <div class="flex items-center gap-4 mb-3">
        <UButton
          variant="ghost"
          icon="i-heroicons-arrow-left"
          to="/"
          class="rounded-xl border border-white/5 bg-white/5 hover:bg-white/10"
        />
        <h1 class="text-3xl font-black text-white tracking-tight gradient-text">
          Discover Servers
        </h1>
      </div>
      <p class="text-gray-400 font-medium ml-14">
        Select a server where you have administrative privileges to add it to
        your management dashboard.
      </p>
    </div>

    <div
      v-if="loading"
      class="flex flex-col items-center justify-center py-32 space-y-4"
    >
      <div
        class="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"
      ></div>
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
        Synchronizing with Discord...
      </p>
    </div>

    <div
      v-else-if="error"
      class="glass-card border-red-500/20 rounded-3xl p-10 text-center max-w-2xl mx-auto"
    >
      <div
        class="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6"
      >
        <UIcon
          name="i-heroicons-exclamation-triangle"
          class="w-8 h-8 text-red-500"
        />
      </div>
      <h3 class="text-xl font-bold text-white mb-2">Failed to load servers</h3>
      <p class="text-gray-400 mb-8">{{ error }}</p>
      <UButton
        color="neutral"
        variant="solid"
        class="rounded-xl px-8"
        @click="fetchGuilds"
        >Try Again</UButton
      >
    </div>

    <div
      v-else-if="adminGuilds.length === 0"
      class="text-center py-24 glass-card border-dashed border-white/10 rounded-3xl max-w-2xl mx-auto"
    >
      <div
        class="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6"
      >
        <UIcon
          name="i-heroicons-magnifying-glass"
          class="w-10 h-10 text-gray-600"
        />
      </div>
      <h3 class="text-2xl font-bold text-white mb-2">No servers found</h3>
      <p class="text-gray-400 mb-8 max-w-sm mx-auto">
        We couldn't find any servers where you have administrator privileges.
        Try refreshing your session.
      </p>
      <UButton
        class="rounded-2xl px-10 py-3 bg-gradient-to-r from-purple-600 to-pink-600 font-bold"
        @click="refreshLogin"
      >
        Refresh Discord Connection
      </UButton>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      <UCard
        v-for="guild in adminGuilds"
        :key="guild.id"
        class="glass-card group hover:scale-[1.02] transition-all duration-300 border-white/5 rounded-3xl overflow-hidden shadow-xl"
        :ui="{
          body: 'p-6',
          header: 'border-b border-white/5 p-6',
          footer: 'bg-black/20 border-t border-white/5 p-4',
        }"
      >
        <template #header>
          <div class="flex items-center gap-4">
            <div class="relative flex-shrink-0">
              <UAvatar
                v-if="guild.icon"
                :src="`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`"
                :alt="guild.name"
                size="lg"
                class="rounded-2xl ring-2 ring-white/10"
              />
              <UAvatar
                v-else
                :alt="guild.name"
                size="lg"
                class="bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl ring-2 ring-white/10 font-bold"
              />
              <div
                class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0d0d10] bg-green-500"
              ></div>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-black text-white text-lg truncate tracking-tight">
                {{ guild.name }}
              </h3>
              <p
                class="text-[10px] font-bold uppercase tracking-widest text-gray-500"
              >
                ID: {{ guild.id }}
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-4 py-2">
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-if="guild.owner"
              color="warning"
              variant="subtle"
              class="rounded-lg text-[10px] uppercase font-black tracking-widest px-2 py-0.5"
              >Owner</UBadge
            >
            <UBadge
              color="primary"
              variant="subtle"
              class="rounded-lg text-[10px] uppercase font-black tracking-widest px-2 py-0.5"
              >Admin</UBadge
            >
            <!-- Show "Managed" badge if server exists in system but user isn't linked yet -->
            <UBadge
              v-if="isInSystem(guild.id) && !isUserManaging(guild.id)"
              color="info"
              variant="subtle"
              class="rounded-lg text-[10px] uppercase font-black tracking-widest px-2 py-0.5"
              >Managed by Others</UBadge
            >
          </div>
        </div>

        <template #footer>
          <div class="flex gap-2">
            <!-- State 1: User is already managing this server -->
            <UButton
              v-if="isUserManaging(guild.id)"
              class="flex-1"
              disabled
              size="lg"
              color="neutral"
              variant="soft"
              :class="[
                'rounded-xl font-black uppercase tracking-widest text-[11px] transition-all',
              ]"
            >
              Already Managing
            </UButton>

            <!-- State 2: Server exists in system, user has Discord admin but isn't linked -->
            <UButton
              v-else-if="isInSystem(guild.id)"
              class="flex-1"
              disabled
              size="lg"
              color="info"
              variant="soft"
              :class="[
                'rounded-xl font-black uppercase tracking-widest text-[11px] transition-all',
              ]"
            >
              Managed by Another Admin
            </UButton>

            <!-- State 3: Server not in system at all — connect it -->
            <UButton
              v-else
              class="flex-1"
              :loading="addingId === guild.id"
              @click="addServer(guild)"
              size="lg"
              color="primary"
              variant="solid"
              :class="[
                'rounded-xl font-black uppercase tracking-widest text-[11px] transition-all',
              ]"
            >
              Connect Server
            </UButton>

            <UButton
              v-if="isUserManaging(guild.id)"
              size="lg"
              color="success"
              variant="soft"
              class="rounded-xl font-black uppercase tracking-widest text-[11px] shrink-0"
              @click="openBotInvite(guild)"
              title="Invite Bot to Server"
            >
              <UIcon name="i-heroicons-plus-circle" class="w-5 h-5" />
              Invite Bot
            </UButton>
          </div>
        </template>
      </UCard>
    </div>

    <!-- Bot Invite Modal -->
    <UModal v-model:open="inviteModalOpen">
      <template #content>
        <div class="p-8 text-center space-y-6">
          <!-- Header -->
          <div class="space-y-3">
            <div
              class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center"
            >
              <UIcon
                name="i-heroicons-puzzle-piece"
                class="w-8 h-8 text-indigo-400"
              />
            </div>
            <h2 class="text-2xl font-black text-white tracking-tight">
              Add Bot to Server
            </h2>
            <p class="text-gray-400 text-sm max-w-sm mx-auto">
              <strong class="text-white">{{ inviteGuild?.name }}</strong> has
              been added to your dashboard. Now invite the bot so it can manage
              commands and features in this server.
            </p>
          </div>

          <!-- Info callout -->
          <div
            class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-left"
          >
            <div class="flex gap-3">
              <UIcon
                name="i-heroicons-information-circle"
                class="w-5 h-5 text-amber-400 shrink-0 mt-0.5"
              />
              <div class="text-sm text-amber-200/80">
                <p class="font-bold text-amber-300 mb-1">Why is this needed?</p>
                <p>
                  The bot must be a member of your Discord server to respond to
                  commands, play music, manage modules, and provide real-time
                  logging.
                </p>
              </div>
            </div>
          </div>

          <!-- Permissions preview -->
          <div class="bg-white/5 rounded-xl p-4 border border-white/10">
            <p
              class="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3"
            >
              Requested Permissions
            </p>
            <div class="flex flex-wrap justify-center gap-2">
              <UBadge
                v-for="perm in botPermissionsList"
                :key="perm"
                variant="soft"
                color="neutral"
                class="rounded-lg text-[10px] uppercase font-bold tracking-wider"
              >
                {{ perm }}
              </UBadge>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-col gap-3">
            <UButton
              block
              size="xl"
              color="primary"
              class="rounded-xl font-black uppercase tracking-widest text-sm bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border-none shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all hover:scale-[1.02]"
              @click="openDiscordInvite"
            >
              <UIcon
                name="i-heroicons-arrow-top-right-on-square"
                class="w-5 h-5 mr-2"
              />
              Open Discord Invite
            </UButton>
            <UButton
              block
              size="lg"
              variant="ghost"
              color="neutral"
              class="rounded-xl text-sm text-gray-400 hover:text-white"
              @click="inviteModalOpen = false"
            >
              Skip for Now
            </UButton>
          </div>

          <p class="text-[11px] text-gray-600">
            A Discord dialog will open in a new tab where you can authorize the
            bot.
          </p>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const userStore = useUserStore();
const toast = useToast();
const router = useRouter();
const config = useRuntimeConfig();

const loading = ref(true);
const error = ref<string | null>(null);
const guilds = ref<any[]>([]);
const existingServers = ref<any[]>([]);
const addingId = ref<string | null>(null);

// Bot invite modal state
const inviteModalOpen = ref(false);
const inviteGuild = ref<any>(null);

const ADMIN_PERMISSION = 0x8;

// Permissions the bot requests (Administrator for full access)
const BOT_PERMISSIONS = "8"; // Administrator
const botPermissionsList = [
  "Administrator",
  "Manage Server",
  "Manage Channels",
  "Send Messages",
  "Read Messages",
  "Connect (Voice)",
  "Speak (Voice)",
];

const adminGuilds = computed(() => {
  return guilds.value.filter((guild: any) => {
    const permissions = BigInt(guild.permissions);
    return (
      (permissions & BigInt(ADMIN_PERMISSION)) === BigInt(ADMIN_PERMISSION)
    );
  });
});

/** Check if a server exists in the system at all (added by anyone) */
const isInSystem = (guildId: string) => {
  return existingServers.value.some((s: any) => s.$id === guildId);
};

/** Check if the current user is managing this server (owner or in admin_user_ids) */
const isUserManaging = (guildId: string) => {
  const server = existingServers.value.find((s: any) => s.$id === guildId);
  if (!server) return false;
  const userId = userStore.user?.$id;
  if (!userId) return false;

  const isOwner = server.owner_id === userId;
  const isAdmin =
    Array.isArray(server.admin_user_ids) &&
    server.admin_user_ids.includes(userId);

  return isOwner || isAdmin;
};

/** Build the Discord OAuth2 bot invite URL with guild pre-selected */
const getBotInviteUrl = (guildId: string) => {
  const clientId = config.public.discordClientId as string;
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: BOT_PERMISSIONS,
    guild_id: guildId,
    disable_guild_select: "true",
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
};

const openBotInvite = (guild: any) => {
  inviteGuild.value = guild;
  inviteModalOpen.value = true;
};

const openDiscordInvite = () => {
  if (!inviteGuild.value) return;
  const url = getBotInviteUrl(inviteGuild.value.id);
  if (!url) {
    console.error(
      "[Discover] No bot invite URL — is NUXT_PUBLIC_DISCORD_CLIENT_ID set? Value:",
      config.public.discordClientId,
    );
    toast.add({
      title: "Configuration Error",
      description:
        "Discord Client ID is not configured. Please check your environment variables.",
      color: "error",
    });
    return;
  }
  // Use window.open without features string to avoid popup blocker
  const win = window.open(url, "_blank");
  if (!win) {
    // Fallback: navigate directly if popup was blocked
    window.location.href = url;
  }
  inviteModalOpen.value = false;
};

const fetchGuilds = async () => {
  loading.value = true;
  error.value = null;
  try {
    if (!userStore.isLoggedIn) {
      await userStore.fetchUserSession();
    }

    if (!userStore.isLoggedIn) {
      router.push("/login");
      return;
    }

    let discordGuilds: any[] = [];

    // Try the server API first (uses API key to access Discord provider token)
    try {
      const response = await fetch("/api/discord/guilds");
      if (response.ok) {
        discordGuilds = await response.json();
      }
    } catch {
      // Server API failed, will try fallback
    }

    // Fallback to user store's cached guilds
    if (!discordGuilds || discordGuilds.length === 0) {
      discordGuilds = userStore.userGuilds;
    }

    guilds.value = Array.isArray(discordGuilds) ? discordGuilds : [];
    if (!Array.isArray(discordGuilds) || discordGuilds.length === 0) {
      error.value =
        "No servers found. Please try logging in again to refresh your Discord connection.";
    }

    // Load existing servers separately — this should succeed even if Discord API failed
    try {
      if (adminGuilds.value.length > 0) {
        const guildIds = adminGuilds.value.map((g: any) => g.id).join(",");
        const response = await fetch(
          `/api/servers/by-guild-ids?ids=${encodeURIComponent(guildIds)}`,
          { credentials: "include" },
        );
        if (response.ok) {
          existingServers.value = await response.json();
        }
      }
    } catch (dbErr) {
      console.warn("[Discover] Failed to load existing servers:", dbErr);
    }
  } catch (err: any) {
    console.error("Fetch error:", err);
    error.value = err.message || "An error occurred while fetching servers.";
  } finally {
    loading.value = false;
  }
};

/** Add a new server to the system (first admin to connect it) */
const addServer = async (guild: any) => {
  addingId.value = guild.id;
  try {
    await fetch("/api/servers/add", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guild_id: guild.id,
        name: guild.name,
        icon: guild.icon || null,
      }),
    });

    toast.add({
      title: "Server Connected",
      description: `${guild.name} has been added to your dashboard.`,
      color: "success",
    });

    // Refresh the existing servers list via server API
    if (adminGuilds.value.length > 0) {
      const guildIds = adminGuilds.value.map((g: any) => g.id).join(",");
      const response = await fetch(
        `/api/servers/by-guild-ids?ids=${encodeURIComponent(guildIds)}`,
        { credentials: "include" },
      );
      if (response.ok) {
        existingServers.value = await response.json();
      }
    }

    // Automatically prompt to invite the bot after adding the server
    openBotInvite(guild);
  } catch (err: any) {
    toast.add({
      title: "Error",
      description: err.message || "Failed to add server.",
      color: "error",
    });
  } finally {
    addingId.value = null;
  }
};

const refreshLogin = () => {
  userStore.loginWithDiscord();
};

onMounted(() => {
  fetchGuilds();
});
</script>
