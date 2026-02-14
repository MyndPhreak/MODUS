<template>
  <main class="flex-1 flex flex-col min-w-0 overflow-hidden relative">
    <!-- Header Section (Floating) -->
    <div v-if="$slots.header" class="absolute top-0 inset-x-0 z-20">
      <slot name="header" />
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto px-6 pb-6 pt-24">
      <slot />
    </div>
  </main>
</template>

<script setup lang="ts">
// Basic panel layout mimicking UDashboardPanel
</script>
