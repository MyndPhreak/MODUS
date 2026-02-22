<script setup lang="ts">
const userStore = useUserStore();
const isAuthReady = ref(false);

onMounted(async () => {
  await userStore.init();
  isAuthReady.value = true;
});
</script>

<template>
  <UApp>
    <!-- Zero-Flash Auth Gate: mask all content until session check completes -->
    <ClientOnly>
      <Transition name="auth-fade">
        <div v-if="!isAuthReady" class="auth-mask">
          <div class="auth-mask-content">
            <img
              src="/modus2-animated.svg"
              alt="MODUS"
              class="auth-mask-logo"
            />
            <div class="auth-mask-spinner" />
          </div>
        </div>
      </Transition>
    </ClientOnly>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<style>
body {
  margin: 0;
}

/* Zero-Flash Auth Mask */
.auth-mask {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #050507;
}

.auth-mask-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.auth-mask-logo {
  width: 80px;
  height: 80px;
  filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.4))
    drop-shadow(0 0 40px rgba(99, 102, 241, 0.2));
  animation: auth-logo-pulse 2s ease-in-out infinite;
}

.auth-mask-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(139, 92, 246, 0.2);
  border-top-color: rgba(139, 92, 246, 0.8);
  border-radius: 50%;
  animation: auth-spin 0.8s linear infinite;
}

@keyframes auth-logo-pulse {
  0%,
  100% {
    filter: drop-shadow(0 0 15px rgba(139, 92, 246, 0.3))
      drop-shadow(0 0 30px rgba(99, 102, 241, 0.15));
  }
  50% {
    filter: drop-shadow(0 0 25px rgba(139, 92, 246, 0.5))
      drop-shadow(0 0 50px rgba(99, 102, 241, 0.3));
  }
}

@keyframes auth-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Smooth fade-out when auth resolves */
.auth-fade-leave-active {
  transition: opacity 0.3s ease;
}
.auth-fade-leave-to {
  opacity: 0;
}
</style>
