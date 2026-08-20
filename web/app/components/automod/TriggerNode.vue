<template>
  <div
    class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
  >
    <div
      class="p-1.5 rounded-md bg-orange-500/10 border border-orange-500/20 shrink-0"
    >
      <UIcon name="i-heroicons-bolt" class="text-orange-400 text-sm" />
    </div>
    <span
      class="text-xs font-semibold text-orange-300 uppercase tracking-wider shrink-0"
      >Trigger</span
    >
    <USelectMenu
      :model-value="modelValue"
      :items="flatItems"
      value-key="value"
      size="md"
      class="flex-1"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
interface TriggerOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface TriggerGroup {
  label: string;
  items: TriggerOption[];
}

const props = defineProps<{
  modelValue: string;
  groups: TriggerGroup[];
}>();

defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

// Insert a disabled header row before each group so the flat USelectMenu
// list reads as sectioned without depending on multi-array group support.
const flatItems = computed<TriggerOption[]>(() =>
  props.groups.flatMap((group) => [
    {
      label: group.label.toUpperCase(),
      value: `__header_${group.label}`,
      disabled: true,
    },
    ...group.items,
  ]),
);
</script>
