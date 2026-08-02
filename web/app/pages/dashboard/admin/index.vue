<script setup lang="ts">
// Redirect /dashboard/admin to /dashboard/admin/modules. Declaring the
// redirect as route metadata lets vue-router resolve it before this
// component renders, avoiding the "missing template" warning and the
// brief empty render that navigateTo() in setup produced.
definePageMeta({
  redirect: "/dashboard/admin/modules",
});
</script>
