<template>
  <div class="p-8 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-black text-white tracking-tight gradient-text">
          Registered Servers
        </h1>
        <p class="text-gray-400 text-sm mt-1">
          Manage premium status for all servers using the bot. Premium unlocks
          hosted AI features.
        </p>
      </div>
      <UButton
        icon="i-heroicons-arrow-path"
        variant="ghost"
        color="neutral"
        :loading="serversLoading"
        @click="fetchServers"
        class="glass-card rounded-xl border border-white/8 hover:bg-white/10"
      />
    </div>

    <!-- Loading -->
    <div v-if="serversLoading" class="flex justify-center py-12">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-8 h-8 animate-spin text-violet-400"
      />
    </div>

    <!-- Empty -->
    <div
      v-else-if="servers.length === 0"
      class="glass-panel text-center py-16 rounded-3xl border-2 border-dashed border-white/8"
    >
      <UIcon
        name="i-heroicons-server-stack"
        class="w-12 h-12 text-gray-600 mx-auto mb-3"
      />
      <p class="text-gray-500">No servers registered yet.</p>
    </div>

    <!-- Servers grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div
        v-for="server in servers"
        :key="server.$id"
        class="glass-card rounded-2xl p-5 border border-white/8 hover:border-white/15 transition-all duration-200 relative overflow-hidden"
      >
        <!-- Server header -->
        <div class="flex items-center gap-3 mb-4">
          <img
            v-if="server.icon"
            :src="getIconUrl(server)"
            class="w-10 h-10 rounded-xl object-cover ring-2 ring-white/10 flex-shrink-0"
            :alt="server.name"
          />
          <div
            v-else
            class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/30 to-indigo-600/30 border border-white/10 flex items-center justify-center flex-shrink-0"
          >
            <span class="text-sm font-black text-white/60">{{
              server.name?.charAt(0)?.toUpperCase() || "?"
            }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-bold text-white truncate">{{ server.name }}</p>
            <p class="text-xs text-gray-500 font-mono truncate">
              {{ server.guild_id || server.$id }}
            </p>
          </div>
          <UBadge
            :color="server.status ? 'success' : 'neutral'"
            variant="soft"
            size="xs"
            class="shrink-0"
          >
            {{ server.status ? "Online" : "Offline" }}
          </UBadge>
        </div>

        <!-- Stats -->
        <div class="space-y-1.5 text-sm mb-4 pb-4 border-b border-white/5">
          <div class="flex justify-between text-gray-400">
            <span>Members</span>
            <span class="text-gray-200 font-medium">{{
              server.member_count?.toLocaleString() ?? "—"
            }}</span>
          </div>
          <div class="flex justify-between text-gray-400">
            <span>Shard</span>
            <span class="text-gray-200 font-medium">{{
              server.shard_id ?? "—"
            }}</span>
          </div>
          <div class="flex justify-between text-gray-400">
            <span>Joined</span>
            <span class="text-gray-200 font-medium">{{
              server.$createdAt ? formatDate(server.$createdAt) : "—"
            }}</span>
          </div>
        </div>

        <!-- Premium toggle -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-star" class="w-4 h-4 text-amber-400" />
            <span class="text-sm font-medium text-white">Premium</span>
            <UBadge
              v-if="server.premium"
              color="warning"
              variant="soft"
              size="xs"
            >
              Active
            </UBadge>
          </div>
          <USwitch
            :model-value="server.premium === true"
            @update:model-value="(v) => togglePremium(server, v)"
            :loading="updatingPremium === server.$id"
            color="warning"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Query } from "appwrite";

const { databases } = useAppwrite();
const toast = useToast();

const servers = ref<any[]>([]);
const serversLoading = ref(false);
const updatingPremium = ref<string | null>(null);

const databaseId = "discord_bot";

/** Handles both legacy full CDN URLs and icon hashes */
const getIconUrl = (server: any): string => {
  if (!server.icon) return "";
  if (server.icon.startsWith("http")) return server.icon;
  const guildId = server.guild_id || server.$id;
  return `https://cdn.discordapp.com/icons/${guildId}/${server.icon}.webp?size=64`;
};

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const fetchServers = async () => {
  serversLoading.value = true;
  try {
    const response = await databases.listDocuments(databaseId, "servers", [
      Query.orderDesc("name"),
      Query.limit(100),
    ]);
    servers.value = response.documents;
  } catch (error) {
    console.error("Error fetching servers:", error);
  } finally {
    serversLoading.value = false;
  }
};

const togglePremium = async (server: any, premium: boolean) => {
  updatingPremium.value = server.$id;
  try {
    await databases.updateDocument(databaseId, "servers", server.$id, {
      premium,
    });
    server.premium = premium;
    toast.add({
      title: premium ? "Premium Enabled" : "Premium Removed",
      description: `${server.name} is now ${premium ? "premium" : "standard"}.`,
      color: premium ? "warning" : "neutral",
    });
  } catch (error) {
    console.error("Error toggling premium:", error);
    toast.add({
      title: "Error",
      description: "Failed to update premium status.",
      color: "error",
    });
  } finally {
    updatingPremium.value = null;
  }
};

onMounted(() => fetchServers());
</script>

<style scoped>
.gradient-text {
  background: linear-gradient(to bottom right, #ffffff 30%, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
