<template>
  <ul class="space-y-2">
    <li
      v-for="opt in options"
      :key="opt.name"
      class="border-l-2 border-white/10 pl-3"
    >
      <div class="flex items-center gap-2 flex-wrap">
        <code class="text-xs font-semibold text-gray-300">{{ opt.name }}</code>
        <span
          class="text-[10px] uppercase tracking-wider text-gray-600 px-1.5 py-0.5 rounded bg-white/5"
          >{{ opt.type }}</span
        >
        <span
          v-if="opt.required"
          class="text-[10px] uppercase tracking-wider text-amber-400/80"
          >required</span
        >
      </div>
      <p v-if="opt.description" class="text-xs text-gray-500 mt-1">
        {{ opt.description }}
      </p>
      <DocsOptionList
        v-if="opt.options.length > 0"
        :options="opt.options"
        class="mt-2 ml-2"
      />
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { DocsCommandOption } from "~/composables/useDocs";

defineProps<{
  options: DocsCommandOption[];
}>();
</script>
