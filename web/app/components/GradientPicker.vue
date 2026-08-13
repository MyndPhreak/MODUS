<template>
  <div class="w-64 space-y-3 p-3">
    <div v-if="allowGradient !== false" class="flex gap-1 rounded-lg bg-white/5 p-1">
      <button
        type="button"
        class="flex-1 rounded-md py-1 text-xs font-medium transition-colors"
        :class="
          tab === 'solid'
            ? 'bg-violet-600/30 text-violet-300'
            : 'text-zinc-400 hover:text-zinc-200'
        "
        @click="tab = 'solid'"
      >
        Solid
      </button>
      <button
        type="button"
        class="flex-1 rounded-md py-1 text-xs font-medium transition-colors"
        :class="
          tab === 'gradient'
            ? 'bg-violet-600/30 text-violet-300'
            : 'text-zinc-400 hover:text-zinc-200'
        "
        @click="tab = 'gradient'"
      >
        Gradient
      </button>
    </div>

    <template v-if="tab === 'solid' || allowGradient === false">
      <UColorPicker v-model="solidColor" size="sm" />
      <UInput v-model="solidColor" size="xs" class="w-full font-mono" />
    </template>

    <template v-else-if="tab === 'gradient'">
      <div class="flex gap-1 rounded-lg bg-white/5 p-1">
        <button
          type="button"
          class="flex-1 rounded-md py-1 text-xs font-medium transition-colors"
          :class="
            gradType === 'linear'
              ? 'bg-violet-600/30 text-violet-300'
              : 'text-zinc-400 hover:text-zinc-200'
          "
          @click="gradType = 'linear'"
        >
          Linear
        </button>
        <button
          v-if="allowRadial !== false"
          type="button"
          class="flex-1 rounded-md py-1 text-xs font-medium transition-colors"
          :class="
            gradType === 'radial'
              ? 'bg-violet-600/30 text-violet-300'
              : 'text-zinc-400 hover:text-zinc-200'
          "
          @click="gradType = 'radial'"
        >
          Radial
        </button>
      </div>

      <div v-if="gradType === 'linear'">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-[11px] font-semibold text-zinc-400">Angle</span>
          <span class="text-[11px] text-zinc-500">{{ angle }}°</span>
        </div>
        <input
          v-model.number="angle"
          type="range"
          min="0"
          max="360"
          class="w-full"
        />
      </div>

      <div class="space-y-1.5">
        <div
          v-for="(stop, i) in stops"
          :key="i"
          class="flex items-center gap-1.5"
        >
          <input
            type="color"
            :value="stop"
            class="h-7 w-7 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0"
            @input="(e: any) => setStop(i, e.target.value)"
          />
          <input
            :value="stop"
            class="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-200"
            @input="(e: any) => setStop(i, e.target.value)"
          />
          <button
            v-if="stops.length > 2"
            type="button"
            class="shrink-0 rounded-md p-1 text-red-400 hover:bg-red-500/10"
            @click="removeStop(i)"
          >
            <UIcon name="i-heroicons-x-mark" class="text-xs" />
          </button>
        </div>
        <button
          type="button"
          class="w-full rounded-md border border-dashed border-white/15 py-1.5 text-xs text-zinc-400 hover:border-white/30 hover:text-zinc-200"
          @click="addStop"
        >
          + Add color
        </button>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="sw in gradientSwatches"
          :key="sw"
          type="button"
          class="h-7 w-7 rounded-md ring-1 ring-white/10 transition-transform hover:scale-110"
          :style="{ background: sw }"
          @click="applySwatch(sw)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  modelValue?: string;
  allowRadial?: boolean;
  allowGradient?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const gradientSwatches = [
  "linear-gradient(135deg, #667eea, #764ba2)",
  "linear-gradient(135deg, #f093fb, #f5576c)",
  "linear-gradient(135deg, #4facfe, #00f2fe)",
  "linear-gradient(135deg, #f12711, #f5af19)",
  "linear-gradient(90deg, #00ff88, #00ccff, #ff00ff)",
  "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
  "radial-gradient(#ffd200, #f7971e)",
  "radial-gradient(#a78bfa, #4f46e5)",
];

const initialType = gradientType(props.modelValue);
const tab = ref<"solid" | "gradient">(
  initialType && props.allowGradient !== false ? "gradient" : "solid",
);
const solidColor = ref(
  initialType ? "#ffffff" : props.modelValue || "#ffffff",
);
const gradType = ref<"linear" | "radial">(
  initialType === "radial" && props.allowRadial === false
    ? "linear"
    : initialType || "linear",
);
const angle = ref(
  initialType === "linear" ? parseGradientAngle(props.modelValue!) : 135,
);
const stops = ref<string[]>(
  initialType
    ? parseGradientColors(props.modelValue!)
    : ["#667eea", "#764ba2"],
);

function emitCurrent() {
  if (tab.value === "solid") {
    emit("update:modelValue", solidColor.value);
  } else {
    emit(
      "update:modelValue",
      buildGradientString(gradType.value, angle.value, stops.value),
    );
  }
}

function setStop(i: number, color: string) {
  stops.value[i] = color;
  emitCurrent();
}

function addStop() {
  stops.value.push("#ffffff");
  emitCurrent();
}

function removeStop(i: number) {
  if (stops.value.length <= 2) return;
  stops.value.splice(i, 1);
  emitCurrent();
}

function applySwatch(sw: string) {
  const type = gradientType(sw)!;
  gradType.value = type;
  if (type === "linear") angle.value = parseGradientAngle(sw);
  stops.value = parseGradientColors(sw);
  emitCurrent();
}

watch(tab, emitCurrent);
watch(solidColor, () => {
  if (tab.value === "solid") emitCurrent();
});
watch(gradType, () => {
  if (tab.value === "gradient") emitCurrent();
});
watch(angle, () => {
  if (tab.value === "gradient") emitCurrent();
});
</script>
