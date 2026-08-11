<template>
  <USelectMenu
    :model-value="modelValue"
    value-key="value"
    :items="items"
    size="xs"
    class="w-full"
    :ui="{
      content: 'bg-[rgba(20,20,26,0.95)] ring ring-white/8 rounded-2xl',
      label: 'text-zinc-500',
      item: 'text-zinc-100 text-base py-1.5 px-2 rounded-lg data-highlighted:not-data-disabled:text-white data-highlighted:not-data-disabled:before:bg-violet-500/20',
    }"
    @update:model-value="$emit('update:modelValue', $event as string)"
    @update:open="handleOpenChange"
  >
    <template #item-label="{ item }">
      <span
        :ref="(el) => registerItemEl(el as Element | null, (item as FontSelectItem).value)"
        :style="
          (item as FontSelectItem).value
            ? {
                fontFamily: `'${(item as FontSelectItem).value}', ${(item as FontSelectItem).category}`,
              }
            : undefined
        "
      >
        {{ item.label }}
      </span>
    </template>
  </USelectMenu>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { useGoogleFonts } from "~/composables/useGoogleFonts";
import type { FontDefinition } from "#shared/fonts";

defineProps<{
  modelValue: string;
}>();

defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

interface FontSelectItem {
  type?: "label";
  label: string;
  value?: string;
  category?: FontDefinition["category"];
}

const { fontGroups, loadFont } = useGoogleFonts();

const items = computed<FontSelectItem[]>(() => {
  const out: FontSelectItem[] = [];
  for (const group of fontGroups) {
    out.push({ type: "label", label: group.label });
    for (const font of group.fonts) {
      out.push({
        label: font.family,
        value: font.family,
        category: font.category,
      });
    }
  }
  return out;
});

// Lazily previews fonts: only rows actually scrolled into view in the
// open dropdown get their Google Font CSS requested.
let observer: IntersectionObserver | null = null;

function handleOpenChange(open: boolean) {
  observer?.disconnect();
  observer = null;
  if (!open) return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const family = (entry.target as HTMLElement).dataset.font;
        if (family) loadFont(family);
      }
    },
    { threshold: 0.1 },
  );
}

function registerItemEl(el: Element | null, family?: string) {
  if (!el || !family || !observer) return;
  (el as HTMLElement).dataset.font = family;
  observer.observe(el);
}

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>
