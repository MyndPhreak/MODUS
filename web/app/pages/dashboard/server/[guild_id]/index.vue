<script setup lang="ts">
// Redirect /dashboard/server/:guild_id to /dashboard/server/:guild_id/modules
const route = useRoute();
const guildId = route.params.guild_id as string;
navigateTo(`/dashboard/server/${guildId}/modules`, { replace: true });
</script>
