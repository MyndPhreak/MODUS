<template>
  <div>
    <!-- Loading spinner while checking session -->
    <div v-if="!userStore.initialized" class="text-center">
      <UIcon
        name="i-heroicons-arrow-path"
        class="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4"
      />
      <p class="text-gray-400 text-sm">Checking session...</p>
    </div>

    <!-- Main Login Card -->
    <div v-else class="auth-card">
      <!-- Welcome Text -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-black text-white tracking-tight mb-2">
          Welcome Back
        </h1>
        <p class="text-sm text-gray-400">
          Sign in with Discord to access your MODUS dashboard
        </p>
      </div>

      <!-- Discord Login Button -->
      <button
        @click="loginWithDiscord"
        :disabled="userStore.loading"
        class="discord-btn group relative w-full"
      >
        <!-- Animated glow effect -->
        <div
          class="absolute -inset-0.5 bg-gradient-to-r from-[#5865F2] to-[#7289DA] rounded-2xl opacity-0 group-hover:opacity-75 blur transition-opacity duration-300"
        ></div>

        <!-- Button content -->
        <div
          class="relative flex items-center justify-center gap-3 px-8 py-4 bg-[#5865F2] rounded-2xl font-bold text-white text-lg transition-all duration-200 group-hover:bg-[#4752C4] group-hover:scale-[1.02] group-hover:shadow-[0_0_40px_rgba(88,101,242,0.5)]"
        >
          <UIcon
            v-if="!userStore.loading"
            name="i-simple-icons-discord"
            class="w-6 h-6"
          />
          <UIcon
            v-else
            name="i-heroicons-arrow-path"
            class="w-6 h-6 animate-spin"
          />
          <span>{{
            userStore.loading ? "Connecting..." : "Continue with Discord"
          }}</span>
        </div>
      </button>

      <!-- Info Text -->
      <div class="mt-8 text-center">
        <p class="text-xs text-gray-500">
          By signing in, you agree to our
          <a href="#" class="text-purple-400 hover:underline">Terms</a> and
          <a href="#" class="text-purple-400 hover:underline">Privacy Policy</a>
        </p>
      </div>

      <!-- Feature highlights -->
      <div class="mt-10 space-y-3">
        <div class="flex items-center gap-3 text-sm text-gray-400">
          <div
            class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0"
          >
            <UIcon
              name="i-heroicons-shield-check"
              class="w-4 h-4 text-purple-400"
            />
          </div>
          <span>Secure authentication via Discord OAuth</span>
        </div>
        <div class="flex items-center gap-3 text-sm text-gray-400">
          <div
            class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0"
          >
            <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-blue-400" />
          </div>
          <span>Instant access to your bot configurations</span>
        </div>
        <div class="flex items-center gap-3 text-sm text-gray-400">
          <div
            class="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center flex-shrink-0"
          >
            <UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-pink-400" />
          </div>
          <span>Manage modules, commands, and permissions</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "auth",
});

const userStore = useUserStore();
const router = useRouter();

// Once initialized, if already logged in, redirect
watch(
  () => userStore.initialized,
  (ready) => {
    if (ready && userStore.isLoggedIn) {
      router.push("/");
    }
  },
);

// Also watch isLoggedIn in case it changes after init
watch(
  () => userStore.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      router.push("/");
    }
  },
);

const loginWithDiscord = () => {
  try {
    userStore.loginWithDiscord();
  } catch (error) {
    console.error("Discord login failed:", error);
  }
};
</script>

<style scoped>
.auth-card {
  background: rgba(13, 13, 16, 0.7);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.8);
  border-radius: 24px;
  padding: 40px;
  max-width: 480px;
  margin: 0 auto;
}

.discord-btn {
  position: relative;
  transition: all 0.2s ease;
}

.discord-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.discord-btn:disabled:hover {
  transform: none !important;
}
</style>
