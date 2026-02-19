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

    <div class="w-full max-w-4xl p-6 z-10">
      <div class="flex flex-col items-center mb-10">
        <div class="relative mb-4">
          <h1 class="text-3xl font-black text-white tracking-tighter">
            MOD<span class="text-purple-400">US</span>
          </h1>
        </div>
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
