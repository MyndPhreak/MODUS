<template>
  <div>
    <!-- Redirect message -->
    <div class="text-center">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4"
      />
      <p class="text-gray-400 text-sm">Redirecting to login...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "auth",
});

const router = useRouter();

// Immediately redirect to login page since we only support Discord auth
onMounted(() => {
  router.push("/login");
});
</script>
