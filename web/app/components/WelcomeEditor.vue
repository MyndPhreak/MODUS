<template>
  <div class="we font-sans flex flex-col h-full select-none">
    <!-- TOP TOOLBAR -->
    <div class="we-toolbar we-glass-panel rounded-2xl">
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
        <UPopover>
          <UTooltip text="Canvas size">
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-heroicons-arrows-pointing-out"
              :label="`${template.canvasWidth} × ${template.canvasHeight}`"
              aria-label="Canvas size"
            />
          </UTooltip>
          <template #content>
            <div class="p-3 space-y-3 w-48">
              <div>
                <p class="we-prop-label mb-1">Width</p>
                <UInputNumber
                  v-model="template.canvasWidth"
                  :min="200"
                  :max="1920"
                  size="sm"
                  class="w-full"
                />
              </div>
              <div>
                <p class="we-prop-label mb-1">Height</p>
                <UInputNumber
                  v-model="template.canvasHeight"
                  :min="100"
                  :max="1080"
                  size="sm"
                  class="w-full"
                />
              </div>
            </div>
          </template>
        </UPopover>
      </div>

      <div class="we-toolbar-sep" />

      <div class="we-toolbar-group">
        <UPopover>
          <UTooltip text="Background">
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              aria-label="Background"
              :style="{ backgroundColor: template.backgroundColor }"
              class="w-6 h-6 p-0 rounded-md relative"
            >
              <UIcon
                v-if="template.backgroundImage"
                name="i-heroicons-photo"
                class="text-[10px] text-white drop-shadow"
              />
            </UButton>
          </UTooltip>
          <template #content>
            <div class="p-3 space-y-3 w-56">
              <div>
                <p class="we-prop-label mb-1.5">Color</p>
                <div class="space-y-2">
                  <UColorPicker v-model="template.backgroundColor" size="sm" />
                  <UInput
                    v-model="template.backgroundColor"
                    size="xs"
                    class="font-mono w-full"
                  />
                </div>
              </div>
              <div class="border-t border-white/10 pt-3">
                <p class="we-prop-label mb-1.5">Image</p>
                <div class="flex items-center gap-2">
                  <UFileUpload
                    v-model="bgImageFile"
                    accept="image/*"
                    :dropzone="false"
                    :preview="false"
                  >
                    <template #default="{ open }">
                      <UButton
                        icon="i-heroicons-photo"
                        color="neutral"
                        variant="outline"
                        size="xs"
                        :label="template.backgroundImage ? 'Replace' : 'Upload'"
                        @click="open()"
                      />
                    </template>
                  </UFileUpload>
                  <UButton
                    v-if="template.backgroundImage"
                    icon="i-heroicons-x-mark"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Remove background image"
                    @click="removeBgImage"
                  />
                  <span
                    v-if="bgUploading"
                    class="text-[10px] text-zinc-500 flex items-center gap-1"
                  >
                    <UIcon name="i-heroicons-arrow-path" class="animate-spin text-xs" />
                  </span>
                </div>
              </div>
            </div>
          </template>
        </UPopover>
      </div>

      <div class="we-toolbar-sep" />

      <div class="we-toolbar-group">
        <span class="we-label">Zoom</span>
        <span class="text-xs text-zinc-400 tabular-nums w-10 text-center">
          {{ Math.round(zoomMultiplier * 100) }}%
        </span>
        <UTooltip text="Reset zoom">
          <UButton
            color="neutral"
            variant="outline"
            size="xs"
            icon="i-heroicons-arrow-path"
            aria-label="Reset zoom"
            @click="zoomMultiplier = 1"
          />
        </UTooltip>
      </div>

      <div class="flex-1" />

      <div class="we-toolbar-group">
        <UTooltip text="Reset">
          <UButton
            icon="i-heroicons-arrow-uturn-left"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Reset"
            @click="resetTemplate"
          />
        </UTooltip>
        <UButton
          icon="i-heroicons-cloud-arrow-up"
          label="Save"
          color="primary"
          variant="solid"
          size="xs"
          :loading="saving"
          :disabled="saving"
          @click="saveTemplate"
        />
      </div>
    </div>

    <!-- MAIN EDITOR AREA -->
    <div class="flex-1 flex min-h-0 gap-px bg-zinc-950">
      <!-- LEFT PANEL: Tools + Layers -->
      <div
        class="w-72 shrink-0 flex flex-col we-glass-panel rounded-2xl"
      >
        <!-- Preset Templates -->
        <div class="p-2 border-b border-zinc-800">
          <p class="we-panel-label mb-2">Presets</p>
          <div class="grid grid-cols-2 gap-1">
            <UTooltip
              v-for="preset in PRESETS"
              :key="preset.name"
              :text="preset.name"
            >
              <button
                class="we-preset-btn"
                @click="applyPreset(preset)"
              >
                <div
                  class="we-preset-swatch"
                  :style="{ background: preset.preview }"
                />
                <span class="text-[9px] truncate">{{ preset.name }}</span>
              </button>
            </UTooltip>
          </div>
        </div>

        <!-- Add Element Tools -->
        <div class="p-2 border-b border-zinc-800">
          <p class="we-panel-label mb-2">Tools</p>
          <div class="flex flex-col gap-1.5">
            <button
              v-for="t in toolTypes"
              :key="t.type"
              class="we-tool-row"
              @click="addElement(t.type)"
            >
              <UIcon :name="t.icon" class="text-lg shrink-0" :class="t.color" />
              <span class="text-sm font-medium">{{ t.label }}</span>
            </button>
          </div>
        </div>

        <!-- Layers -->
        <div class="flex-1 flex flex-col min-h-0">
          <div
            class="flex items-center justify-between p-2 border-b border-zinc-800"
          >
            <p class="we-panel-label">Layers</p>
            <div class="flex items-center gap-1">
              <UTooltip text="Move up">
                <button
                  class="we-tool-btn-sm"
                  :aria-disabled="selectedElementIds.size !== 1"
                  aria-label="Move up"
                  @click="moveLayer('up')"
                >
                  <UIcon name="i-heroicons-chevron-up" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Move down">
                <button
                  class="we-tool-btn-sm"
                  :aria-disabled="selectedElementIds.size !== 1"
                  aria-label="Move down"
                  @click="moveLayer('down')"
                >
                  <UIcon name="i-heroicons-chevron-down" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Duplicate">
                <button
                  class="we-tool-btn-sm"
                  :aria-disabled="selectedElementIds.size === 0"
                  aria-label="Duplicate"
                  @click="duplicateSelectedElement"
                >
                  <UIcon name="i-heroicons-document-duplicate" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Delete">
                <button
                  class="we-tool-btn-sm text-red-400 hover:text-red-300"
                  :aria-disabled="selectedElementIds.size === 0"
                  aria-label="Delete"
                  @click="deleteSelectedElement"
                >
                  <UIcon name="i-heroicons-trash" class="text-sm" />
                </button>
              </UTooltip>
              <span class="text-[10px] text-zinc-500 tabular-nums ml-1">{{
                template.elements.length
              }}</span>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto p-1 space-y-px">
            <div
              v-if="template.elements.length === 0"
              class="text-center py-8 text-zinc-600 text-[11px]"
            >
              Add elements using the tools above
            </div>
            <button
              v-for="(el, index) in reversedElements"
              :key="el.id"
              class="we-layer"
              :class="{ 'we-layer-active': selectedElementIds.has(el.id) }"
              @click="(e: MouseEvent) => selectElement(el.id, e)"
              @mouseenter="hoveredElementId = el.id"
              @mouseleave="hoveredElementId = null"
            >
              <UIcon
                :name="elementTypeIcon(el.type)"
                class="text-sm shrink-0"
              />
              <span class="truncate flex-1 text-left">
                {{ elementLabel(el) }}
              </span>
              <span class="text-[9px] text-zinc-600 tabular-nums">{{
                template.elements.length - index
              }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- CENTER: Canvas -->
      <div
        class="flex-1 flex [align-items:safe_center] [justify-content:safe_center] bg-[#2d2d2d] overflow-auto relative"
        ref="canvasWrap"
        :class="{ 'cursor-grab': isSpaceHeld && !isPanning, 'cursor-grabbing': isPanning }"
        @wheel.prevent="handleWheelZoom"
        @mousedown="handlePanStart"
        @mousemove="handlePanMove"
        @mouseup="handlePanEnd"
        @mouseleave="handlePanEnd"
        @contextmenu="(e: MouseEvent) => { if (isSpaceHeld) e.preventDefault(); }"
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
          @click="!isSpaceHeld && (selectedElementIds = new Set())"
        />

        <!-- Empty state hint -->
        <div
          v-if="template.elements.length === 0"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center text-center pointer-events-none"
        >
          <UIcon
            name="i-heroicons-cursor-arrow-rays"
            class="text-2xl text-zinc-500 mb-2"
          />
          <p class="text-xs text-zinc-500">
            Click a tool on the left to add your first element
          </p>
        </div>

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
                width: template.canvasWidth * scaleFactor,
                height: template.canvasHeight * scaleFactor,
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
                    listening: false,
                  }"
                />

                <!-- Background Image -->
                <v-image
                  v-if="bgImageObj"
                  :config="{
                    x: 0,
                    y: 0,
                    width: template.canvasWidth,
                    height: template.canvasHeight,
                    image: bgImageObj,
                    listening: false,
                  }"
                />

                <template v-for="el in template.elements" :key="el.id">
                  <v-rect
                    v-if="el.type === 'rect'"
                    :config="rectConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />
                  <v-circle
                    v-if="el.type === 'circle'"
                    :config="circleConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />
                  <v-regular-polygon
                    v-if="el.type === 'triangle'"
                    :config="triangleConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />
                  <v-star
                    v-if="el.type === 'star'"
                    :config="starConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />
                  <template v-if="el.type === 'line'">
                    <v-line
                      v-if="!el.arrow"
                      :config="lineConfig(el)"
                      @dragstart="(e: any) => handleDragStart(e, el)"
                      @dragend="(e: any) => handleDragEnd(e, el)"
                      @click="(e: any) => selectElement(el.id, e.evt)"
                      @tap="(e: any) => selectElement(el.id, e.evt)"
                    />
                    <v-arrow
                      v-if="el.arrow"
                      :config="lineConfig(el)"
                      @dragstart="(e: any) => handleDragStart(e, el)"
                      @dragend="(e: any) => handleDragEnd(e, el)"
                      @click="(e: any) => selectElement(el.id, e.evt)"
                      @tap="(e: any) => selectElement(el.id, e.evt)"
                    />
                    <template v-if="selectedElementId === el.id">
                      <v-circle
                        :config="{
                          x: el.x + (el.points?.[0] ?? -60),
                          y: el.y + (el.points?.[1] ?? 0),
                          radius: 6,
                          fill: '#7c6ef6',
                          stroke: '#1e1e1e',
                          strokeWidth: 1,
                          draggable: true,
                        }"
                        @dragmove="(e: any) => handleLineHandleDrag(e, el, 0)"
                      />
                      <v-circle
                        :config="{
                          x: el.x + (el.points?.[2] ?? 60),
                          y: el.y + (el.points?.[3] ?? 0),
                          radius: 6,
                          fill: '#7c6ef6',
                          stroke: '#1e1e1e',
                          strokeWidth: 1,
                          draggable: true,
                        }"
                        @dragmove="(e: any) => handleLineHandleDrag(e, el, 2)"
                      />
                    </template>
                  </template>
                  <v-text
                    v-if="el.type === 'text'"
                    :config="textConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleTextDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />
                  <v-group
                    v-if="el.type === 'avatar'"
                    :config="{
                      x: el.x,
                      y: el.y,
                      rotation: el.rotation ?? 0,
                      draggable: true,
                      name: el.id,
                    }"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
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
                  v-if="transformerNodes.length > 0"
                  ref="transformerRef"
                  :config="{
                    nodes: transformerNodes,
                    enabledAnchors:
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
                    keepRatio:
                      selectedElementIds.size > 1
                        ? true
                        : selectedElement?.type !== 'circle',
                    shiftBehavior: 'default',
                    rotateEnabled: true,
                    borderStroke: '#7c6ef6',
                    borderStrokeWidth: 2.5,
                    anchorStroke: '#7c6ef6',
                    anchorStrokeWidth: 2,
                    anchorFill: '#1e1e1e',
                    anchorSize: 9,
                    anchorCornerRadius: 3,
                    rotateAnchorOffset: 20,
                    padding: 2,
                  }"
                />

                <v-rect
                  v-if="hoveredElementRect"
                  :config="{
                    x: hoveredElementRect.x,
                    y: hoveredElementRect.y,
                    width: hoveredElementRect.width,
                    height: hoveredElementRect.height,
                    stroke: 'rgba(124, 110, 246, 0.6)',
                    strokeWidth: 1.5,
                    dash: [4, 4],
                    listening: false,
                  }"
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
        class="w-72 shrink-0 we-glass-panel rounded-2xl overflow-y-auto"
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
                elementLabel(selectedElement)
              }}</span>
            </div>
            <UTooltip text="Delete element">
              <button
                class="we-tool-btn text-red-400 hover:text-red-300"
                aria-label="Delete element"
                @click="deleteSelectedElement"
              >
                <UIcon name="i-heroicons-trash" class="text-sm" />
              </button>
            </UTooltip>
          </div>

          <!-- Align -->
          <div class="we-prop-section">
            <p class="we-prop-title">Align</p>
            <div class="grid grid-cols-6 gap-1">
              <UTooltip text="Align left">
                <button class="we-tool-btn-sm" @click="alignLayers('left')">
                  <UIcon name="i-lucide-align-start-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align center">
                <button class="we-tool-btn-sm" @click="alignLayers('center-h')">
                  <UIcon name="i-lucide-align-center-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align right">
                <button class="we-tool-btn-sm" @click="alignLayers('right')">
                  <UIcon name="i-lucide-align-end-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align top">
                <button class="we-tool-btn-sm" @click="alignLayers('top')">
                  <UIcon name="i-lucide-align-start-horizontal" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align middle">
                <button class="we-tool-btn-sm" @click="alignLayers('middle-v')">
                  <UIcon name="i-lucide-align-center-horizontal" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align bottom">
                <button class="we-tool-btn-sm" @click="alignLayers('bottom')">
                  <UIcon name="i-lucide-align-end-horizontal" class="text-sm" />
                </button>
              </UTooltip>
            </div>
            <div class="grid grid-cols-2 gap-1 mt-1">
              <UTooltip text="Distribute horizontally">
                <button
                  class="we-tool-btn-sm w-full"
                  :aria-disabled="selectedElementIds.size < 3"
                  @click="distributeLayers('horizontal')"
                >
                  <UIcon
                    name="i-lucide-align-horizontal-distribute-center"
                    class="text-sm"
                  />
                </button>
              </UTooltip>
              <UTooltip text="Distribute vertically">
                <button
                  class="we-tool-btn-sm w-full"
                  :aria-disabled="selectedElementIds.size < 3"
                  @click="distributeLayers('vertical')"
                >
                  <UIcon
                    name="i-lucide-align-vertical-distribute-center"
                    class="text-sm"
                  />
                </button>
              </UTooltip>
            </div>
          </div>

          <!-- Transform -->
          <div class="we-prop-section">
            <p class="we-prop-title">Transform</p>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div class="we-prop-row">
                <span class="we-prop-label">X</span>
                <input
                  v-model.number="selectedElement.x"
                  type="number"
                  class="we-num-input w-full"
                />
              </div>
              <div class="we-prop-row">
                <span class="we-prop-label">Y</span>
                <input
                  v-model.number="selectedElement.y"
                  type="number"
                  class="we-num-input w-full"
                />
              </div>
              <template
                v-if="
                  selectedElement.type === 'rect' ||
                  selectedElement.type === 'image'
                "
              >
                <div class="we-prop-row">
                  <span class="we-prop-label">W</span>
                  <input
                    v-model.number="selectedElement.width"
                    type="number"
                    class="we-num-input w-full"
                  />
                </div>
                <div class="we-prop-row">
                  <span class="we-prop-label">H</span>
                  <input
                    v-model.number="selectedElement.height"
                    type="number"
                    class="we-num-input w-full"
                  />
                </div>
              </template>
              <template
                v-if="
                  selectedElement.type === 'circle' ||
                  selectedElement.type === 'avatar' ||
                  selectedElement.type === 'triangle'
                "
              >
                <div class="we-prop-row">
                  <span class="we-prop-label">R</span>
                  <input
                    v-model.number="selectedElement.radius"
                    type="number"
                    class="we-num-input w-full"
                  />
                </div>
              </template>
              <template v-if="selectedElement.type === 'star'">
                <div class="we-prop-row">
                  <span class="we-prop-label">Outer</span>
                  <input
                    v-model.number="selectedElement.outerRadius"
                    type="number"
                    class="we-num-input w-full"
                  />
                </div>
                <div class="we-prop-row">
                  <span class="we-prop-label">Inner</span>
                  <input
                    v-model.number="selectedElement.innerRadius"
                    type="number"
                    class="we-num-input w-full"
                  />
                </div>
                <div class="we-prop-row">
                  <span class="we-prop-label">Points</span>
                  <input
                    v-model.number="selectedElement.numPoints"
                    type="number"
                    class="we-num-input w-full"
                    min="3"
                    max="12"
                  />
                </div>
              </template>
              <div
                v-if="selectedElement.type === 'rect'"
                class="we-prop-row col-span-2"
              >
                <span class="we-prop-label">Radius</span>
                <input
                  v-model.number="selectedElement.cornerRadius"
                  type="number"
                  class="we-num-input w-full"
                  min="0"
                />
              </div>
            </div>
          </div>

          <!-- Text -->
          <div v-if="selectedElement.type === 'text'" class="we-prop-section">
            <p class="we-prop-title">Text</p>
            <textarea
              ref="textFieldRef"
              v-model="selectedElement.text"
              rows="2"
              class="we-textarea"
              placeholder="Use {username}, etc."
            />
            <div class="flex flex-wrap gap-1.5 mt-2">
              <button
                v-for="ph in placeholders"
                :key="ph"
                class="we-placeholder-chip"
                @click="insertPlaceholder(ph)"
              >
                {{ ph }}
              </button>
            </div>

            <!-- Font Family -->
            <div class="mt-1.5">
              <span class="we-prop-label block mb-1">Font</span>
              <FontPicker
                :model-value="selectedElement.fontFamily || 'sans-serif'"
                @update:model-value="handleFontChange"
              />
            </div>

            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1.5">
              <div class="we-prop-row">
                <span class="we-prop-label">Size</span>
                <input
                  v-model.number="selectedElement.fontSize"
                  type="number"
                  class="we-num-input w-full"
                  min="6"
                />
              </div>
              <div class="we-prop-row">
                <span class="we-prop-label">Style</span>
                <select
                  v-model="selectedElement.fontStyle"
                  class="we-select w-full"
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
              selectedElement.type !== 'image' &&
              selectedElement.type !== 'line'
            "
            class="we-prop-section"
          >
            <p class="we-prop-title">Fill</p>
            <UPopover>
              <button
                type="button"
                class="we-color-chip-lg cursor-pointer"
                :style="{ background: swatchPreview(selectedElement.fill) }"
              />
              <template #content>
                <GradientPicker
                  :model-value="selectedElement.fill"
                  :allow-gradient="selectedElement.type !== 'text'"
                  @update:model-value="
                    (v: string) => {
                      if (selectedElement) selectedElement.fill = v;
                    }
                  "
                />
              </template>
            </UPopover>
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
              <UPopover>
                <button
                  type="button"
                  class="we-color-chip-lg cursor-pointer"
                  :style="{ background: swatchPreview(selectedElement.stroke) }"
                />
                <template #content>
                  <GradientPicker
                    :model-value="selectedElement.stroke"
                    :allow-radial="false"
                    :allow-gradient="
                      selectedElement.type !== 'text' &&
                      selectedElement.type !== 'line'
                    "
                    @update:model-value="
                      (v: string) => {
                        if (selectedElement) selectedElement.stroke = v;
                      }
                    "
                  />
                </template>
              </UPopover>
              <input
                v-model.number="selectedElement.strokeWidth"
                type="number"
                class="we-num-input w-14"
                min="0"
                placeholder="0"
              />
            </div>
            <UCheckbox
              v-if="selectedElement.type === 'line'"
              v-model="selectedElement.arrow"
              label="Arrow"
              class="mt-2"
            />
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
            <USlider
              v-model="selectedElementOpacityPct"
              :min="0"
              :max="100"
              :step="1"
              size="sm"
              class="mt-1"
            />
          </div>
        </div>

        <!-- Multi-select -->
        <div v-else-if="selectedElementIds.size > 1" class="flex flex-col">
          <!-- Header -->
          <div
            class="flex items-center justify-between p-2 border-b border-zinc-800"
          >
            <span class="text-xs font-medium text-zinc-300">
              {{ selectedElementIds.size }} layers selected
            </span>
            <div class="flex items-center gap-1">
              <UTooltip text="Duplicate selection">
                <button
                  class="we-tool-btn"
                  aria-label="Duplicate selection"
                  @click="duplicateSelectedElement"
                >
                  <UIcon
                    name="i-heroicons-document-duplicate"
                    class="text-sm"
                  />
                </button>
              </UTooltip>
              <UTooltip text="Delete selection">
                <button
                  class="we-tool-btn text-red-400 hover:text-red-300"
                  aria-label="Delete selection"
                  @click="deleteSelectedElement"
                >
                  <UIcon name="i-heroicons-trash" class="text-sm" />
                </button>
              </UTooltip>
            </div>
          </div>

          <!-- Align -->
          <div class="we-prop-section">
            <p class="we-prop-title">Align</p>
            <div class="grid grid-cols-6 gap-1">
              <UTooltip text="Align left">
                <button class="we-tool-btn-sm" @click="alignLayers('left')">
                  <UIcon name="i-lucide-align-start-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align center">
                <button class="we-tool-btn-sm" @click="alignLayers('center-h')">
                  <UIcon name="i-lucide-align-center-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align right">
                <button class="we-tool-btn-sm" @click="alignLayers('right')">
                  <UIcon name="i-lucide-align-end-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align top">
                <button class="we-tool-btn-sm" @click="alignLayers('top')">
                  <UIcon name="i-lucide-align-start-horizontal" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align middle">
                <button class="we-tool-btn-sm" @click="alignLayers('middle-v')">
                  <UIcon name="i-lucide-align-center-horizontal" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align bottom">
                <button class="we-tool-btn-sm" @click="alignLayers('bottom')">
                  <UIcon name="i-lucide-align-end-horizontal" class="text-sm" />
                </button>
              </UTooltip>
            </div>
            <div class="grid grid-cols-2 gap-1 mt-1">
              <UTooltip text="Distribute horizontally">
                <button
                  class="we-tool-btn-sm w-full"
                  :aria-disabled="selectedElementIds.size < 3"
                  @click="distributeLayers('horizontal')"
                >
                  <UIcon
                    name="i-lucide-align-horizontal-distribute-center"
                    class="text-sm"
                  />
                </button>
              </UTooltip>
              <UTooltip text="Distribute vertically">
                <button
                  class="we-tool-btn-sm w-full"
                  :aria-disabled="selectedElementIds.size < 3"
                  @click="distributeLayers('vertical')"
                >
                  <UIcon
                    name="i-lucide-align-vertical-distribute-center"
                    class="text-sm"
                  />
                </button>
              </UTooltip>
            </div>
          </div>

          <!-- Transform -->
          <div class="we-prop-section">
            <p class="we-prop-title">Transform</p>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div class="we-prop-row">
                <span class="we-prop-label">X</span>
                <input
                  :value="Math.round(groupBounds?.x ?? 0)"
                  type="number"
                  class="we-num-input w-full"
                  @change="
                    (e: any) =>
                      applyGroupMove(Number(e.target.value), groupBounds?.y ?? 0)
                  "
                />
              </div>
              <div class="we-prop-row">
                <span class="we-prop-label">Y</span>
                <input
                  :value="Math.round(groupBounds?.y ?? 0)"
                  type="number"
                  class="we-num-input w-full"
                  @change="
                    (e: any) =>
                      applyGroupMove(groupBounds?.x ?? 0, Number(e.target.value))
                  "
                />
              </div>
              <div class="we-prop-row">
                <span class="we-prop-label">W</span>
                <input
                  :value="Math.round(groupBounds?.width ?? 0)"
                  type="number"
                  min="1"
                  class="we-num-input w-full"
                  @change="
                    (e: any) =>
                      applyGroupScale(Number(e.target.value), groupBounds?.height ?? 1)
                  "
                />
              </div>
              <div class="we-prop-row">
                <span class="we-prop-label">H</span>
                <input
                  :value="Math.round(groupBounds?.height ?? 0)"
                  type="number"
                  min="1"
                  class="we-num-input w-full"
                  @change="
                    (e: any) =>
                      applyGroupScale(groupBounds?.width ?? 1, Number(e.target.value))
                  "
                />
              </div>
              <div class="we-prop-row col-span-2">
                <span class="we-prop-label">Rotation</span>
                <input
                  v-model.number.lazy="groupRotationDelta"
                  type="number"
                  class="we-num-input w-full"
                />
              </div>
            </div>
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useGoogleFonts } from "~/composables/useGoogleFonts";

const { loadFont, loadTemplateFonts } = useGoogleFonts();

const props = defineProps<{
  guildId: string;
  channels: any[];
  channelsLoading: boolean;
}>();

const emit = defineEmits<{ (e: "saved"): void }>();
const toast = useToast();


// ── Types ──

interface TemplateElement {
  id: string;
  type:
    | "text"
    | "image"
    | "rect"
    | "circle"
    | "avatar"
    | "triangle"
    | "star"
    | "line";
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
  scaleX?: number;
  scaleY?: number;
  numPoints?: number;
  innerRadius?: number;
  outerRadius?: number;
  points?: number[];
  arrow?: boolean;
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

// ── Preset Templates ──

interface TemplatePreset {
  name: string;
  preview: string;
  template: WelcomeTemplate;
}

const PRESETS: TemplatePreset[] = [
  {
    name: "Classic",
    preview: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
    template: JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)),
  },
  {
    name: "Sunset",
    preview: "linear-gradient(135deg, #f12711, #f5af19)",
    template: {
      canvasWidth: 1024, canvasHeight: 500, backgroundColor: "#1a0a00",
      elements: [
        { id: "bg-overlay", type: "rect", x: 0, y: 0, width: 1024, height: 500, fill: "linear-gradient(135deg, #1a0a00, #4a1a00, #1a0a00)", opacity: 1 },
        { id: "accent-top", type: "rect", x: 0, y: 0, width: 1024, height: 4, fill: "linear-gradient(90deg, #f12711, #f5af19, #f12711)", opacity: 1 },
        { id: "avatar", type: "avatar", x: 512, y: 155, radius: 80, borderColor: "#f5af19", borderWidth: 4 },
        { id: "welcome-label", type: "text", x: 512, y: 280, text: "WELCOME", fontSize: 44, fontFamily: "sans-serif", fontStyle: "bold", fill: "#ffffff", align: "center" },
        { id: "username-text", type: "text", x: 512, y: 340, text: "{username}", fontSize: 30, fontFamily: "sans-serif", fill: "#f5af19", align: "center" },
        { id: "server-text", type: "text", x: 512, y: 395, text: "to {server_name}", fontSize: 20, fontFamily: "sans-serif", fill: "#d4a574", align: "center" },
        { id: "member-count", type: "text", x: 512, y: 450, text: "Member #{member_count}", fontSize: 16, fontFamily: "sans-serif", fill: "#8b6914", align: "center" },
      ],
    },
  },
  {
    name: "Neon",
    preview: "linear-gradient(135deg, #0a0a0a, #1a0033, #0a0a0a)",
    template: {
      canvasWidth: 1024, canvasHeight: 500, backgroundColor: "#0a0a0a",
      elements: [
        { id: "bg-overlay", type: "rect", x: 0, y: 0, width: 1024, height: 500, fill: "linear-gradient(135deg, #0a0a0a, #1a0033, #0a0a0a)", opacity: 1 },
        { id: "accent-top", type: "rect", x: 0, y: 0, width: 1024, height: 3, fill: "linear-gradient(90deg, #00ff88, #00ccff, #ff00ff)", opacity: 1 },
        { id: "accent-bot", type: "rect", x: 0, y: 497, width: 1024, height: 3, fill: "linear-gradient(90deg, #ff00ff, #00ccff, #00ff88)", opacity: 1 },
        { id: "avatar", type: "avatar", x: 512, y: 155, radius: 80, borderColor: "#00ccff", borderWidth: 4 },
        { id: "welcome-label", type: "text", x: 512, y: 280, text: "WELCOME", fontSize: 44, fontFamily: "sans-serif", fontStyle: "bold", fill: "#00ff88", align: "center" },
        { id: "username-text", type: "text", x: 512, y: 340, text: "{username}", fontSize: 30, fontFamily: "sans-serif", fill: "#00ccff", align: "center" },
        { id: "server-text", type: "text", x: 512, y: 395, text: "to {server_name}", fontSize: 20, fontFamily: "sans-serif", fill: "#cc66ff", align: "center" },
        { id: "member-count", type: "text", x: 512, y: 450, text: "Member #{member_count}", fontSize: 16, fontFamily: "sans-serif", fill: "#555577", align: "center" },
      ],
    },
  },
  {
    name: "Minimal",
    preview: "linear-gradient(135deg, #18181b, #27272a)",
    template: {
      canvasWidth: 1024, canvasHeight: 500, backgroundColor: "#18181b",
      elements: [
        { id: "avatar", type: "avatar", x: 512, y: 175, radius: 70, borderColor: "#3f3f46", borderWidth: 3 },
        { id: "username-text", type: "text", x: 512, y: 300, text: "{username}", fontSize: 32, fontFamily: "sans-serif", fontStyle: "bold", fill: "#fafafa", align: "center" },
        { id: "server-text", type: "text", x: 512, y: 360, text: "joined {server_name}", fontSize: 18, fontFamily: "sans-serif", fill: "#71717a", align: "center" },
      ],
    },
  },
];

// ── State ──

const template = ref<WelcomeTemplate>(
  JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)),
);
const selectedElementIds = ref<Set<string>>(new Set());
const selectedElementId = computed(() =>
  selectedElementIds.value.size === 1 ? [...selectedElementIds.value][0]! : null,
);
const saving = ref(false);
const stageRef = ref<any>(null);
const textFieldRef = ref<HTMLTextAreaElement | null>(null);
const transformerRef = ref<any>(null);
const canvasWrap = ref<HTMLElement | null>(null);
const zoomMultiplier = ref(1);
const isSpaceHeld = ref(false);
const isPanning = ref(false);
const bgUploading = ref(false);
const bgImageObj = ref<HTMLImageElement | null>(null);
const bgImageFile = ref<File | null>(null);

// ── Background Image ──

function loadBgImage(url: string) {
  if (!url) {
    bgImageObj.value = null;
    return;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    bgImageObj.value = img;
  };
  img.onerror = () => {
    bgImageObj.value = null;
  };
  img.src = url;
}

watch(
  () => template.value.backgroundImage,
  (url) => loadBgImage(url || ""),
  { immediate: true },
);

async function uploadBgImage(file: File) {
  // Immediately preview via data URL
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    if (dataUrl) loadBgImage(dataUrl);
  };
  reader.readAsDataURL(file);

  // Upload to server for persistent URL
  bgUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("guild_id", props.guildId);
    const res = await fetch("/api/welcome/upload-bg", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.statusMessage || "Upload failed");
    }
    const { url } = await res.json();
    template.value.backgroundImage = url;
    toast.add({
      title: "Background uploaded",
      description: "Background image set. Remember to save.",
      color: "success",
    });
  } catch (err: any) {
    toast.add({
      title: "Upload failed",
      description: err?.message || "Could not upload image.",
      color: "error",
    });
  } finally {
    bgUploading.value = false;
    bgImageFile.value = null;
  }
}

watch(bgImageFile, (file) => {
  if (file) uploadBgImage(file);
});

function removeBgImage() {
  template.value.backgroundImage = undefined;
  bgImageObj.value = null;
}

function applyPreset(preset: TemplatePreset) {
  const channelId = template.value.channelId;
  const bgImage = template.value.backgroundImage;
  template.value = JSON.parse(JSON.stringify(preset.template));
  // Preserve channel selection and background image
  if (channelId) template.value.channelId = channelId;
  if (bgImage) template.value.backgroundImage = bgImage;
  selectedElementIds.value = new Set();
}

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
    type: "triangle" as const,
    icon: "i-heroicons-play",
    label: "Triangle",
    color: "text-amber-400",
  },
  {
    type: "star" as const,
    icon: "i-heroicons-star",
    label: "Star",
    color: "text-yellow-400",
  },
  {
    type: "line" as const,
    icon: "i-heroicons-minus",
    label: "Line / Arrow",
    color: "text-lime-400",
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
  const baseScale = Math.min(sw, sh, 1);
  return baseScale * zoomMultiplier.value;
});

const selectedElement = computed(() => {
  if (!selectedElementId.value) return null;
  return (
    template.value.elements.find((el) => el.id === selectedElementId.value) ||
    null
  );
});

function swatchPreview(value?: string): string {
  return value || "#ffffff";
}

const selectedElementOpacityPct = computed({
  get: () => Math.round((selectedElement.value?.opacity ?? 1) * 100),
  set: (v: number) => {
    if (selectedElement.value) selectedElement.value.opacity = v / 100;
  },
});

// ── Transformer ──

const transformerNodes = computed(() => {
  if (!stageRef.value || selectedElementIds.value.size === 0) return [];
  try {
    const stage = stageRef.value.getNode();
    if (!stage) return [];
    return [...selectedElementIds.value]
      .filter(
        (id) => template.value.elements.find((el) => el.id === id)?.type !== "line",
      )
      .map((id) => stage.findOne(`.${id}`))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  } catch {
    return [];
  }
});

const hoveredElementId = ref<string | null>(null);

const hoveredElementRect = computed(() => {
  if (!hoveredElementId.value || hoveredElementId.value === selectedElementId.value)
    return null;
  if (!stageRef.value) return null;
  try {
    const stage = stageRef.value.getNode();
    if (!stage) return null;
    const node = stage.findOne(`.${hoveredElementId.value}`);
    if (!node) return null;
    return node.getClientRect({ relativeTo: stage });
  } catch {
    return null;
  }
});

const groupBounds = ref<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null>(null);
const groupRotationInput = ref(0);

function getElementRect(
  id: string,
): { x: number; y: number; width: number; height: number } | null {
  if (!stageRef.value) return null;
  try {
    const stage = stageRef.value.getNode();
    if (!stage) return null;
    const node = stage.findOne(`.${id}`);
    if (!node) return null;
    return node.getClientRect({ relativeTo: stage });
  } catch {
    return null;
  }
}

function recomputeGroupBounds() {
  if (selectedElementIds.value.size <= 1) {
    groupBounds.value = null;
    return;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const id of selectedElementIds.value) {
    const rect = getElementRect(id);
    if (!rect) continue;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  groupBounds.value = isFinite(minX)
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : null;
}

watch(
  [selectedElementIds, () => template.value.elements],
  async () => {
    await nextTick();
    recomputeGroupBounds();
  },
  { deep: true, immediate: true },
);

watch(selectedElementIds, () => {
  groupRotationInput.value = 0;
});

const groupRotationDelta = computed({
  get: () => groupRotationInput.value,
  set: (deg: number) => {
    const bounds = groupBounds.value;
    if (!bounds) return;
    const delta = deg - groupRotationInput.value;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rad = (delta * Math.PI) / 180;
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    for (const id of selectedElementIds.value) {
      const el = template.value.elements.find((e) => e.id === id);
      if (!el) continue;
      const relX = el.x - cx,
        relY = el.y - cy;
      el.x = Math.round(cx + relX * cos - relY * sin);
      el.y = Math.round(cy + relX * sin + relY * cos);
      el.rotation = Math.round(((el.rotation ?? 0) + delta + 360) % 360);
    }
    groupRotationInput.value = deg;
  },
});

function applyGroupMove(newX: number, newY: number) {
  const bounds = groupBounds.value;
  if (!bounds) return;
  const dx = newX - bounds.x;
  const dy = newY - bounds.y;
  for (const id of selectedElementIds.value) {
    const el = template.value.elements.find((e) => e.id === id);
    if (!el) continue;
    el.x = Math.round(el.x + dx);
    el.y = Math.round(el.y + dy);
  }
}

const alignmentBounds = computed(() => {
  if (selectedElementIds.value.size >= 2) return groupBounds.value;
  if (selectedElementIds.value.size === 1) {
    return {
      x: 0,
      y: 0,
      width: template.value.canvasWidth,
      height: template.value.canvasHeight,
    };
  }
  return null;
});

type AlignDirection = "left" | "center-h" | "right" | "top" | "middle-v" | "bottom";

function alignLayers(direction: AlignDirection) {
  const bounds = alignmentBounds.value;
  if (!bounds) return;
  for (const id of selectedElementIds.value) {
    const rect = getElementRect(id);
    const el = template.value.elements.find((e) => e.id === id);
    if (!rect || !el) continue;
    let dx = 0,
      dy = 0;
    switch (direction) {
      case "left":
        dx = bounds.x - rect.x;
        break;
      case "center-h":
        dx = bounds.x + bounds.width / 2 - (rect.x + rect.width / 2);
        break;
      case "right":
        dx = bounds.x + bounds.width - (rect.x + rect.width);
        break;
      case "top":
        dy = bounds.y - rect.y;
        break;
      case "middle-v":
        dy = bounds.y + bounds.height / 2 - (rect.y + rect.height / 2);
        break;
      case "bottom":
        dy = bounds.y + bounds.height - (rect.y + rect.height);
        break;
    }
    el.x = Math.round(el.x + dx);
    el.y = Math.round(el.y + dy);
  }
}

function distributeLayers(axis: "horizontal" | "vertical") {
  const ids = [...selectedElementIds.value];
  if (ids.length < 3) return;

  const items: {
    id: string;
    el: TemplateElement;
    rect: { x: number; y: number; width: number; height: number };
  }[] = [];
  for (const id of ids) {
    const el = template.value.elements.find((e) => e.id === id);
    const rect = getElementRect(id);
    if (el && rect) items.push({ id, el, rect });
  }
  if (items.length < 3) return;

  const key = axis === "horizontal" ? "x" : "y";
  const sizeKey = axis === "horizontal" ? "width" : "height";
  items.sort((a, b) => a.rect[key] - b.rect[key]);

  const first = items[0]!;
  const last = items[items.length - 1]!;
  const totalSpan = last.rect[key] + last.rect[sizeKey] - first.rect[key];
  const totalSize = items.reduce((sum, i) => sum + i.rect[sizeKey], 0);
  const gap = (totalSpan - totalSize) / (items.length - 1);

  let cursor = first.rect[key] + first.rect[sizeKey] + gap;
  for (let i = 1; i < items.length - 1; i++) {
    const item = items[i]!;
    const { el, rect } = item;
    const delta = Math.round(cursor - rect[key]);
    if (axis === "horizontal") el.x = Math.round(el.x + delta);
    else el.y = Math.round(el.y + delta);
    cursor += rect[sizeKey] + gap;
  }
}

function scaleElementSize(el: TemplateElement, sx: number, sy: number) {
  switch (el.type) {
    case "rect":
    case "image":
      el.width = Math.round(Math.max(5, (el.width ?? 100) * sx));
      el.height = Math.round(Math.max(5, (el.height ?? 100) * sy));
      break;
    case "circle":
    case "triangle":
    case "star":
      el.scaleX = (el.scaleX ?? 1) * sx;
      el.scaleY = (el.scaleY ?? 1) * sy;
      break;
    case "avatar":
      el.radius = Math.round(Math.max(5, (el.radius ?? 64) * ((sx + sy) / 2)));
      break;
    case "text":
      el.fontSize = Math.round(Math.max(6, (el.fontSize ?? 24) * ((sx + sy) / 2)));
      break;
    case "line":
      el.points = (el.points ?? [-60, 0, 60, 0]).map((p, i) =>
        Math.round(i % 2 === 0 ? p * sx : p * sy),
      );
      break;
  }
}

function applyGroupScale(newWidth: number, newHeight: number) {
  const bounds = groupBounds.value;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
  const sx = Math.max(0.01, newWidth) / bounds.width;
  const sy = Math.max(0.01, newHeight) / bounds.height;
  const originX = bounds.x;
  const originY = bounds.y;
  for (const id of selectedElementIds.value) {
    const el = template.value.elements.find((e) => e.id === id);
    if (!el) continue;
    el.x = Math.round(originX + (el.x - originX) * sx);
    el.y = Math.round(originY + (el.y - originY) * sy);
    scaleElementSize(el, sx, sy);
  }
}

watch(selectedElementIds, async () => {
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
  const w = el.width || 100;
  const h = el.height || 100;
  return {
    x: el.x,
    y: el.y,
    width: w,
    height: h,
    ...gradientFillProps(el.fill, 0, 0, w, h, "#ffffff"),
    cornerRadius: el.cornerRadius || 0,
    opacity: el.opacity ?? 1,
    ...gradientStrokeProps(el.stroke, 0, 0, w, h),
    strokeWidth: el.strokeWidth || 0,
    rotation: el.rotation || 0,
    draggable: true,
    name: el.id,
  };
}

function circleConfig(el: TemplateElement) {
  const r = el.radius || 50;
  return {
    x: el.x,
    y: el.y,
    radius: r,
    ...gradientFillProps(el.fill, -r, -r, r, r, "#ffffff"),
    opacity: el.opacity ?? 1,
    ...gradientStrokeProps(el.stroke, -r, -r, r, r),
    strokeWidth: el.strokeWidth || 0,
    rotation: el.rotation ?? 0,
    scaleX: el.scaleX ?? 1,
    scaleY: el.scaleY ?? 1,
    draggable: true,
    name: el.id,
  };
}

function triangleConfig(el: TemplateElement) {
  const r = el.radius || 50;
  return {
    x: el.x,
    y: el.y,
    sides: 3,
    radius: r,
    ...gradientFillProps(el.fill, -r, -r, r, r, "#374151"),
    opacity: el.opacity ?? 1,
    ...gradientStrokeProps(el.stroke, -r, -r, r, r),
    strokeWidth: el.strokeWidth || 0,
    rotation: el.rotation ?? 0,
    scaleX: el.scaleX ?? 1,
    scaleY: el.scaleY ?? 1,
    draggable: true,
    name: el.id,
  };
}

function starConfig(el: TemplateElement) {
  const r = el.outerRadius || 50;
  return {
    x: el.x,
    y: el.y,
    numPoints: el.numPoints || 5,
    innerRadius: el.innerRadius || 25,
    outerRadius: r,
    ...gradientFillProps(el.fill, -r, -r, r, r, "#374151"),
    opacity: el.opacity ?? 1,
    ...gradientStrokeProps(el.stroke, -r, -r, r, r),
    strokeWidth: el.strokeWidth || 0,
    rotation: el.rotation ?? 0,
    scaleX: el.scaleX ?? 1,
    scaleY: el.scaleY ?? 1,
    draggable: true,
    name: el.id,
  };
}

function lineConfig(el: TemplateElement) {
  return {
    x: el.x,
    y: el.y,
    points: el.points || [-60, 0, 60, 0],
    stroke: el.stroke || "#e4e4e7",
    strokeWidth: el.strokeWidth || 3,
    opacity: el.opacity ?? 1,
    rotation: el.rotation ?? 0,
    draggable: true,
    name: el.id,
  };
}

function textConfig(el: TemplateElement) {
  const family = el.fontFamily || "sans-serif";
  return {
    x: el.x,
    y: el.y,
    offsetX: el.align === "center" ? 200 : el.align === "right" ? 400 : 0,
    offsetY: (el.fontSize || 24) / 2,
    width: 400,
    text: previewText(el.text || ""),
    fontSize: el.fontSize || 24,
    fontFamily: family,
    fontStyle: el.fontStyle || "",
    fill: el.fill || "#ffffff",
    align: el.align || "center",
    opacity: el.opacity ?? 1,
    rotation: el.rotation ?? 0,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth || 0,
    draggable: true,
    name: el.id,
  };
}

// ── Helpers ──

function gradientFillProps(
  fill: string | undefined,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  defaultColor: string,
) {
  const type = gradientType(fill);
  if (!type) return { fill: fill || defaultColor };

  const stops = parseGradientStops(fill!);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  if (type === "linear") {
    const angle = parseGradientAngle(fill!);
    const rad = (angle * Math.PI) / 180;
    const hw = (maxX - minX) / 2;
    const hh = (maxY - minY) / 2;
    return {
      fill: undefined,
      fillLinearGradientStartPoint: {
        x: cx - Math.cos(rad) * hw,
        y: cy - Math.sin(rad) * hh,
      },
      fillLinearGradientEndPoint: {
        x: cx + Math.cos(rad) * hw,
        y: cy + Math.sin(rad) * hh,
      },
      fillLinearGradientColorStops: stops,
    };
  }

  const r = Math.max(maxX - minX, maxY - minY) / 2;
  return {
    fill: undefined,
    fillRadialGradientStartPoint: { x: cx, y: cy },
    fillRadialGradientEndPoint: { x: cx, y: cy },
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndRadius: r,
    fillRadialGradientColorStops: stops,
  };
}

function gradientStrokeProps(
  stroke: string | undefined,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  const type = gradientType(stroke);
  if (!type) return { stroke };

  const stops = parseGradientStops(stroke!);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  if (type === "linear") {
    const angle = parseGradientAngle(stroke!);
    const rad = (angle * Math.PI) / 180;
    const hw = (maxX - minX) / 2;
    const hh = (maxY - minY) / 2;
    return {
      stroke: undefined,
      strokeLinearGradientStartPoint: {
        x: cx - Math.cos(rad) * hw,
        y: cy - Math.sin(rad) * hh,
      },
      strokeLinearGradientEndPoint: {
        x: cx + Math.cos(rad) * hw,
        y: cy + Math.sin(rad) * hh,
      },
      strokeLinearGradientColorStops: stops,
    };
  }

  const r = Math.max(maxX - minX, maxY - minY) / 2;
  return {
    stroke: undefined,
    strokeRadialGradientStartPoint: { x: cx, y: cy },
    strokeRadialGradientEndPoint: { x: cx, y: cy },
    strokeRadialGradientStartRadius: 0,
    strokeRadialGradientEndRadius: r,
    strokeRadialGradientColorStops: stops,
  };
}

function previewText(t: string): string {
  return t
    .replace(/\{username\}/g, "NewUser")
    .replace(/\{displayname\}/g, "New User")
    .replace(/\{tag\}/g, "NewUser#0001")
    .replace(/\{server_name\}/g, "My Server")
    .replace(/\{member_count\}/g, "42");
}

function elementLabel(el: TemplateElement): string {
  return el.type === "text"
    ? (el.text || "Text").substring(0, 16)
    : el.type.charAt(0).toUpperCase() + el.type.slice(1);
}

function elementTypeIcon(type: string): string {
  const map: Record<string, string> = {
    text: "i-heroicons-bars-3-bottom-left",
    rect: "i-heroicons-stop",
    circle: "i-heroicons-sun",
    avatar: "i-heroicons-user-circle",
    image: "i-heroicons-photo",
    triangle: "i-heroicons-play",
    star: "i-heroicons-star",
    line: "i-heroicons-minus",
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
    triangle: {
      type: "triangle",
      x: cx,
      y: cy,
      radius: 50,
      fill: "#374151",
      opacity: 1,
    },
    star: {
      type: "star",
      x: cx,
      y: cy,
      numPoints: 5,
      innerRadius: 25,
      outerRadius: 50,
      fill: "#374151",
      opacity: 1,
    },
    line: {
      type: "line",
      x: cx,
      y: cy,
      points: [-60, 0, 60, 0],
      stroke: "#e4e4e7",
      strokeWidth: 3,
      opacity: 1,
      arrow: false,
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
  selectedElementIds.value = new Set([id]);
}

function insertPlaceholder(ph: string) {
  if (!selectedElement.value || selectedElement.value.type !== "text") return;
  const el = textFieldRef.value;
  const current = selectedElement.value.text || "";
  if (el) {
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    selectedElement.value.text =
      current.slice(0, start) + ph + current.slice(end);
    nextTick(() => {
      el.focus();
      const pos = start + ph.length;
      el.setSelectionRange(pos, pos);
    });
  } else {
    selectedElement.value.text = current + ph;
  }
}

function deleteSelectedElement() {
  if (selectedElementIds.value.size === 0) return;
  template.value.elements = template.value.elements.filter(
    (el) => !selectedElementIds.value.has(el.id),
  );
  selectedElementIds.value = new Set();
}

function duplicateSelectedElement() {
  if (selectedElementIds.value.size === 0) return;
  const newIds = new Set<string>();
  for (const id of selectedElementIds.value) {
    const src = template.value.elements.find((el) => el.id === id);
    if (!src) continue;
    elementCounter++;
    const newEl: TemplateElement = {
      ...JSON.parse(JSON.stringify(src)),
      id: `${src.type}-${Date.now()}-${elementCounter}`,
      x: src.x + 20,
      y: src.y + 20,
    };
    template.value.elements.push(newEl);
    newIds.add(newEl.id);
  }
  selectedElementIds.value = newIds;
}

function moveLayer(direction: 'up' | 'down') {
  if (!selectedElementId.value) return;
  const els = template.value.elements;
  const i = els.findIndex((el) => el.id === selectedElementId.value);
  if (i === -1) return;
  // 'up' in layer panel = higher index (rendered later = on top)
  const target = direction === 'up' ? i + 1 : i - 1;
  if (target < 0 || target >= els.length) return;
  [els[i], els[target]] = [els[target], els[i]];
}

function selectElement(id: string, e?: MouseEvent) {
  if (e?.shiftKey || e?.ctrlKey || e?.metaKey) {
    const next = new Set(selectedElementIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedElementIds.value = next;
  } else {
    selectedElementIds.value = new Set([id]);
  }
}

// ── Font Change Handler ──

async function handleFontChange(family: string) {
  if (!selectedElement.value) return;
  selectedElement.value.fontFamily = family;
  await loadFont(family);
  stageRef.value?.getNode()?.batchDraw();
}

// ── Keyboard Shortcuts ──

function handleKeyDown(e: KeyboardEvent) {
  // Don't intercept when typing in an input, or when a focused control
  // needs Space for its own native activation (buttons, contenteditable)
  const target = e.target as HTMLElement;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable ||
    target.closest('button, [role="button"]')
  ) {
    return;
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelectedElement();
  }
  if (e.key === ' ' && !isSpaceHeld.value) {
    e.preventDefault();
    isSpaceHeld.value = true;
    stageRef.value?.getNode()?.listening(false);
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.key === ' ') {
    isSpaceHeld.value = false;
    isPanning.value = false;
    stageRef.value?.getNode()?.listening(true);
  }
}

function handleWindowBlur() {
  isSpaceHeld.value = false;
  isPanning.value = false;
  stageRef.value?.getNode()?.listening(true);
}

let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };

function handlePanStart(e: MouseEvent) {
  if (e.button !== 0 || !isSpaceHeld.value || !canvasWrap.value) return;
  isPanning.value = true;
  panStart = {
    x: e.clientX,
    y: e.clientY,
    scrollLeft: canvasWrap.value.scrollLeft,
    scrollTop: canvasWrap.value.scrollTop,
  };
}

function handlePanMove(e: MouseEvent) {
  if (!isPanning.value || !canvasWrap.value) return;
  if (e.buttons === 0) {
    handlePanEnd();
    return;
  }
  canvasWrap.value.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x);
  canvasWrap.value.scrollTop = panStart.scrollTop - (e.clientY - panStart.y);
}

function handlePanEnd() {
  isPanning.value = false;
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleWindowBlur);
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('blur', handleWindowBlur);
});

// ── Drag / Transform ──

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

function handleWheelZoom(e: WheelEvent) {
  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  zoomMultiplier.value = Math.min(
    ZOOM_MAX,
    Math.max(ZOOM_MIN, Math.round((zoomMultiplier.value + delta) * 100) / 100),
  );
}

function handleStageClick(e: any) {
  if (e.target === e.target.getStage()) selectedElementIds.value = new Set();
}

function handleDragStart(e: any, el: TemplateElement) {
  if (!selectedElementIds.value.has(el.id)) {
    selectedElementIds.value = new Set([el.id]);
  }
}

function moveOtherSelectedElements(
  movedEl: TemplateElement,
  newX: number,
  newY: number,
) {
  if (
    selectedElementIds.value.size <= 1 ||
    !selectedElementIds.value.has(movedEl.id)
  )
    return;
  const dx = newX - movedEl.x;
  const dy = newY - movedEl.y;
  for (const id of selectedElementIds.value) {
    if (id === movedEl.id) continue;
    const el = template.value.elements.find((e) => e.id === id);
    if (!el) continue;
    el.x = Math.round(el.x + dx);
    el.y = Math.round(el.y + dy);
  }
}

function handleDragEnd(e: any, el: TemplateElement) {
  const newX = Math.round(e.target.x());
  const newY = Math.round(e.target.y());
  moveOtherSelectedElements(el, newX, newY);
  el.x = newX;
  el.y = newY;
}

function handleLineHandleDrag(e: any, el: TemplateElement, pointIndex: number) {
  const pts = el.points ? [...el.points] : [-60, 0, 60, 0];
  pts[pointIndex] = Math.round(e.target.x() - el.x);
  pts[pointIndex + 1] = Math.round(e.target.y() - el.y);
  el.points = pts;
}

function handleTextDragEnd(e: any, el: TemplateElement) {
  const newX = Math.round(e.target.x());
  const newY = Math.round(e.target.y());
  moveOtherSelectedElements(el, newX, newY);
  el.x = newX;
  el.y = newY;
}

function handleTransformEnd(e: any, el: TemplateElement) {
  const node = e.target;
  el.x = Math.round(node.x());
  el.y = Math.round(node.y());
  el.rotation = Math.round(node.rotation());
  if (el.type === "rect" || el.type === "image" || el.type === "text") {
    el.width = Math.round(Math.max(5, node.width() * node.scaleX()));
    el.height = Math.round(Math.max(5, node.height() * node.scaleY()));
    node.scaleX(1);
    node.scaleY(1);
  } else if (el.type === "avatar") {
    el.radius = Math.round(
      Math.max(5, (el.radius || 64) * ((node.scaleX() + node.scaleY()) / 2)),
    );
    node.scaleX(1);
    node.scaleY(1);
  } else {
    el.scaleX = node.scaleX();
    el.scaleY = node.scaleY();
  }
}

function resetTemplate() {
  template.value = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
  selectedElementIds.value = new Set();
}

// ── Load / Save ──

async function loadTemplate() {
  try {
    const cfg = await $fetch<{
      enabled: boolean;
      settings: Record<string, any>;
    }>(
      `/api/guild-configs/${encodeURIComponent(
        props.guildId,
      )}/${encodeURIComponent("welcome")}`,
    );
    if (cfg.settings && Object.keys(cfg.settings).length > 0) {
      template.value = {
        ...JSON.parse(JSON.stringify(DEFAULT_TEMPLATE)),
        ...cfg.settings,
      };
    }
  } catch (err) {
    console.error("[WelcomeEditor] load error:", err);
  }
}

async function saveTemplate() {
  saving.value = true;
  try {
    await $fetch(
      `/api/guild-configs/${encodeURIComponent(
        props.guildId,
      )}/${encodeURIComponent("welcome")}`,
      {
        method: "PUT",
        body: { settings: template.value },
      },
    );
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
  loadTemplate().then(async () => {
    // Load Google Fonts used in the template, then repaint once every
    // one of them is actually ready to draw (fixes flash-of-fallback).
    await loadTemplateFonts(template.value.elements);
    stageRef.value?.getNode()?.batchDraw();
  });
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

/* ── Glass surface (matches app/assets/css/main.css .glass-card, minus `overflow`
   so it composes safely with panels that need overflow-y-auto) ── */
.we-glass-panel {
  background: rgba(20, 20, 26, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* ── Toolbar ── */
.we-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  height: 44px;
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
  font-size: 11px;
  color: #a1a1aa;
  font-weight: 600;
  letter-spacing: 0.02em;
  min-width: 14px;
  text-align: right;
}
.we-panel-label {
  font-size: 11px;
  font-weight: 600;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Inputs ── */
.we-num-input {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #d4d4d8;
  font-size: 14px;
  padding: 6px 8px;
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
  border-radius: 6px;
  color: #d4d4d8;
  font-size: 13px;
  padding: 6px 8px;
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
  border-radius: 6px;
  color: #d4d4d8;
  font-size: 14px;
  padding: 6px 8px;
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
  border-radius: 6px;
  color: #d4d4d8;
  font-size: 14px;
  padding: 6px 8px;
  outline: none;
}

/* ── Buttons ── */
.we-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: #a1a1aa;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.we-tool-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
}
.we-tool-btn-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: #71717a;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.we-tool-btn-sm:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
}
.we-tool-btn-sm[aria-disabled='true'] {
  opacity: 0.35;
  cursor: not-allowed;
}
.we-tool-btn-sm[aria-disabled='true']:hover {
  background: transparent;
  color: #71717a;
}
.we-tool-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.15s;
  color: #e4e4e7;
}
.we-tool-row:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
}

/* ── Color Chips ── */
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
  padding: 6px 6px;
  border-radius: 8px;
  font-size: 12px;
  color: #a1a1aa;
  background: transparent;
  border: 1px solid transparent;
  border-left-width: 3px;
  cursor: pointer;
  transition: all 0.1s;
}
.we-layer:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #d4d4d8;
}
.we-layer-active {
  background: rgba(124, 110, 246, 0.22);
  border-color: rgba(124, 110, 246, 0.5);
  border-left-color: #7c6ef6;
  color: #e4e4e7;
  font-weight: 500;
}

/* ── Property Sections ── */
.we-prop-section {
  padding: 8px 10px;
  border-bottom: 1px solid #2a2a2a;
}
.we-prop-title {
  font-size: 11px;
  font-weight: 600;
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.we-prop-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.we-placeholder-chip {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(139, 92, 246, 0.1);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.2);
  cursor: pointer;
  transition: all 0.15s;
}
.we-placeholder-chip:hover {
  background: rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.4);
}
.we-prop-label {
  font-size: 11px;
  color: #a1a1aa;
  font-weight: 600;
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
  appearance: textfield;
}

/* ── Preset Buttons ── */
.we-preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.15s;
  color: #a1a1aa;
}
.we-preset-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
  color: #e4e4e7;
}
.we-preset-swatch {
  width: 100%;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
