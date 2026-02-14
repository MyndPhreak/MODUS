<script setup lang="ts">
// Redirect /server/:guild_id to /server/:guild_id/modules
const route = useRoute();
const guildId = route.params.guild_id as string;
navigateTo(`/server/${guildId}/modules`, { replace: true });
</script>
