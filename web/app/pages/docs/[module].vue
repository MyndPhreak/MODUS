<template>
  <NuxtLayout name="landing">
    <div class="landing-container">
      <div class="pt-40 pb-20 max-w-3xl mx-auto">
        <NuxtLink
          to="/docs"
          class="text-xs text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1 mb-6"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-3.5 h-3.5" />
          All modules
        </NuxtLink>

        <div v-if="pending" class="text-sm text-gray-500">Loading...</div>

        <div
          v-else-if="error"
          class="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300"
        >
          Docs are temporarily unavailable. The bot may be offline — try
          again shortly.
        </div>

        <div v-else-if="!currentModule" class="text-sm text-gray-500">
          No module named "{{ $route.params.module }}".
        </div>

        <template v-else>
          <h1
            class="text-3xl font-black text-white tracking-tight mb-2 capitalize"
          >
            {{ currentModule.name }}
          </h1>
          <p class="text-sm text-gray-400 leading-7 mb-10">
            {{ currentModule.description }}
          </p>

          <div class="space-y-8">
            <div
              v-for="cmd in currentModule.commands"
              :key="cmd.name"
              class="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5"
            >
              <div class="flex items-baseline gap-2 mb-2">
                <code class="text-sm font-bold text-purple-300"
                  >/{{ cmd.name }}</code
                >
              </div>
              <p class="text-sm text-gray-400 mb-4">{{ cmd.description }}</p>

              <DocsOptionList
                v-if="cmd.options.length > 0"
                :options="cmd.options"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
});

const route = useRoute();
const { modules, pending, error } = useDocs();

const currentModule = computed(() =>
  (modules.value ?? []).find(
    (m) => m.name.toLowerCase() === String(route.params.module).toLowerCase(),
  ),
);

useHead(() => ({
  title: currentModule.value
    ? `${currentModule.value.name.charAt(0).toUpperCase()}${currentModule.value.name.slice(1)} — Docs`
    : "Documentation",
}));
</script>
