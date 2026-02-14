<template>
  <aside
    class="flex flex-col w-64 glass-sidebar border-r border-white/10 shrink-0 h-full transition-all duration-300 z-30 relative"
  >
    <!-- Logo/Header Section -->
    <div v-if="$slots.header" class="shrink-0">
      <slot name="header" />
    </div>

    <!-- Main Navigation Content -->
    <div class="flex-1 overflow-y-auto px-2 py-2">
      <slot />
    </div>

    <!-- Footer/User Profile Section -->
    <div v-if="$slots.footer" class="shrink-0 mt-auto">
      <slot name="footer" />
    </div>
  </aside>
</template>

<script setup lang="ts">
// Basic sidebar container mimicking UDashboardSidebar
</script>
