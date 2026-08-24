<template>
  <aside
    class="flex flex-col glass-sidebar border-r border-white/10 h-full transition-all duration-300 fixed inset-y-0 left-0 z-40 md:static md:z-30 md:w-64 overflow-x-hidden"
    :class="expanded ? 'w-64' : 'w-16'"
  >
    <!-- Logo/Header Section -->
    <div v-if="$slots.header" class="shrink-0">
      <slot name="header" :expanded="expanded" />
    </div>

    <!-- Main Navigation Content -->
    <div class="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
      <slot :expanded="expanded" />
    </div>

    <!-- Footer/User Profile Section -->
    <div v-if="$slots.footer" class="shrink-0 mt-auto">
      <slot name="footer" :expanded="expanded" />
    </div>
  </aside>
</template>

<script setup lang="ts">
// Sidebar container mimicking UDashboardSidebar.
// On mobile it renders as a fixed icon-only rail (w-16) that expands to a
// full-width overlay (w-64) on top of the main content instead of pushing
// it — controlled by the `expanded` prop. On md+ it's always full width
// and part of the normal flex flow.
withDefaults(defineProps<{ expanded?: boolean }>(), {
  expanded: false,
});
</script>
