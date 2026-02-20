<template>
  <div class="rounded-xl border p-4 space-y-3" :class="containerClass">
    <!-- Group Header -->
    <div class="flex items-center gap-2 flex-wrap">
      <!-- Depth indicator dot -->
      <div
        v-if="depth > 0"
        class="w-1.5 h-1.5 rounded-full flex-shrink-0"
        :class="dotClass"
      />
      <!-- AND / OR toggle -->
      <div
        class="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5"
      >
        <button
          class="px-3 py-1 text-xs font-bold rounded-md transition-all"
          :class="
            modelValue.operator === 'AND'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-gray-500 hover:text-gray-300'
          "
          @click="setOperator('AND')"
        >
          ALL (AND)
        </button>
        <button
          class="px-3 py-1 text-xs font-bold rounded-md transition-all"
          :class="
            modelValue.operator === 'OR'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-gray-500 hover:text-gray-300'
          "
          @click="setOperator('OR')"
        >
          ANY (OR)
        </button>
      </div>
      <span class="text-xs text-gray-500">
        {{
          modelValue.operator === "AND"
            ? "— every condition below must be true"
            : "— at least one condition must be true"
        }}
      </span>
      <div class="flex-1" />
      <UButton
        variant="soft"
        color="primary"
        size="xs"
        icon="i-heroicons-plus"
        @click="addCondition()"
      >
        Condition
      </UButton>
      <UButton
        v-if="depth < 3"
        variant="soft"
        color="warning"
        size="xs"
        icon="i-heroicons-folder-plus"
        @click="addGroup()"
      >
        Sub-group
      </UButton>
      <UButton
        v-if="depth > 0"
        variant="ghost"
        color="error"
        size="xs"
        icon="i-heroicons-x-mark"
        @click="$emit('remove')"
      />
    </div>

    <!-- Column headers (only when there are plain conditions) -->
    <div
      v-if="hasPlainConditions"
      class="grid gap-2 px-1"
      style="grid-template-columns: 1fr 1fr 1fr auto auto"
    >
      <span
        class="text-[10px] font-semibold uppercase tracking-wider text-gray-600"
        >Field</span
      >
      <span
        class="text-[10px] font-semibold uppercase tracking-wider text-gray-600"
        >Operator</span
      >
      <span
        class="text-[10px] font-semibold uppercase tracking-wider text-gray-600"
        >Value</span
      >
      <span
        class="text-[10px] font-semibold uppercase tracking-wider text-gray-600 text-center"
        >Aa</span
      >
      <span />
    </div>

    <!-- Conditions list -->
    <div class="space-y-2">
      <template v-for="(node, idx) in modelValue.conditions" :key="idx">
        <!-- AND / OR separator badge -->
        <div v-if="idx > 0" class="flex items-center gap-2">
          <div class="flex-1 border-t border-white/5" />
          <span
            class="text-[9px] font-bold px-2 py-0.5 rounded-full"
            :class="
              modelValue.operator === 'AND'
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            "
          >
            {{ modelValue.operator }}
          </span>
          <div class="flex-1 border-t border-white/5" />
        </div>

        <!-- Nested Group -->
        <ConditionGroupEditor
          v-if="isGroup(node)"
          :model-value="node as ConditionGroup"
          :depth="depth + 1"
          @update:model-value="updateNode(idx, $event)"
          @remove="removeNode(idx)"
        />

        <!-- Single Condition Row -->
        <div
          v-else
          class="grid gap-2 items-center p-3 rounded-lg bg-white/[0.04] border border-white/8 hover:border-white/15 transition-colors"
          style="grid-template-columns: 1fr 1fr 1fr auto auto"
        >
          <!-- Field -->
          <USelectMenu
            :model-value="(node as Condition).field"
            :items="fieldOptions"
            value-key="value"
            size="sm"
            @update:model-value="updateConditionField(idx, 'field', $event)"
          />
          <!-- Operator -->
          <USelectMenu
            :model-value="(node as Condition).operator"
            :items="operatorOptions"
            value-key="value"
            size="sm"
            @update:model-value="updateConditionField(idx, 'operator', $event)"
          />
          <!-- Value -->
          <UInput
            :model-value="String((node as Condition).value ?? '')"
            placeholder="Value..."
            size="sm"
            @update:model-value="updateConditionField(idx, 'value', $event)"
          />
          <!-- Case Insensitive toggle -->
          <UTooltip text="Case insensitive match">
            <UButton
              variant="ghost"
              size="sm"
              :color="
                hasFlag(node as Condition, 'case_insensitive')
                  ? 'primary'
                  : 'neutral'
              "
              class="font-mono font-bold"
              @click="toggleFlag(idx, 'case_insensitive')"
            >
              Aa
            </UButton>
          </UTooltip>
          <!-- Remove -->
          <UButton
            variant="ghost"
            color="error"
            size="sm"
            icon="i-heroicons-x-mark"
            @click="removeNode(idx)"
          />
        </div>
      </template>

      <div
        v-if="modelValue.conditions.length === 0"
        class="flex items-center justify-center gap-2 py-6 text-gray-600 border border-dashed border-white/8 rounded-lg"
      >
        <UIcon name="i-heroicons-plus-circle" class="text-lg" />
        <span class="text-xs"
          >No conditions yet — click <strong>+ Condition</strong> above</span
        >
      </div>
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
  negate?: boolean;
}

interface ConditionGroup {
  operator: "AND" | "OR";
  conditions: (Condition | ConditionGroup)[];
  negate?: boolean;
}

const props = defineProps<{
  modelValue: ConditionGroup;
  depth: number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: ConditionGroup): void;
  (e: "remove"): void;
}>();

// ── Visual theming based on nesting depth ──
const containerClass = computed(() => {
  if (props.depth === 0) return "border-white/10 bg-white/[0.02]";
  if (props.depth === 1) return "border-blue-500/25 bg-blue-500/[0.04]";
  if (props.depth === 2) return "border-amber-500/25 bg-amber-500/[0.04]";
  return "border-purple-500/25 bg-purple-500/[0.04]";
});

const dotClass = computed(() => {
  if (props.depth === 1) return "bg-blue-400";
  if (props.depth === 2) return "bg-amber-400";
  return "bg-purple-400";
});

// Show column headers only when at least one plain condition exists
const hasPlainConditions = computed(() =>
  props.modelValue.conditions.some((n) => !isGroup(n)),
);

// ── Field and Operator Options ──
const fieldOptions = [
  // Message
  { label: "Message Content", value: "message.content" },
  { label: "Message Content (lowercase)", value: "message.content_lower" },
  { label: "Message Length", value: "message.length" },
  { label: "Word Count", value: "message.word_count" },
  { label: "Mentions Count", value: "message.mentions_count" },
  { label: "Emoji Count", value: "message.emoji_count" },
  { label: "Links Count", value: "message.links_count" },
  { label: "Attachments Count", value: "message.attachments_count" },
  { label: "Has Embed", value: "message.has_embed" },
  { label: "Is ALL CAPS", value: "message.is_all_caps" },
  { label: "Caps Ratio (0–1)", value: "message.caps_ratio" },
  { label: "Sticker Count", value: "message.sticker_count" },
  // User
  { label: "User ID", value: "user.id" },
  { label: "Username", value: "user.username" },
  { label: "Nickname", value: "user.nickname" },
  { label: "Account Age (days)", value: "user.account_age_days" },
  { label: "Server Age (days)", value: "user.join_age_days" },
  { label: "Is Bot", value: "user.is_bot" },
  // Channel
  { label: "Channel ID", value: "channel.id" },
  { label: "Channel Name", value: "channel.name" },
  { label: "Is NSFW", value: "channel.is_nsfw" },
];

const operatorOptions = [
  { label: "equals", value: "equals" },
  { label: "not equals", value: "not_equals" },
  { label: "contains", value: "contains" },
  { label: "not contains", value: "not_contains" },
  { label: "starts with", value: "starts_with" },
  { label: "ends with", value: "ends_with" },
  { label: "matches regex", value: "matches_regex" },
  { label: "> (greater)", value: "greater_than" },
  { label: "< (less)", value: "less_than" },
  { label: "in word list", value: "in_list" },
  { label: "not in word list", value: "not_in_list" },
  { label: "has role", value: "has_role" },
  { label: "doesn't have role", value: "not_has_role" },
];

// ── Helpers ──
const isGroup = (node: Condition | ConditionGroup): node is ConditionGroup => {
  return "operator" in node && !("type" in node && node.type === "condition");
};

const hasFlag = (cond: Condition, flag: string): boolean => {
  return cond.flags?.includes(flag) ?? false;
};

// ── Mutations ──
const emitUpdate = (conditions: (Condition | ConditionGroup)[]) => {
  emit("update:modelValue", {
    ...props.modelValue,
    conditions,
  });
};

const setOperator = (op: "AND" | "OR") => {
  emit("update:modelValue", {
    ...props.modelValue,
    operator: op,
  });
};

const addCondition = () => {
  const newCond: Condition = {
    type: "condition",
    field: "message.content",
    operator: "contains",
    value: "",
    flags: ["case_insensitive"],
  };
  emitUpdate([...props.modelValue.conditions, newCond]);
};

const addGroup = () => {
  const newGroup: ConditionGroup = {
    operator: "OR",
    conditions: [
      {
        type: "condition",
        field: "message.content",
        operator: "contains",
        value: "",
        flags: ["case_insensitive"],
      },
    ],
  };
  emitUpdate([...props.modelValue.conditions, newGroup]);
};

const removeNode = (idx: number) => {
  const updated = [...props.modelValue.conditions];
  updated.splice(idx, 1);
  emitUpdate(updated);
};

const updateNode = (idx: number, value: ConditionGroup) => {
  const updated = [...props.modelValue.conditions];
  updated[idx] = value;
  emitUpdate(updated);
};

const updateConditionField = (
  idx: number,
  key: keyof Condition,
  value: any,
) => {
  const updated = [...props.modelValue.conditions];
  const cond = { ...(updated[idx] as Condition) };
  (cond as any)[key] = value;
  updated[idx] = cond;
  emitUpdate(updated);
};

const toggleFlag = (idx: number, flag: string) => {
  const updated = [...props.modelValue.conditions];
  const cond = { ...(updated[idx] as Condition) };
  const flags = [...(cond.flags ?? [])];
  const flagIdx = flags.indexOf(flag);
  if (flagIdx >= 0) {
    flags.splice(flagIdx, 1);
  } else {
    flags.push(flag);
  }
  cond.flags = flags;
  updated[idx] = cond;
  emitUpdate(updated);
};
</script>
