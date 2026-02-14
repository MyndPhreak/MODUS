<template>
  <div class="we font-sans flex flex-col h-full select-none">
    <!-- TOP TOOLBAR -->
    <div class="we-toolbar">
      <div class="we-toolbar-group">
        <USelectMenu
          v-if="!channelsLoading"
          v-model="template.channelId"
          :items="channelOptions"
          placeholder="Channel..."
          icon="i-heroicons-hashtag"
          size="xs"
          class="w-44"
        />
        <span v-else class="text-[11px] text-zinc-500 flex items-center gap-1">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin" /> Loading…
        </span>
      </div>

      <div class="we-toolbar-sep" />

      <div class="we-toolbar-group">
        <span class="we-label">W</span>
        <input
          v-model.number="template.canvasWidth"
          type="number"
          class="we-num-input w-16"
          min="200"
          max="1920"
        />
        <span class="we-label">H</span>
        <input
          v-model.number="template.canvasHeight"
          type="number"
          class="we-num-input w-16"
          min="100"
          max="1080"
        />
      </div>

      <div class="we-toolbar-sep" />

      <div class="we-toolbar-group">
        <span class="we-label">BG</span>
        <div
          class="we-color-chip"
          :style="{ background: template.backgroundColor }"
          @click="($refs.bgColor as HTMLInputElement).click()"
        />
        <input
          ref="bgColor"
          type="color"
          v-model="template.backgroundColor"
          class="sr-only"
        />
        <input v-model="template.backgroundColor" class="we-hex-input w-20" />
      </div>

      <div class="flex-1" />

      <div class="we-toolbar-group">
        <button class="we-tool-btn" title="Reset" @click="resetTemplate">
          <UIcon name="i-heroicons-arrow-uturn-left" />
        </button>
        <button class="we-btn-primary" :disabled="saving" @click="saveTemplate">
          <UIcon
            v-if="saving"
            name="i-heroicons-arrow-path"
            class="animate-spin"
          />
          <UIcon v-else name="i-heroicons-cloud-arrow-up" />
          Save
        </button>
      </div>
    </div>

    <!-- MAIN EDITOR AREA -->
    <div class="flex-1 flex min-h-0 gap-px bg-zinc-950">
      <!-- LEFT PANEL: Tools + Layers -->
      <div
        class="w-[240px] shrink-0 flex flex-col bg-[#1e1e1e] border-r border-zinc-800"
      >
        <!-- Add Element Tools -->
        <div class="p-2 border-b border-zinc-800">
          <p class="we-panel-label mb-2">Tools</p>
          <div class="grid grid-cols-4 gap-1">
            <button
              v-for="t in toolTypes"
              :key="t.type"
              class="we-tool-square"
              :title="t.label"
              @click="addElement(t.type)"
            >
              <UIcon :name="t.icon" class="text-base" :class="t.color" />
            </button>
          </div>
        </div>

        <!-- Layers -->
        <div class="flex-1 flex flex-col min-h-0">
          <div
            class="flex items-center justify-between p-2 border-b border-zinc-800"
          >
            <p class="we-panel-label">Layers</p>
            <span class="text-[10px] text-zinc-500 tabular-nums">{{
              template.elements.length
            }}</span>
          </div>
          <div class="flex-1 overflow-y-auto p-1 space-y-px">
            <div
              v-if="template.elements.length === 0"
              class="text-center py-8 text-zinc-600 text-[11px]"
            >
              No layers
            </div>
            <button
              v-for="(el, index) in reversedElements"
              :key="el.id"
              class="we-layer"
              :class="{ 'we-layer-active': selectedElementId === el.id }"
              @click="selectedElementId = el.id"
            >
              <UIcon
                :name="elementTypeIcon(el.type)"
                class="text-sm shrink-0"
              />
              <span class="truncate flex-1 text-left">
                {{
                  el.type === "text"
                    ? (el.text || "Text").substring(0, 16)
                    : el.type.charAt(0).toUpperCase() + el.type.slice(1)
                }}
              </span>
              <span class="text-[9px] text-zinc-600 tabular-nums">{{
                template.elements.length - index
              }}</span>
            </button>
          </div>
        </div>

        <!-- Placeholders -->
        <div class="p-2 border-t border-zinc-800">
          <p class="we-panel-label mb-1">Placeholders</p>
          <div class="flex flex-wrap gap-1">
            <code
              v-for="ph in placeholders"
              :key="ph"
              class="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono"
              >{{ ph }}</code
            >
          </div>
        </div>
      </div>

      <!-- CENTER: Canvas -->
      <div
        class="flex-1 flex items-center justify-center bg-[#2d2d2d] overflow-auto relative"
        ref="canvasWrap"
      >
        <!-- Checkerboard under canvas -->
        <div
          class="absolute inset-0 opacity-[0.03]"
          style="
            background-image: repeating-conic-gradient(
              #fff 0% 25%,
              transparent 0% 50%
            );
            background-size: 16px 16px;
          "
        />
        <client-only>
          <div
            :style="{
              width: `${template.canvasWidth * scaleFactor}px`,
              height: `${template.canvasHeight * scaleFactor}px`,
            }"
            class="relative z-10 shadow-2xl shadow-black/50 ring-1 ring-white/10"
          >
            <v-stage
              ref="stageRef"
              :config="{
                width: template.canvasWidth,
                height: template.canvasHeight,
                scaleX: scaleFactor,
                scaleY: scaleFactor,
              }"
              @click="handleStageClick"
              @tap="handleStageClick"
            >
              <v-layer>
                <v-rect
                  :config="{
                    x: 0,
                    y: 0,
                    width: template.canvasWidth,
                    height: template.canvasHeight,
                    fill: template.backgroundColor,
                  }"
                />

                <template v-for="el in template.elements" :key="el.id">
                  <v-rect
                    v-if="el.type === 'rect'"
                    :config="rectConfig(el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="() => selectElement(el.id)"
                    @tap="() => selectElement(el.id)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />
                  <v-circle
                    v-if="el.type === 'circle'"
                    :config="circleConfig(el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="() => selectElement(el.id)"
                    @tap="() => selectElement(el.id)"
                  />
                  <v-text
                    v-if="el.type === 'text'"
                    :config="textConfig(el)"
                    @dragend="(e: any) => handleTextDragEnd(e, el)"
                    @click="() => selectElement(el.id)"
                    @tap="() => selectElement(el.id)"
                  />
                  <v-group
                    v-if="el.type === 'avatar'"
                    :config="{ x: el.x, y: el.y, draggable: true, name: el.id }"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="() => selectElement(el.id)"
                    @tap="() => selectElement(el.id)"
                  >
                    <v-circle
                      v-if="el.borderWidth"
                      :config="{
                        x: 0,
                        y: 0,
                        radius: (el.radius || 64) + (el.borderWidth || 0),
                        fill: el.borderColor || '#ffffff',
                        opacity: el.opacity ?? 1,
                      }"
                    />
                    <v-circle
                      :config="{
                        x: 0,
                        y: 0,
                        radius: el.radius || 64,
                        fill: '#4f46e5',
                        opacity: el.opacity ?? 1,
                      }"
                    />
                    <v-text
                      :config="{
                        x: -(el.radius || 64),
                        y: -(el.radius || 64) / 2,
                        width: (el.radius || 64) * 2,
                        text: '👤',
                        fontSize: (el.radius || 64) * 0.8,
                        align: 'center',
                      }"
                    />
                  </v-group>
                </template>

                <v-transformer
                  v-if="selectedElementId"
                  ref="transformerRef"
                  :config="{
                    nodes: transformerNodes,
                    enabledAnchors:
                      selectedElement?.type === 'circle' ||
                      selectedElement?.type === 'avatar'
                        ? []
                        : [
                            'top-left',
                            'top-right',
                            'bottom-left',
                            'bottom-right',
                            'middle-left',
                            'middle-right',
                            'top-center',
                            'bottom-center',
                          ],
                    rotateEnabled: true,
                    borderStroke: '#7c6ef6',
                    borderStrokeWidth: 1.5,
                    anchorStroke: '#7c6ef6',
                    anchorFill: '#1e1e1e',
                    anchorSize: 7,
                    anchorCornerRadius: 1,
                    rotateAnchorOffset: 20,
                    padding: 2,
                  }"
                  @transformend="handleTransformerEnd"
                />
              </v-layer>
            </v-stage>
          </div>
          <template #fallback>
            <div
              class="flex items-center justify-center py-20 text-zinc-500 text-sm"
            >
              <UIcon
                name="i-heroicons-arrow-path"
                class="w-5 h-5 animate-spin mr-2"
              />
              Loading…
            </div>
          </template>
        </client-only>
      </div>

      <!-- RIGHT PANEL: Properties -->
      <div
        class="w-[260px] shrink-0 bg-[#1e1e1e] border-l border-zinc-800 overflow-y-auto"
      >
        <div v-if="selectedElement" class="flex flex-col">
          <!-- Header -->
          <div
            class="flex items-center justify-between p-2 border-b border-zinc-800"
          >
            <div class="flex items-center gap-1.5">
              <UIcon
                :name="elementTypeIcon(selectedElement.type)"
                class="text-sm text-zinc-400"
              />
              <span class="text-xs font-medium text-zinc-300">{{
                selectedElement.type.charAt(0).toUpperCase() +
                selectedElement.type.slice(1)
              }}</span>
            </div>
            <button
              class="we-tool-btn text-red-400 hover:text-red-300"
              @click="deleteSelectedElement"
            >
              <UIcon name="i-heroicons-trash" class="text-sm" />
            </button>
          </div>

          <!-- Transform -->
          <div class="we-prop-section">
            <p class="we-prop-title">Transform</p>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div class="we-prop-row">
                <span class="we-prop-label">X</span
                ><input
                  v-model.number="selectedElement.x"
                  type="number"
                  class="we-num-input flex-1"
                />
              </div>
              <div class="we-prop-row">
                <span class="we-prop-label">Y</span
                ><input
                  v-model.number="selectedElement.y"
                  type="number"
                  class="we-num-input flex-1"
                />
              </div>
              <template
                v-if="
                  selectedElement.type === 'rect' ||
                  selectedElement.type === 'image'
                "
              >
                <div class="we-prop-row">
                  <span class="we-prop-label">W</span
                  ><input
                    v-model.number="selectedElement.width"
                    type="number"
                    class="we-num-input flex-1"
                  />
                </div>
                <div class="we-prop-row">
                  <span class="we-prop-label">H</span
                  ><input
                    v-model.number="selectedElement.height"
                    type="number"
                    class="we-num-input flex-1"
                  />
                </div>
              </template>
              <template
                v-if="
                  selectedElement.type === 'circle' ||
                  selectedElement.type === 'avatar'
                "
              >
                <div class="we-prop-row">
                  <span class="we-prop-label">R</span
                  ><input
                    v-model.number="selectedElement.radius"
                    type="number"
                    class="we-num-input flex-1"
                  />
                </div>
              </template>
              <div
                v-if="selectedElement.type === 'rect'"
                class="we-prop-row col-span-2"
              >
                <span class="we-prop-label">Radius</span
                ><input
                  v-model.number="selectedElement.cornerRadius"
                  type="number"
                  class="we-num-input flex-1"
                  min="0"
                />
              </div>
            </div>
          </div>

          <!-- Text -->
          <div v-if="selectedElement.type === 'text'" class="we-prop-section">
            <p class="we-prop-title">Text</p>
            <textarea
              v-model="selectedElement.text"
              rows="2"
              class="we-textarea"
              placeholder="Use {username}, etc."
            />
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1.5">
              <div class="we-prop-row">
                <span class="we-prop-label">Size</span
                ><input
                  v-model.number="selectedElement.fontSize"
                  type="number"
                  class="we-num-input flex-1"
                  min="6"
                />
              </div>
              <div class="we-prop-row">
                <span class="we-prop-label">Style</span>
                <select
                  v-model="selectedElement.fontStyle"
                  class="we-select flex-1"
                >
                  <option value="">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="italic">Italic</option>
                  <option value="bold italic">B+I</option>
                </select>
              </div>
            </div>
            <div class="flex gap-1 mt-1.5">
              <button
                v-for="a in ['left', 'center', 'right']"
                :key="a"
                class="we-tool-btn flex-1"
                :class="{
                  'bg-violet-600/30 text-violet-300':
                    selectedElement.align === a,
                }"
                @click="selectedElement!.align = a"
              >
                <UIcon
                  :name="
                    a === 'left'
                      ? 'i-heroicons-bars-3-bottom-left'
                      : a === 'center'
                        ? 'i-heroicons-bars-3'
                        : 'i-heroicons-bars-3-bottom-right'
                  "
                />
              </button>
            </div>
          </div>

          <!-- Fill -->
          <div
            v-if="
              selectedElement.type !== 'avatar' &&
              selectedElement.type !== 'image'
            "
            class="we-prop-section"
          >
            <p class="we-prop-title">Fill</p>
            <div class="flex items-center gap-2">
              <div
                class="we-color-chip-lg"
                :style="{ background: selectedElementFill }"
                @click="($refs.fillColor as HTMLInputElement).click()"
              />
              <input
                ref="fillColor"
                type="color"
                :value="selectedElementFill"
                @input="
                  (e: any) => {
                    if (selectedElement) selectedElement.fill = e.target.value;
                  }
                "
                class="sr-only"
              />
              <input
                v-model="selectedElement.fill"
                class="we-hex-input flex-1"
                placeholder="#ffffff or gradient"
              />
            </div>
            <p class="text-[9px] text-zinc-600 mt-1">
              Tip: linear-gradient(135deg, #color1, #color2)
            </p>
          </div>

          <!-- Stroke -->
          <div
            v-if="
              selectedElement.type !== 'avatar' &&
              selectedElement.type !== 'image'
            "
            class="we-prop-section"
          >
            <p class="we-prop-title">Stroke</p>
            <div class="flex items-center gap-2">
              <div
                class="we-color-chip-lg"
                :style="{ background: selectedElement.stroke || '#000' }"
                @click="($refs.strokeColor as HTMLInputElement).click()"
              />
              <input
                ref="strokeColor"
                type="color"
                :value="selectedElement.stroke || '#000000'"
                @input="
                  (e: any) => {
                    if (selectedElement)
                      selectedElement.stroke = e.target.value;
                  }
                "
                class="sr-only"
              />
              <input
                v-model.number="selectedElement.strokeWidth"
                type="number"
                class="we-num-input w-14"
                min="0"
                placeholder="0"
              />
            </div>
          </div>

          <!-- Avatar Border -->
          <div v-if="selectedElement.type === 'avatar'" class="we-prop-section">
            <p class="we-prop-title">Border</p>
            <div class="flex items-center gap-2">
              <div
                class="we-color-chip-lg"
                :style="{ background: selectedElement.borderColor || '#fff' }"
                @click="($refs.borderColor as HTMLInputElement).click()"
              />
              <input
                ref="borderColor"
                type="color"
                v-model="selectedElement.borderColor"
                class="sr-only"
              />
              <input
                v-model.number="selectedElement.borderWidth"
                type="number"
                class="we-num-input w-14"
                min="0"
                placeholder="0"
              />
            </div>
          </div>

          <!-- Opacity -->
          <div class="we-prop-section">
            <div class="flex items-center justify-between">
              <p class="we-prop-title mb-0">Opacity</p>
              <span class="text-[10px] text-zinc-500 tabular-nums"
                >{{ Math.round((selectedElement.opacity ?? 1) * 100) }}%</span
              >
            </div>
            <input
              type="range"
              v-model.number="selectedElementOpacityPct"
              min="0"
              max="100"
              step="1"
              class="we-range mt-1"
            />
          </div>
        </div>

        <!-- No selection -->
        <div
          v-else
          class="flex flex-col items-center justify-center h-full text-center py-12"
        >
          <UIcon
            name="i-heroicons-cursor-arrow-rays"
            class="text-2xl text-zinc-600 mb-2"
          />
          <p class="text-xs text-zinc-500">Select an element</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from "vue";
import { Query } from "appwrite";

const props = defineProps<{
  guildId: string;
  channels: any[];
  channelsLoading: boolean;
}>();

const emit = defineEmits<{ (e: "saved"): void }>();
const { databases } = useAppwrite();
const toast = useToast();

const databaseId = "discord_bot";
const guildConfigsCollectionId = "guild_configs";

// ── Types ──

interface TemplateElement {
  id: string;
  type: "text" | "image" | "rect" | "circle" | "avatar";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fill?: string;
  align?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  opacity?: number;
  src?: string;
  radius?: number;
  borderColor?: string;
  borderWidth?: number;
  rotation?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

interface WelcomeTemplate {
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundImage?: string;
  elements: TemplateElement[];
  channelId?: string;
}

const DEFAULT_TEMPLATE: WelcomeTemplate = {
  canvasWidth: 1024,
  canvasHeight: 500,
  backgroundColor: "#1a1a2e",
  elements: [
    {
      id: "bg-overlay",
      type: "rect",
      x: 0,
      y: 0,
      width: 1024,
      height: 500,
      fill: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
      opacity: 1,
    },
    {
      id: "decoration-top",
      type: "rect",
      x: 0,
      y: 0,
      width: 1024,
      height: 4,
      fill: "linear-gradient(90deg, #6366f1, #a78bfa, #c084fc)",
      opacity: 1,
    },
    {
      id: "avatar",
      type: "avatar",
      x: 512,
      y: 155,
      radius: 80,
      borderColor: "#a78bfa",
      borderWidth: 4,
    },
    {
      id: "welcome-label",
      type: "text",
      x: 512,
      y: 280,
      text: "WELCOME",
      fontSize: 44,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#ffffff",
      align: "center",
    },
    {
      id: "username-text",
      type: "text",
      x: 512,
      y: 340,
      text: "{username}",
      fontSize: 30,
      fontFamily: "sans-serif",
      fill: "#a78bfa",
      align: "center",
    },
    {
      id: "server-text",
      type: "text",
      x: 512,
      y: 395,
      text: "to {server_name}",
      fontSize: 20,
      fontFamily: "sans-serif",
      fill: "#9ca3af",
      align: "center",
    },
    {
      id: "member-count",
      type: "text",
      x: 512,
      y: 450,
      text: "Member #{member_count}",
      fontSize: 16,
      fontFamily: "sans-serif",
      fill: "#6b7280",
      align: "center",
    },
  ],
};

// ── State ──

const template = ref<WelcomeTemplate>(
  JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)),
);
const selectedElementId = ref<string | null>(null);
const saving = ref(false);
const stageRef = ref<any>(null);
const transformerRef = ref<any>(null);
const canvasWrap = ref<HTMLElement | null>(null);

const placeholders = [
  "{username}",
  "{displayname}",
  "{tag}",
  "{server_name}",
  "{member_count}",
];

const toolTypes = [
  {
    type: "text" as const,
    icon: "i-heroicons-bars-3-bottom-left",
    label: "Text",
    color: "text-violet-400",
  },
  {
    type: "rect" as const,
    icon: "i-heroicons-stop",
    label: "Rectangle",
    color: "text-blue-400",
  },
  {
    type: "circle" as const,
    icon: "i-heroicons-sun",
    label: "Circle",
    color: "text-cyan-400",
  },
  {
    type: "avatar" as const,
    icon: "i-heroicons-user-circle",
    label: "Avatar",
    color: "text-pink-400",
  },
];

const channelOptions = computed(() =>
  props.channels.map((c) => ({ label: `#${c.name}`, value: c.id })),
);

const reversedElements = computed(() => [...template.value.elements].reverse());

const scaleFactor = computed(() => {
  const maxW = canvasWrap.value ? canvasWrap.value.clientWidth - 80 : 700;
  const maxH = canvasWrap.value ? canvasWrap.value.clientHeight - 80 : 500;
  const sw =
    template.value.canvasWidth > maxW ? maxW / template.value.canvasWidth : 1;
  const sh =
    template.value.canvasHeight > maxH ? maxH / template.value.canvasHeight : 1;
  return Math.min(sw, sh, 1);
});

const selectedElement = computed(() => {
  if (!selectedElementId.value) return null;
  return (
    template.value.elements.find((el) => el.id === selectedElementId.value) ||
    null
  );
});

const selectedElementFill = computed(() => {
  const el = selectedElement.value;
  if (!el || !el.fill || el.fill.startsWith("linear")) return "#ffffff";
  return el.fill;
});

const selectedElementOpacityPct = computed({
  get: () => Math.round((selectedElement.value?.opacity ?? 1) * 100),
  set: (v: number) => {
    if (selectedElement.value) selectedElement.value.opacity = v / 100;
  },
});

// ── Transformer ──

const transformerNodes = computed(() => {
  if (!stageRef.value || !selectedElementId.value) return [];
  try {
    const stage = stageRef.value.getNode();
    if (!stage) return [];
    const node = stage.findOne(`.${selectedElementId.value}`);
    return node ? [node] : [];
  } catch {
    return [];
  }
});

watch(selectedElementId, async () => {
  await nextTick();
  if (transformerRef.value) {
    try {
      const tr = transformerRef.value.getNode();
      if (tr) {
        tr.nodes(transformerNodes.value);
        tr.getLayer()?.batchDraw();
      }
    } catch {
      /* ignore */
    }
  }
});

// ── Config builders ──

function rectConfig(el: TemplateElement) {
  const grad = isGradient(el.fill);
  return {
    x: el.x,
    y: el.y,
    width: el.width || 100,
    height: el.height || 100,
    fill: grad ? undefined : el.fill || "#ffffff",
    fillLinearGradientStartPoint: grad ? { x: 0, y: 0 } : undefined,
    fillLinearGradientEndPoint: grad
      ? { x: el.width || 100, y: el.height || 100 }
      : undefined,
    fillLinearGradientColorStops: grad
      ? parseGradientStops(el.fill!)
      : undefined,
    cornerRadius: el.cornerRadius || 0,
    opacity: el.opacity ?? 1,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth || 0,
    rotation: el.rotation || 0,
    draggable: true,
    name: el.id,
  };
}

function circleConfig(el: TemplateElement) {
  return {
    x: el.x,
    y: el.y,
    radius: el.radius || 50,
    fill: el.fill || "#ffffff",
    opacity: el.opacity ?? 1,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth || 0,
    draggable: true,
    name: el.id,
  };
}

function textConfig(el: TemplateElement) {
  return {
    x:
      el.align === "center"
        ? el.x - 200
        : el.align === "right"
          ? el.x - 400
          : el.x,
    y: el.y - (el.fontSize || 24) / 2,
    width: 400,
    text: previewText(el.text || ""),
    fontSize: el.fontSize || 24,
    fontFamily: el.fontFamily || "sans-serif",
    fontStyle: el.fontStyle || "",
    fill: el.fill || "#ffffff",
    align: el.align || "center",
    opacity: el.opacity ?? 1,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth || 0,
    draggable: true,
    name: el.id,
  };
}

// ── Helpers ──

function isGradient(fill?: string): boolean {
  return !!fill && fill.startsWith("linear-gradient");
}

function parseGradientStops(g: string): (string | number)[] {
  const m = g.match(/linear-gradient\(([^)]+)\)/);
  if (!m) return [0, "#ffffff", 1, "#000000"];
  const colors = m[1]
    .split(",")
    .map((s) => s.trim())
    .slice(1);
  const stops: (string | number)[] = [];
  colors.forEach((c, i) => {
    stops.push(i / Math.max(colors.length - 1, 1));
    stops.push(c);
  });
  return stops;
}

function previewText(t: string): string {
  return t
    .replace(/\{username\}/g, "NewUser")
    .replace(/\{displayname\}/g, "New User")
    .replace(/\{tag\}/g, "NewUser#0001")
    .replace(/\{server_name\}/g, "My Server")
    .replace(/\{member_count\}/g, "42");
}

function elementTypeIcon(type: string): string {
  const map: Record<string, string> = {
    text: "i-heroicons-bars-3-bottom-left",
    rect: "i-heroicons-stop",
    circle: "i-heroicons-sun",
    avatar: "i-heroicons-user-circle",
    image: "i-heroicons-photo",
  };
  return map[type] || "i-heroicons-square-3-stack-3d";
}

// ── Element CRUD ──

let elementCounter = 0;

function addElement(type: TemplateElement["type"]) {
  elementCounter++;
  const id = `${type}-${Date.now()}-${elementCounter}`;
  const cx = template.value.canvasWidth / 2,
    cy = template.value.canvasHeight / 2;
  const defs: Record<string, Partial<TemplateElement>> = {
    text: {
      type: "text",
      x: cx,
      y: cy,
      text: "New Text",
      fontSize: 24,
      fontFamily: "sans-serif",
      fontStyle: "",
      fill: "#ffffff",
      align: "center",
      opacity: 1,
    },
    rect: {
      type: "rect",
      x: cx - 75,
      y: cy - 50,
      width: 150,
      height: 100,
      fill: "#374151",
      opacity: 1,
      cornerRadius: 8,
    },
    circle: {
      type: "circle",
      x: cx,
      y: cy,
      radius: 50,
      fill: "#4f46e5",
      opacity: 1,
    },
    avatar: {
      type: "avatar",
      x: cx,
      y: cy - 80,
      radius: 64,
      borderColor: "#a78bfa",
      borderWidth: 3,
      opacity: 1,
    },
  };
  if (!defs[type]) return;
  template.value.elements.push({ id, ...defs[type] } as TemplateElement);
  selectedElementId.value = id;
}

function deleteSelectedElement() {
  if (!selectedElementId.value) return;
  const i = template.value.elements.findIndex(
    (el) => el.id === selectedElementId.value,
  );
  if (i !== -1) {
    template.value.elements.splice(i, 1);
    selectedElementId.value = null;
  }
}

function selectElement(id: string) {
  selectedElementId.value = id;
}

// ── Drag / Transform ──

function handleStageClick(e: any) {
  if (e.target === e.target.getStage()) selectedElementId.value = null;
}

function handleDragEnd(e: any, el: TemplateElement) {
  el.x = Math.round(e.target.x());
  el.y = Math.round(e.target.y());
}

function handleTextDragEnd(e: any, el: TemplateElement) {
  const rx = e.target.x(),
    ry = e.target.y();
  el.x = Math.round(
    el.align === "center" ? rx + 200 : el.align === "right" ? rx + 400 : rx,
  );
  el.y = Math.round(ry + (el.fontSize || 24) / 2);
}

function handleTransformEnd(e: any, el: TemplateElement) {
  const node = e.target;
  el.x = Math.round(node.x());
  el.y = Math.round(node.y());
  el.width = Math.round(Math.max(5, node.width() * node.scaleX()));
  el.height = Math.round(Math.max(5, node.height() * node.scaleY()));
  el.rotation = Math.round(node.rotation());
  node.scaleX(1);
  node.scaleY(1);
}

function handleTransformerEnd(e: any) {
  const node = e.target;
  const el = template.value.elements.find((x) => x.id === node.name());
  if (!el) return;
  handleTransformEnd(e, el);
}

function resetTemplate() {
  template.value = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
  selectedElementId.value = null;
}

// ── Load / Save ──

async function loadTemplate() {
  try {
    const r = await databases.listDocuments(
      databaseId,
      guildConfigsCollectionId,
      [
        Query.equal("guildId", props.guildId),
        Query.equal("moduleName", "welcome"),
      ],
    );
    if (r.total > 0 && r.documents[0].settings) {
      try {
        template.value = {
          ...JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)),
          ...JSON.parse(r.documents[0].settings),
        };
      } catch {
        /* defaults */
      }
    }
  } catch (err) {
    console.error("[WelcomeEditor] load error:", err);
  }
}

async function saveTemplate() {
  saving.value = true;
  try {
    const r = await databases.listDocuments(
      databaseId,
      guildConfigsCollectionId,
      [
        Query.equal("guildId", props.guildId),
        Query.equal("moduleName", "welcome"),
      ],
    );
    const json = JSON.stringify(template.value);
    if (r.total > 0) {
      await databases.updateDocument(
        databaseId,
        guildConfigsCollectionId,
        r.documents[0].$id,
        { settings: json },
      );
    } else {
      await databases.createDocument(
        databaseId,
        guildConfigsCollectionId,
        "unique()",
        {
          guildId: props.guildId,
          moduleName: "welcome",
          enabled: true,
          settings: json,
        },
      );
    }
    toast.add({
      title: "Saved!",
      description: "Welcome template saved.",
      color: "success",
    });
    emit("saved");
  } catch (err) {
    console.error("[WelcomeEditor] save error:", err);
    toast.add({
      title: "Error",
      description: "Failed to save.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadTemplate();
});
</script>

<style scoped>
/* ── Foundation ── */
.we {
  font-family:
    "Inter",
    system-ui,
    -apple-system,
    sans-serif;
  background: #181818;
  color: #d4d4d8;
}

/* ── Toolbar ── */
.we-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #252525;
  border-bottom: 1px solid #333;
  height: 36px;
}
.we-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.we-toolbar-sep {
  width: 1px;
  height: 18px;
  background: #3f3f46;
  margin: 0 2px;
}

/* ── Labels ── */
.we-label {
  font-size: 10px;
  color: #71717a;
  font-weight: 600;
  letter-spacing: 0.02em;
  min-width: 12px;
  text-align: right;
}
.we-panel-label {
  font-size: 10px;
  font-weight: 600;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Inputs ── */
.we-num-input {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #d4d4d8;
  font-size: 11px;
  padding: 2px 4px;
  font-variant-numeric: tabular-nums;
  outline: none;
  transition: border-color 0.15s;
}
.we-num-input:focus {
  border-color: #7c6ef6;
}
.we-hex-input {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #d4d4d8;
  font-size: 10px;
  padding: 2px 6px;
  font-family: "JetBrains Mono", monospace;
  outline: none;
  transition: border-color 0.15s;
}
.we-hex-input:focus {
  border-color: #7c6ef6;
}
.we-textarea {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #d4d4d8;
  font-size: 11px;
  padding: 4px 6px;
  width: 100%;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}
.we-textarea:focus {
  border-color: #7c6ef6;
}
.we-select {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #d4d4d8;
  font-size: 11px;
  padding: 2px 4px;
  outline: none;
}

/* ── Buttons ── */
.we-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 3px;
  color: #a1a1aa;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.we-tool-btn:hover {
  background: #333;
  color: #e4e4e7;
}
.we-tool-square {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  background: #262626;
  border: 1px solid #333;
  cursor: pointer;
  transition: all 0.15s;
}
.we-tool-square:hover {
  background: #333;
  border-color: #52525b;
}
.we-btn-primary {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 4px;
  background: #7c6ef6;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.we-btn-primary:hover {
  background: #6d5fd6;
}
.we-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── Color Chips ── */
.we-color-chip {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 1px solid #555;
  cursor: pointer;
  transition: transform 0.1s;
}
.we-color-chip:hover {
  transform: scale(1.1);
}
.we-color-chip-lg {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: 1px solid #555;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.1s;
}
.we-color-chip-lg:hover {
  transform: scale(1.05);
}

/* ── Layers ── */
.we-layer {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 8px;
  border-radius: 3px;
  font-size: 11px;
  color: #a1a1aa;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.1s;
}
.we-layer:hover {
  background: #2a2a2a;
  color: #d4d4d8;
}
.we-layer-active {
  background: #7c6ef620;
  border-color: #7c6ef650;
  color: #e4e4e7;
}

/* ── Property Sections ── */
.we-prop-section {
  padding: 8px 10px;
  border-bottom: 1px solid #2a2a2a;
}
.we-prop-title {
  font-size: 10px;
  font-weight: 600;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.we-prop-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.we-prop-label {
  font-size: 10px;
  color: #52525b;
  font-weight: 600;
  min-width: 14px;
}

/* ── Range Slider ── */
.we-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  background: #333;
  border-radius: 2px;
  outline: none;
}
.we-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #7c6ef6;
  cursor: pointer;
  border: 2px solid #1e1e1e;
}
.we-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #7c6ef6;
  cursor: pointer;
  border: 2px solid #1e1e1e;
}

/* ── Konva overrides ── */
.we :deep(.konvajs-content) {
  border-radius: 0 !important;
}

/* Hide number input spinners */
.we-num-input::-webkit-inner-spin-button,
.we-num-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.we-num-input {
  -moz-appearance: textfield;
}
</style>
