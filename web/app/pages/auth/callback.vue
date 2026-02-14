<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-900">
    <div class="text-center">
      <div class="relative inline-block mb-6">
        <div
          class="absolute inset-0 bg-purple-500 rounded-full blur-2xl opacity-30 animate-pulse"
        ></div>
        <UIcon
          name="i-heroicons-arrow-path"
          class="relative w-12 h-12 text-purple-400 animate-spin"
        />
      </div>
      <p class="text-gray-300 font-semibold">Completing login...</p>
      <p v-if="error" class="text-red-400 mt-4 text-sm">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false, // No sidebar layout during auth callback
});

const userStore = useUserStore();
const router = useRouter();
const error = ref("");

onMounted(async () => {
  try {
    // Session cookies were set by the server-side callback handler (/api/auth/callback).
    // Now we fetch the session details to hydrate the user store.
    await userStore.fetchUserSession();

    if (userStore.isLoggedIn) {
      router.push("/");
    } else {
      error.value = "Login failed. Please try again.";
      setTimeout(() => router.push("/login"), 2000);
    }
  } catch (err: any) {
    console.error("Auth callback failed:", err);
    error.value = err.message || "Authentication failed.";
    setTimeout(() => router.push("/login?error=auth_failed"), 2000);
  }
});
</script>
