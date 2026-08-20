<template>
  <div
    class="relative overflow-hidden rounded-xl border border-orange-500/20 bg-orange-500/[0.03] p-4 space-y-3"
  >
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-2">
        <div
          class="p-1 rounded-md bg-orange-500/10 border border-orange-500/20"
        >
          <UIcon name="i-heroicons-play" class="text-orange-400 text-sm" />
        </div>
        <span
          class="text-xs font-semibold text-orange-300 uppercase tracking-wider"
          >Actions</span
        >
        <span class="text-xs text-gray-600 ml-1">— …THEN do this</span>
      </div>
      <UButton
        variant="soft"
        color="primary"
        size="xs"
        icon="i-heroicons-plus"
        @click="addAction()"
      >
        Add Action
      </UButton>
    </div>

    <div class="space-y-2">
      <div
        v-for="(action, idx) in modelValue"
        :key="idx"
        class="relative overflow-hidden rounded-lg border p-3 space-y-3 transition-colors"
        :class="
          dragOverIdx === idx
            ? 'border-orange-400/60 bg-orange-500/[0.06]'
            : 'border-white/10 bg-white/[0.03]'
        "
        @dragover.prevent="dragOverIdx = idx"
        @dragleave="dragOverIdx = null"
        @drop.prevent="onDrop(idx)"
      >
        <!-- Action type row -->
        <div class="flex items-center gap-2">
          <div
            class="w-1 self-stretch rounded-full flex-shrink-0"
            :class="actionAccentBar(action.type)"
          />
          <span
            class="cursor-grab active:cursor-grabbing text-gray-500 select-none"
            title="Drag to reorder"
            draggable="true"
            @dragstart="onDragStart($event, idx)"
            @dragend="onDragEnd"
          >
            ⠿
          </span>
          <span
            class="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0"
          >
            {{ idx + 1 }}
          </span>
          <div class="flex-1">
            <USelectMenu
              :model-value="action.type"
              :items="actionOptions"
              value-key="value"
              size="md"
              @update:model-value="updateActionField(idx, 'type', $event)"
            />
          </div>
          <UButton
            variant="ghost"
            color="error"
            size="sm"
            icon="i-heroicons-x-mark"
            @click="removeAction(idx)"
          />
        </div>
        <!-- Action params -->
        <div class="pl-3 space-y-3">
          <!-- ── DM User: multiline message ── -->
          <template v-if="action.type === 'dm_user'">
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Message to send the user</label
              >
              <UTextarea
                v-model="action.params.message"
                placeholder="You have been warned for violating server rules..."
                :rows="3"
                autoresize
                size="md"
              />
              <p class="text-[10px] text-gray-600">
                Use
                <code class="bg-white/5 px-1 rounded">{user}</code>
                and
                <code class="bg-white/5 px-1 rounded">{channel}</code>
                as placeholders.
              </p>
            </div>
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Image URL <span class="text-gray-600">(optional)</span></label
              >
              <UInput
                v-model="action.params.image_url"
                placeholder="https://example.com/image.png"
                size="md"
              />
              <img
                v-if="action.params.image_url"
                :src="action.params.image_url"
                class="h-16 rounded-lg border border-white/10 object-cover"
                alt="Preview"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
                @load="($event.target as HTMLImageElement).style.display = ''"
              />
            </div>
          </template>

          <!-- ── Timeout User: number + unit picker ── -->
          <template v-if="action.type === 'timeout_user'">
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400">
                Timeout duration
                <span
                  v-if="
                    action.params._durationAmt &&
                    action.params._durationUnit
                  "
                  class="text-orange-300 ml-1"
                >
                  → {{ action.params._durationAmt
                  }}{{ action.params._durationUnit }}
                </span>
              </label>
              <div class="flex gap-2">
                <UInput
                  v-model.number="action.params._durationAmt"
                  type="number"
                  :min="1"
                  :max="
                    action.params._durationUnit === 'm'
                      ? 40320
                      : action.params._durationUnit === 'h'
                        ? 672
                        : 28
                  "
                  placeholder="Amount"
                  size="md"
                  class="flex-1"
                  @update:model-value="syncDuration(action)"
                />
                <USelectMenu
                  v-model="action.params._durationUnit"
                  :items="durationUnitOptions"
                  value-key="value"
                  size="md"
                  class="w-36"
                  @update:model-value="syncDuration(action)"
                />
              </div>
              <p class="text-[10px] text-gray-600">
                Max: 28 days. Discord enforces a 28-day ceiling on
                timeouts.
              </p>
            </div>
          </template>

          <!-- ── Kick User: optional reason ── -->
          <template v-if="action.type === 'kick_user'">
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Reason
                <span class="text-gray-600"
                  >(optional, shown in audit log)</span
                ></label
              >
              <UTextarea
                v-model="action.params.reason"
                placeholder="Violated server automod rule..."
                :rows="2"
                autoresize
                size="md"
              />
            </div>
          </template>

          <!-- ── Ban User: optional reason + delete days ── -->
          <template v-if="action.type === 'ban_user'">
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Reason
                <span class="text-gray-600"
                  >(optional, shown in audit log)</span
                ></label
              >
              <UTextarea
                v-model="action.params.reason"
                placeholder="Violated server automod rule..."
                :rows="2"
                autoresize
                size="md"
              />
            </div>
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400">
                Delete message history
                <span class="text-orange-300 ml-1"
                  >{{ action.params.delete_days ?? 0 }} day{{
                    (action.params.delete_days ?? 0) !== 1 ? "s" : ""
                  }}</span
                >
              </label>
              <USlider
                v-model="action.params.delete_days"
                :min="0"
                :max="7"
                :step="1"
              />
              <p class="text-[10px] text-gray-600">
                How many days of their message history to erase on ban
                (0–7).
              </p>
            </div>
          </template>

          <!-- ── Send Channel Message: channel selector + big textarea ── -->
          <template v-if="action.type === 'send_channel_message'">
            <div v-if="channelOptions.length > 0" class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Post to channel</label
              >
              <USelectMenu
                v-model="action.params.channel_id"
                :items="channelOptions"
                value-key="value"
                placeholder="Select a channel..."
                searchable
                icon="i-heroicons-hashtag"
                size="md"
              />
            </div>
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Message to post</label
              >
              <UTextarea
                v-model="action.params.message"
                placeholder="⚠️ A message was flagged by AutoMod in this channel..."
                :rows="4"
                autoresize
                size="md"
              />
              <p class="text-[10px] text-gray-600">
                Supports basic Discord markdown. Use
                <code class="bg-white/5 px-1 rounded">{user}</code>
                and
                <code class="bg-white/5 px-1 rounded">{channel}</code>
                as placeholders.
              </p>
            </div>
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Image URL <span class="text-gray-600">(optional)</span></label
              >
              <UInput
                v-model="action.params.image_url"
                placeholder="https://example.com/image.png"
                size="md"
              />
              <img
                v-if="action.params.image_url"
                :src="action.params.image_url"
                class="h-16 rounded-lg border border-white/10 object-cover"
                alt="Preview"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
                @load="($event.target as HTMLImageElement).style.display = ''"
              />
            </div>
          </template>

          <!-- ── Reply to Message: reply text + optional image ── -->
          <template v-if="action.type === 'reply_to_message'">
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Reply text</label
              >
              <UTextarea
                v-model="action.params.message"
                placeholder="⚠️ This message was flagged by AutoMod."
                :rows="3"
                autoresize
                size="md"
              />
              <p class="text-[10px] text-gray-600">
                Use
                <code class="bg-white/5 px-1 rounded">{user}</code>
                and
                <code class="bg-white/5 px-1 rounded">{channel}</code>
                as placeholders.
              </p>
            </div>
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Image URL <span class="text-gray-600">(optional)</span></label
              >
              <UInput
                v-model="action.params.image_url"
                placeholder="https://example.com/image.png"
                size="md"
              />
              <img
                v-if="action.params.image_url"
                :src="action.params.image_url"
                class="h-16 rounded-lg border border-white/10 object-cover"
                alt="Preview"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
                @load="($event.target as HTMLImageElement).style.display = ''"
              />
            </div>
          </template>

          <!-- ── Add Reaction: emoji input ── -->
          <template v-if="action.type === 'add_reaction'">
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400"
                >Emoji</label
              >
              <UInput
                v-model="action.params.emoji"
                placeholder="⚠️ or a custom emoji ID like :name:1234567890"
                size="md"
              />
              <p class="text-[10px] text-gray-600">
                A unicode emoji, or a custom emoji in
                <code class="bg-white/5 px-1 rounded"
                  >name:id</code
                >
                format.
              </p>
            </div>
          </template>

          <!-- ── Add / Remove Role: searchable full-width selector ── -->
          <template
            v-if="
              action.type === 'add_role' ||
              action.type === 'remove_role'
            "
          >
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-gray-400">
                {{
                  action.type === "add_role"
                    ? "Role to assign"
                    : "Role to remove"
                }}
              </label>
              <USelectMenu
                v-model="action.params.role_id"
                :items="roleOptions"
                value-key="value"
                :placeholder="
                  action.type === 'add_role'
                    ? 'Search and select a role...'
                    : 'Search and select a role to remove...'
                "
                searchable
                size="md"
              />
              <p class="text-[10px] text-gray-600">
                Bot role must be <em>above</em> the target role in the
                server's role hierarchy.
              </p>
            </div>
          </template>

          <!-- ── Delay: generic to every action type ── -->
          <div class="space-y-1">
            <label class="text-[11px] font-medium text-gray-400"
              >Delay before running
              <span class="text-gray-600">(optional, seconds)</span></label
            >
            <UInput
              :model-value="action.delaySeconds"
              type="number"
              :min="0"
              placeholder="0"
              size="md"
              @update:model-value="
                updateActionField(idx, 'delaySeconds', Number($event))
              "
            />
          </div>
        </div>
      </div>

      <div
        v-if="modelValue.length === 0"
        class="flex items-center justify-center gap-2 py-6 text-gray-600 border border-dashed border-white/8 rounded-lg"
      >
        <UIcon name="i-heroicons-play-circle" class="text-lg" />
        <span class="text-xs"
          >No actions yet — click <strong>+ Add Action</strong> above</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ActionForm {
  type: string;
  params: Record<string, any>;
  delaySeconds?: number;
}

const props = defineProps<{
  modelValue: ActionForm[];
  actionOptions: { label: string; value: string }[];
  channelOptions: { label: string; value: string }[];
  roleOptions: { label: string; value: string }[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: ActionForm[]): void;
}>();

// ── Mutations ──
const addAction = () => {
  emit("update:modelValue", [
    ...props.modelValue,
    { type: "delete_message", params: {} },
  ]);
};

const removeAction = (idx: number) => {
  const next = [...props.modelValue];
  next.splice(idx, 1);
  emit("update:modelValue", next);
};

const updateActionField = (idx: number, field: string, value: any) => {
  const next = [...props.modelValue];
  next[idx] = { ...next[idx], [field]: value } as ActionForm;
  emit("update:modelValue", next);
};

// ── Drag-and-drop reorder (native HTML5 DnD, no library) ──
const dragIdx = ref<number | null>(null);
const dragOverIdx = ref<number | null>(null);

const onDragStart = (event: DragEvent, idx: number) => {
  dragIdx.value = idx;
  event.dataTransfer?.setData("text/plain", String(idx));
};

const onDragEnd = () => {
  dragIdx.value = null;
  dragOverIdx.value = null;
};

const onDrop = (idx: number) => {
  dragOverIdx.value = null;
  if (dragIdx.value === null || dragIdx.value === idx) return;
  const next = [...props.modelValue];
  const [moved] = next.splice(dragIdx.value, 1);
  next.splice(idx, 0, moved as ActionForm);
  emit("update:modelValue", next);
  dragIdx.value = null;
};

// ── Duration unit selector for timeout action (moved from automod.vue) ──
const durationUnitOptions = [
  { label: "Minutes", value: "m" },
  { label: "Hours", value: "h" },
  { label: "Days", value: "d" },
];

const syncDuration = (action: ActionForm) => {
  const amt = action.params._durationAmt;
  const unit = action.params._durationUnit ?? "m";
  if (amt && amt > 0) {
    action.params.duration = `${amt}${unit}`;
  } else {
    action.params.duration = "";
  }
};

const actionAccentBar = (type: string) => {
  const map: Record<string, string> = {
    delete_message: "bg-red-500",
    warn_user: "bg-amber-500",
    timeout_user: "bg-blue-500",
    kick_user: "bg-orange-500",
    ban_user: "bg-red-600",
    dm_user: "bg-sky-500",
    send_channel_message: "bg-indigo-500",
    reply_to_message: "bg-teal-500",
    add_reaction: "bg-yellow-500",
    add_role: "bg-emerald-500",
    remove_role: "bg-gray-500",
    log_to_modlog: "bg-purple-500",
  };
  return map[type] ?? "bg-white/20";
};
</script>
