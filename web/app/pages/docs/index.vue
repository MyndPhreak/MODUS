<template>
  <NuxtLayout name="landing">
    <div class="landing-container">
      <div class="pt-40 pb-20">
        <div class="mb-10">
          <h1 class="text-3xl font-black text-white tracking-tight mb-2">
            Documentation
          </h1>
          <p class="text-sm text-gray-500">
            Every module MODUS offers, and every command it registers.
          </p>
        </div>

        <div v-if="pending" class="text-sm text-gray-500">
          Loading modules...
        </div>

        <div
          v-else-if="error"
          class="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300"
        >
          Docs are temporarily unavailable. The bot may be offline — try
          again shortly.
        </div>

        <div
          v-else
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <NuxtLink
            v-for="mod in modules ?? []"
            :key="mod.name"
            :to="`/docs/${mod.name}`"
            class="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 flex flex-col gap-2 transition-all duration-200 hover:bg-white/[0.06] hover:border-white/15"
          >
            <span class="font-semibold text-sm text-white capitalize">{{
              mod.name
            }}</span>
            <span class="text-xs text-gray-500 leading-relaxed line-clamp-2">{{
              mod.description
            }}</span>
            <span
              class="text-[10px] text-gray-600 uppercase tracking-widest mt-auto pt-2"
            >
              {{ mod.commands.length }}
              command{{ mod.commands.length !== 1 ? "s" : "" }}
            </span>
          </NuxtLink>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
});

const { modules, pending, error } = useDocs();
</script>
