<template>
  <div
    class="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3"
  >
    <p class="text-xs text-gray-500">
      Quick create a simple rule. Need more than one condition or action?
      <button
        type="button"
        class="text-orange-300 hover:text-orange-200 underline"
        @click="promote()"
      >
        Open full editor
      </button>
      instead.
    </p>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-gray-400">When</span>
      <USelectMenu
        v-model="trigger"
        :items="flatTriggerItems"
        value-key="value"
        size="sm"
        class="min-w-48"
      />
      <span class="text-gray-400">, if</span>
      <USelectMenu
        v-model="field"
        :items="quickFieldOptions"
        value-key="value"
        size="sm"
        class="min-w-40"
      />
      <USelectMenu
        v-model="operator"
        :items="quickOperatorOptions"
        value-key="value"
        size="sm"
        class="min-w-32"
      />
      <UInput v-model="value" placeholder="value..." size="sm" class="w-32" />
      <span class="text-gray-400">, then</span>
      <USelectMenu
        v-model="actionType"
        :items="actionOptions"
        value-key="value"
        size="sm"
        class="min-w-44"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Condition {
  type: "condition";
  field: string;
  operator: string;
  value: string | number | boolean | string[];
  flags?: string[];
}

interface ConditionGroup {
  operator: "AND" | "OR";
  conditions: (Condition | ConditionGroup)[];
}

interface ActionForm {
  type: string;
  params: Record<string, any>;
}

const props = defineProps<{
  triggerGroups: { label: string; items: { label: string; value: string }[] }[];
  actionOptions: { label: string; value: string }[];
}>();

const emit = defineEmits<{
  (
    e: "promote",
    payload: { trigger: string; conditions: ConditionGroup; actions: ActionForm[] },
  ): void;
}>();

const flatTriggerItems = computed(() => props.triggerGroups.flatMap((g) => g.items));

const trigger = ref("message_create");
const field = ref("message.content");
const operator = ref("contains");
const value = ref("");
const actionType = ref("delete_message");

const quickFieldOptions = [
  { label: "Message Content", value: "message.content" },
  { label: "Username", value: "user.username" },
  { label: "Channel Name", value: "channel.name" },
];

const quickOperatorOptions = [
  { label: "contains", value: "contains" },
  { label: "equals", value: "equals" },
  { label: "matches regex", value: "matches_regex" },
];

const buildConditions = (): ConditionGroup => ({
  operator: "AND",
  conditions: [
    {
      type: "condition",
      field: field.value,
      operator: operator.value,
      value: value.value,
      flags: ["case_insensitive"],
    },
  ],
});

const buildActions = (): ActionForm[] => [{ type: actionType.value, params: {} }];

const promote = () => {
  emit("promote", {
    trigger: trigger.value,
    conditions: buildConditions(),
    actions: buildActions(),
  });
};

// Auto-promote is triggered by the parent watching this component's exposed
// state indirectly — simplest correct approach is exposing `promote` itself
// so the parent's "add 2nd condition/action" affordance isn't needed here at
// all: Quick-Create only ever holds one condition and one action by design
// (see quickFieldOptions/quickOperatorOptions above, no "+ Condition" button
// exists in this template). The only way to get a 2nd item is the explicit
// "Open full editor" link, which always promotes first.
defineExpose({ promote });
</script>
