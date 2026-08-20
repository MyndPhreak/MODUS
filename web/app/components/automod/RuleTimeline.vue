<template>
  <div class="relative pl-2">
    <div class="absolute left-[15px] top-8 bottom-8 w-px bg-white/10" />

    <div class="space-y-4">
      <!-- Trigger node -->
      <div class="relative flex items-start gap-3">
        <button
          type="button"
          class="w-8 h-8 rounded-full bg-orange-500/15 border-2 border-orange-500/40 flex items-center justify-center shrink-0 z-10"
          @click="triggerCollapsed = !triggerCollapsed"
        >
          <UIcon name="i-heroicons-bolt" class="text-orange-400 text-sm" />
        </button>
        <div class="flex-1 pt-1">
          <button
            type="button"
            class="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
            @click="triggerCollapsed = !triggerCollapsed"
          >
            <UIcon
              :name="
                triggerCollapsed
                  ? 'i-heroicons-chevron-right'
                  : 'i-heroicons-chevron-down'
              "
              class="text-[10px]"
            />
            {{ triggerCollapsed ? triggerLabel(trigger) : "Trigger" }}
          </button>
          <TriggerNode
            v-if="!triggerCollapsed"
            :model-value="trigger"
            :groups="triggerGroups"
            class="mt-2"
            @update:model-value="$emit('update:trigger', $event)"
          />
        </div>
      </div>

      <!-- Conditions node -->
      <div class="relative flex items-start gap-3">
        <button
          type="button"
          class="w-8 h-8 rounded-full bg-blue-500/15 border-2 border-blue-500/40 flex items-center justify-center shrink-0 z-10"
          @click="conditionsCollapsed = !conditionsCollapsed"
        >
          <UIcon name="i-heroicons-funnel" class="text-blue-400 text-sm" />
        </button>
        <div class="flex-1 pt-1">
          <button
            type="button"
            class="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
            @click="conditionsCollapsed = !conditionsCollapsed"
          >
            <UIcon
              :name="
                conditionsCollapsed
                  ? 'i-heroicons-chevron-right'
                  : 'i-heroicons-chevron-down'
              "
              class="text-[10px]"
            />
            {{ conditionCount }} condition{{ conditionCount !== 1 ? "s" : "" }}
          </button>
          <ConditionGroupEditor
            v-if="!conditionsCollapsed"
            :model-value="conditions"
            :depth="0"
            class="mt-2"
            @update:model-value="$emit('update:conditions', $event)"
          />
        </div>
      </div>

      <!-- Actions node -->
      <div class="relative flex items-start gap-3">
        <button
          type="button"
          class="w-8 h-8 rounded-full bg-orange-500/15 border-2 border-orange-500/40 flex items-center justify-center shrink-0 z-10"
          @click="actionsCollapsed = !actionsCollapsed"
        >
          <UIcon name="i-heroicons-play" class="text-orange-400 text-sm" />
        </button>
        <div class="flex-1 pt-1">
          <button
            type="button"
            class="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
            @click="actionsCollapsed = !actionsCollapsed"
          >
            <UIcon
              :name="
                actionsCollapsed
                  ? 'i-heroicons-chevron-right'
                  : 'i-heroicons-chevron-down'
              "
              class="text-[10px]"
            />
            {{ actions.length }} action{{ actions.length !== 1 ? "s" : "" }}
          </button>
          <ActionsNode
            v-if="!actionsCollapsed"
            :model-value="actions"
            :action-options="actionOptions"
            :channel-options="channelOptions"
            :role-options="roleOptions"
            class="mt-2"
            @update:model-value="$emit('update:actions', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import TriggerNode from "~/components/automod/TriggerNode.vue";
import ActionsNode from "~/components/automod/ActionsNode.vue";
import ConditionGroupEditor from "~/components/automod/ConditionGroupEditor.vue";

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

interface ActionForm {
  type: string;
  params: Record<string, any>;
  delaySeconds?: number;
}

const props = defineProps<{
  trigger: string;
  triggerGroups: { label: string; items: { label: string; value: string }[] }[];
  conditions: ConditionGroup;
  actions: ActionForm[];
  actionOptions: { label: string; value: string }[];
  channelOptions: { label: string; value: string }[];
  roleOptions: { label: string; value: string }[];
  triggerLabel: (trigger: string) => string;
}>();

defineEmits<{
  (e: "update:trigger", value: string): void;
  (e: "update:conditions", value: ConditionGroup): void;
  (e: "update:actions", value: ActionForm[]): void;
}>();

const triggerCollapsed = ref(false);
const conditionsCollapsed = ref(false);
const actionsCollapsed = ref(false);

const countGroupConditions = (group: ConditionGroup): number =>
  group.conditions.reduce(
    (acc, c) => acc + ("type" in c && c.type === "condition" ? 1 : countGroupConditions(c as ConditionGroup)),
    0,
  );

const conditionCount = computed(() => countGroupConditions(props.conditions));
</script>
