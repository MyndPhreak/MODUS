<script setup lang="ts">
// Redirect /dashboard/server/:guild_id to .../modules. A redirect function
// in route metadata resolves at the router level before this component
// renders, avoiding the "missing template" warning that navigateTo() in
// setup produced.
definePageMeta({
  redirect: (to) => `/dashboard/server/${to.params.guild_id}/modules`,
});
</script>
