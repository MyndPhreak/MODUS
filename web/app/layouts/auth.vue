<template>
  <div
    class="min-h-screen w-full flex items-center justify-center bg-[#050507] text-slate-200 selection:bg-purple-500/30 relative overflow-hidden"
  >
    <!-- Background Ambient Glows -->
    <div
      class="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] -z-10 pointer-events-none animate-pulse"
    ></div>
    <div
      class="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[100px] -z-10 pointer-events-none animate-pulse"
      style="animation-delay: 1s"
    ></div>

    <!-- Subtle Grid Pattern -->
    <div
      class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"
    ></div>

    <div class="w-full max-w-md p-6 z-10">
      <div class="flex flex-col items-center mb-10">
        <div class="relative -mb-6">
          <img
            src="/modus2-animated.svg"
            alt="MODUS Logo"
            class="w-40 logo-glow"
          />
        </div>
        <h1 class="text-3xl font-black text-white tracking-tighter mt-2">
          MODUS
        </h1>
        <p
          class="text-xs font-bold uppercase tracking-[0.3em] text-gray-500 mt-1"
        >
          Modular Discord Utility System
        </p>
      </div>

      <slot />

      <div class="mt-12 text-center">
        <p
          class="text-[10px] font-bold uppercase tracking-widest text-gray-600"
        >
          Powered by <span class="text-purple-500/80">MODUS Engine</span>
        </p>
      </div>
    </div>
  </div>
</template>

<style>
/* Global auth styles if needed */
.auth-glass-card {
  background: rgba(13, 13, 16, 0.7) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.8) !important;
}

.logo-glow {
  filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.4))
    drop-shadow(0 0 40px rgba(99, 102, 241, 0.2));
  animation: logo-pulse 3s ease-in-out infinite;
}

@keyframes logo-pulse {
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
</style>
