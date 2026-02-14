<template>
  <header
    class="h-16 flex items-center justify-between px-6 py-4 shrink-0 backdrop-blur-xl bg-gray-900/50 border-b border-white/10 transition-all duration-300 z-10 relative"
  >
    <div class="flex items-center gap-4">
      <slot name="left" />
    </div>
    <div class="flex items-center gap-4">
      <slot />
      <slot name="right" />
    </div>
  </header>
</template>

<script setup lang="ts">
// Basic navbar mimicking UDashboardNavbar
</script>
