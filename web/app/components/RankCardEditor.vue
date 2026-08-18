<template>
  <div class="rce font-sans flex flex-col h-full select-none">
    <!-- TOP TOOLBAR -->
    <div class="rce-toolbar rce-glass-panel rounded-2xl">
      <!-- Canvas Dimensions Popover -->
      <div class="rce-toolbar-group">
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
                <p class="rce-prop-label mb-1">Width</p>
                <UInputNumber
                  v-model="template.canvasWidth"
                  :min="200"
                  :max="1920"
                  size="sm"
                  class="w-full"
                />
              </div>
              <div>
                <p class="rce-prop-label mb-1">Height</p>
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

      <div class="rce-toolbar-sep" />

      <!-- Background Color & Image -->
      <div class="rce-toolbar-group">
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
                <p class="rce-prop-label mb-1.5">Color</p>
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
                <p class="rce-prop-label mb-1.5">Image</p>
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

      <div class="rce-toolbar-sep" />

      <!-- Zoom Controls -->
      <div class="rce-toolbar-group">
        <span class="rce-label">Zoom</span>
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

      <!-- Undo / Redo / Reset / Save -->
      <div class="rce-toolbar-group">
        <UTooltip text="Undo (Ctrl+Z)">
          <UButton
            icon="i-heroicons-arrow-uturn-left"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Undo"
            :disabled="!canUndo"
            @click="undo"
          />
        </UTooltip>
        <UTooltip text="Redo (Ctrl+Shift+Z)">
          <UButton
            icon="i-heroicons-arrow-uturn-right"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Redo"
            :disabled="!canRedo"
            @click="redo"
          />
        </UTooltip>
        <UTooltip text="Reset">
          <UButton
            icon="i-heroicons-arrow-path"
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
    <div class="flex-1 flex min-h-0 gap-px bg-slate-950/80">
      <!-- LEFT PANEL: Presets, Tools + Layers -->
      <div class="w-72 shrink-0 flex flex-col rce-glass-panel rounded-2xl">
        <!-- Preset Themes -->
        <div class="p-2 border-b border-white/10">
          <p class="rce-panel-label mb-2">Presets</p>
          <div class="grid grid-cols-2 gap-1">
            <UTooltip
              v-for="preset in PRESETS"
              :key="preset.name"
              :text="preset.name"
            >
              <button
                class="rce-preset-btn"
                @click="applyPreset(preset)"
              >
                <div
                  class="rce-preset-swatch"
                  :style="{ background: preset.preview }"
                />
                <span class="text-[9px] truncate text-zinc-300">{{ preset.name }}</span>
              </button>
            </UTooltip>
          </div>
        </div>

        <!-- Add Element Tools -->
        <div class="p-2 border-b border-white/10">
          <p class="rce-panel-label mb-2">Tools</p>
          <div class="flex flex-col gap-1.5">
            <button
              v-for="t in toolTypes"
              :key="t.type"
              class="rce-tool-row"
              @click="t.type === 'image' ? imageUploadInput?.click() : addElement(t.type)"
            >
              <UIcon :name="t.icon" class="text-lg shrink-0" :class="t.color" />
              <span class="text-sm font-medium">{{ t.label }}</span>
            </button>
          </div>
          <input
            ref="imageUploadInput"
            type="file"
            accept="image/*"
            class="sr-only"
            @change="handleImageFileSelection"
            @cancel="replacingImageId = null"
          />
        </div>

        <!-- Layers List -->
        <div class="flex-1 flex flex-col min-h-0">
          <div class="flex items-center justify-between p-2 border-b border-white/10">
            <p class="rce-panel-label">Layers</p>
            <div class="flex items-center gap-1">
              <UTooltip text="Move up">
                <button
                  class="rce-tool-btn-sm"
                  :aria-disabled="selectedElementIds.size !== 1"
                  aria-label="Move up"
                  @click="moveLayer('up')"
                >
                  <UIcon name="i-heroicons-chevron-up" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Move down">
                <button
                  class="rce-tool-btn-sm"
                  :aria-disabled="selectedElementIds.size !== 1"
                  aria-label="Move down"
                  @click="moveLayer('down')"
                >
                  <UIcon name="i-heroicons-chevron-down" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Duplicate">
                <button
                  class="rce-tool-btn-sm"
                  :aria-disabled="selectedElementIds.size === 0"
                  aria-label="Duplicate"
                  @click="duplicateSelectedElement"
                >
                  <UIcon name="i-heroicons-document-duplicate" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Delete">
                <button
                  class="rce-tool-btn-sm text-red-400 hover:text-red-300"
                  :aria-disabled="selectedElementIds.size === 0"
                  aria-label="Delete"
                  @click="deleteSelectedElement"
                >
                  <UIcon name="i-heroicons-trash" class="text-sm" />
                </button>
              </UTooltip>
              <span class="text-[10px] text-zinc-500 tabular-nums ml-1">
                {{ template.elements.length }}
              </span>
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
              class="rce-layer"
              :class="{ 'rce-layer-active': selectedElementIds.has(el.id) }"
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
              <span class="text-[9px] text-zinc-600 tabular-nums">
                {{ template.elements.length - index }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- CENTER: Interactive Konva Canvas -->
      <div
        class="flex-1 flex [align-items:safe_center] [justify-content:safe_center] bg-[#131722] overflow-auto relative"
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
            class="text-2xl text-indigo-400/60 mb-2"
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
            class="relative z-10 shadow-2xl shadow-black/80 ring-1 ring-white/10 rounded-xl overflow-hidden"
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
                <!-- Background Rect -->
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

                <!-- Elements Loop -->
                <template v-for="el in template.elements" :key="el.id">
                  <!-- Progress Bar -->
                  <v-group
                    v-if="el.type === 'progressbar'"
                    :config="{
                      x: el.x,
                      y: el.y,
                      rotation: el.rotation || 0,
                      draggable: true,
                      name: el.id,
                    }"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  >
                    <!-- Track -->
                    <v-rect
                      :config="{
                        x: 0,
                        y: 0,
                        width: el.width || 500,
                        height: el.height || 18,
                        cornerRadius: el.cornerRadius || 9,
                        fill: el.trackColor || 'rgba(255, 255, 255, 0.08)',
                        stroke: el.trackBorderColor,
                        strokeWidth: el.trackBorderWidth || 0,
                        shadowColor: el.shadowColor,
                        shadowBlur: el.shadowBlur,
                        shadowOffsetX: el.shadowOffsetX,
                        shadowOffsetY: el.shadowOffsetY,
                        opacity: el.opacity ?? 1,
                      }"
                    />
                    <!-- Fill (65% sample preview progress) -->
                    <v-rect
                      :config="{
                        x: 0,
                        y: 0,
                        width: (el.width || 500) * 0.65,
                        height: el.height || 18,
                        cornerRadius: el.cornerRadius || 9,
                        ...gradientFillProps(el.fill, 0, 0, (el.width || 500) * 0.65, el.height || 18, '#6366f1'),
                        opacity: el.opacity ?? 1,
                      }"
                    />
                  </v-group>

                  <!-- Rectangle -->
                  <v-rect
                    v-if="el.type === 'rect'"
                    :config="rectConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />

                  <!-- Circle -->
                  <v-circle
                    v-if="el.type === 'circle'"
                    :config="circleConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />

                  <!-- Triangle -->
                  <v-regular-polygon
                    v-if="el.type === 'triangle'"
                    :config="triangleConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />

                  <!-- Star -->
                  <v-star
                    v-if="el.type === 'star'"
                    :config="starConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />

                  <!-- Line / Arrow -->
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
                    <!-- Interactive handles when selected -->
                    <template v-if="selectedElementId === el.id">
                      <v-circle
                        :config="{
                          x: el.x + (el.points?.[0] ?? -60),
                          y: el.y + (el.points?.[1] ?? 0),
                          radius: 6,
                          fill: '#6366f1',
                          stroke: '#0f172a',
                          strokeWidth: 1.5,
                          draggable: true,
                        }"
                        @dragmove="(e: any) => handleLineHandleDrag(e, el, 0)"
                      />
                      <v-circle
                        :config="{
                          x: el.x + (el.points?.[2] ?? 60),
                          y: el.y + (el.points?.[3] ?? 0),
                          radius: 6,
                          fill: '#6366f1',
                          stroke: '#0f172a',
                          strokeWidth: 1.5,
                          draggable: true,
                        }"
                        @dragmove="(e: any) => handleLineHandleDrag(e, el, 2)"
                      />
                    </template>
                  </template>

                  <!-- Custom Image Layer -->
                  <v-image
                    v-if="el.type === 'image' && imageObjects[el.id]"
                    :config="imageConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />

                  <!-- Text -->
                  <v-text
                    v-if="el.type === 'text'"
                    :config="textConfig(el)"
                    @dragstart="(e: any) => handleDragStart(e, el)"
                    @dragend="(e: any) => handleTextDragEnd(e, el)"
                    @click="(e: any) => selectElement(el.id, e.evt)"
                    @tap="(e: any) => selectElement(el.id, e.evt)"
                    @transformend="(e: any) => handleTransformEnd(e, el)"
                  />

                  <!-- Avatar Group -->
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
                    <template v-if="el.avatarShape === 'square'">
                      <v-rect
                        v-if="el.borderWidth"
                        :config="{
                          x: -(el.radius || 56) - (el.borderWidth || 0),
                          y: -(el.radius || 56) - (el.borderWidth || 0),
                          width: ((el.radius || 56) + (el.borderWidth || 0)) * 2,
                          height: ((el.radius || 56) + (el.borderWidth || 0)) * 2,
                          cornerRadius: el.avatarCornerRadius ?? 0,
                          fill: el.borderColor || '#818cf8',
                          opacity: el.opacity ?? 1,
                        }"
                      />
                      <v-rect
                        :config="{
                          x: -(el.radius || 56),
                          y: -(el.radius || 56),
                          width: (el.radius || 56) * 2,
                          height: (el.radius || 56) * 2,
                          cornerRadius: el.avatarCornerRadius ?? 0,
                          fill: '#4f46e5',
                          opacity: el.opacity ?? 1,
                          shadowColor: el.shadowColor,
                          shadowBlur: el.shadowBlur,
                        }"
                      />
                    </template>
                    <template v-else>
                      <v-circle
                        v-if="el.borderWidth"
                        :config="{
                          x: 0,
                          y: 0,
                          radius: (el.radius || 56) + (el.borderWidth || 0),
                          fill: el.borderColor || '#818cf8',
                          opacity: el.opacity ?? 1,
                        }"
                      />
                      <v-circle
                        :config="{
                          x: 0,
                          y: 0,
                          radius: el.radius || 56,
                          fill: '#4f46e5',
                          opacity: el.opacity ?? 1,
                          shadowColor: el.shadowColor,
                          shadowBlur: el.shadowBlur,
                        }"
                      />
                    </template>
                    <v-text
                      :config="{
                        x: -(el.radius || 56),
                        y: -(el.radius || 56) / 2,
                        width: (el.radius || 56) * 2,
                        text: '👤',
                        fontSize: (el.radius || 56) * 0.8,
                        align: 'center',
                      }"
                    />
                  </v-group>
                </template>

                <!-- Transformer -->
                <v-transformer
                  v-if="transformerNodes.length > 0"
                  ref="transformerRef"
                  :config="{
                    nodes: transformerNodes,
                    enabledAnchors:
                      selectedElement?.type === 'avatar'
                        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                        : selectedElement?.type === 'text'
                          ? ['middle-left', 'middle-right']
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
                      selectedElement?.type === 'avatar' || selectedElement?.type === 'image'
                        ? true
                        : selectedElementIds.size > 1
                          ? true
                          : selectedElement?.type !== 'circle',
                    shiftBehavior:
                      selectedElement?.type === 'image' ? 'inverted' : 'default',
                    rotateEnabled: true,
                    rotationSnaps: isShiftHeld
                      ? [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]
                      : [],
                    borderStroke: '#6366f1',
                    borderStrokeWidth: 2,
                    anchorStroke: '#6366f1',
                    anchorStrokeWidth: 2,
                    anchorFill: '#0f172a',
                    anchorSize: 8,
                    anchorCornerRadius: 2,
                    rotateAnchorOffset: 20,
                    padding: 2,
                  }"
                />

                <!-- Hover Highlight Outline -->
                <v-rect
                  v-if="hoveredElementRect"
                  :config="{
                    x: hoveredElementRect.x,
                    y: hoveredElementRect.y,
                    width: hoveredElementRect.width,
                    height: hoveredElementRect.height,
                    stroke: 'rgba(99, 102, 241, 0.65)',
                    strokeWidth: 1.5,
                    dash: [4, 4],
                    listening: false,
                  }"
                />
              </v-layer>
            </v-stage>
          </div>
          <template #fallback>
            <div class="flex items-center justify-center py-20 text-zinc-500 text-sm">
              <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin mr-2" />
              Loading Canvas…
            </div>
          </template>
        </client-only>
      </div>

      <!-- RIGHT PANEL: Property Inspector -->
      <div class="w-72 shrink-0 rce-glass-panel rounded-2xl overflow-y-auto">
        <!-- Single Selection Properties -->
        <div v-if="selectedElement" class="flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between p-2 border-b border-white/10">
            <div class="flex items-center gap-1.5">
              <UIcon
                :name="elementTypeIcon(selectedElement.type)"
                class="text-sm text-indigo-400"
              />
              <span class="text-xs font-medium text-zinc-200">
                {{ elementLabel(selectedElement) }}
              </span>
            </div>
            <UTooltip text="Delete element">
              <button
                class="rce-tool-btn text-red-400 hover:text-red-300"
                aria-label="Delete element"
                @click="deleteSelectedElement"
              >
                <UIcon name="i-heroicons-trash" class="text-sm" />
              </button>
            </UTooltip>
          </div>

          <!-- Alignment Suite -->
          <div class="rce-prop-section">
            <p class="rce-prop-title">Align</p>
            <div class="grid grid-cols-6 gap-1">
              <UTooltip text="Align left">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align left"
                  @click="alignLayers('left')"
                >
                  <UIcon name="i-lucide-align-start-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align center">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align center"
                  @click="alignLayers('center-h')"
                >
                  <UIcon name="i-lucide-align-center-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align right">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align right"
                  @click="alignLayers('right')"
                >
                  <UIcon name="i-lucide-align-end-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align top">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align top"
                  @click="alignLayers('top')"
                >
                  <UIcon name="i-lucide-align-start-horizontal" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align middle">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align middle"
                  @click="alignLayers('middle-v')"
                >
                  <UIcon name="i-lucide-align-center-horizontal" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align bottom">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align bottom"
                  @click="alignLayers('bottom')"
                >
                  <UIcon name="i-lucide-align-end-horizontal" class="text-sm" />
                </button>
              </UTooltip>
            </div>
            <div class="grid grid-cols-2 gap-1 mt-1">
              <UTooltip text="Distribute horizontally">
                <button
                  class="rce-tool-btn-sm !w-full"
                  aria-label="Distribute horizontally"
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
                  class="rce-tool-btn-sm !w-full"
                  aria-label="Distribute vertically"
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

          <!-- Transform (Position & Sizing) -->
          <div class="rce-prop-section">
            <p class="rce-prop-title">Transform</p>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div class="rce-prop-row">
                <span class="rce-prop-label">X</span>
                <input
                  v-model.number="selectedElement.x"
                  type="number"
                  class="rce-num-input w-full"
                />
              </div>
              <div class="rce-prop-row">
                <span class="rce-prop-label">Y</span>
                <input
                  v-model.number="selectedElement.y"
                  type="number"
                  class="rce-num-input w-full"
                />
              </div>
              <div class="rce-prop-row">
                <span class="rce-prop-label">Rotation</span>
                <input
                  v-model.number="selectedElement.rotation"
                  type="number"
                  class="rce-num-input w-full"
                />
              </div>
              <template
                v-if="
                  selectedElement.type === 'rect' ||
                  selectedElement.type === 'progressbar' ||
                  selectedElement.type === 'image'
                "
              >
                <div class="rce-prop-row">
                  <span class="rce-prop-label">W</span>
                  <input
                    v-model.number="selectedElement.width"
                    type="number"
                    class="rce-num-input w-full"
                  />
                </div>
                <div class="rce-prop-row">
                  <span class="rce-prop-label">H</span>
                  <input
                    v-model.number="selectedElement.height"
                    type="number"
                    class="rce-num-input w-full"
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
                <div class="rce-prop-row">
                  <span class="rce-prop-label">R</span>
                  <input
                    v-model.number="selectedElement.radius"
                    type="number"
                    class="rce-num-input w-full"
                  />
                </div>
              </template>
              <template v-if="selectedElement.type === 'star'">
                <div class="rce-prop-row">
                  <span class="rce-prop-label">Outer</span>
                  <input
                    v-model.number="selectedElement.outerRadius"
                    type="number"
                    class="rce-num-input w-full"
                  />
                </div>
                <div class="rce-prop-row">
                  <span class="rce-prop-label">Inner</span>
                  <input
                    v-model.number="selectedElement.innerRadius"
                    type="number"
                    class="rce-num-input w-full"
                  />
                </div>
                <div class="rce-prop-row">
                  <span class="rce-prop-label">Points</span>
                  <input
                    v-model.number="selectedElement.numPoints"
                    type="number"
                    class="rce-num-input w-full"
                    min="3"
                    max="12"
                  />
                </div>
              </template>
              <div
                v-if="selectedElement.type === 'rect' || selectedElement.type === 'progressbar'"
                class="rce-prop-row col-span-2"
              >
                <span class="rce-prop-label">Corner Radius</span>
                <input
                  v-model.number="selectedElement.cornerRadius"
                  type="number"
                  class="rce-num-input w-full"
                  min="0"
                />
              </div>
            </div>
          </div>

          <!-- Typography / Text Section -->
          <div v-if="selectedElement.type === 'text'" class="rce-prop-section">
            <p class="rce-prop-title">Text</p>
            <textarea
              ref="textFieldRef"
              v-model="selectedElement.text"
              rows="2"
              class="rce-textarea"
              placeholder="Use {displayName}, {level}, etc."
            />
            <div class="flex flex-wrap gap-1 mt-2">
              <button
                v-for="ph in placeholders"
                :key="ph"
                class="rce-placeholder-chip"
                @click="insertPlaceholder(ph)"
              >
                {{ ph }}
              </button>
            </div>

            <!-- Font Family -->
            <div class="mt-2">
              <span class="rce-prop-label block mb-1">Font</span>
              <FontPicker
                :model-value="selectedElement.fontFamily || 'sans-serif'"
                @update:model-value="handleFontChange"
              />
            </div>

            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1.5">
              <div class="rce-prop-row">
                <span class="rce-prop-label">Size</span>
                <input
                  v-model.number="selectedElement.fontSize"
                  type="number"
                  class="rce-num-input w-full"
                  min="6"
                />
              </div>
              <div class="rce-prop-row">
                <span class="rce-prop-label">Style</span>
                <select
                  v-model="selectedElement.fontStyle"
                  class="rce-select w-full"
                >
                  <option value="">Normal</option>
                  <option value="bold">Bold</option>
                  <option value="italic">Italic</option>
                  <option value="bold italic">B+I</option>
                </select>
              </div>
            </div>

            <!-- Justification Buttons -->
            <div class="flex gap-1 mt-1.5">
              <button
                v-for="a in ['left', 'center', 'right']"
                :key="a"
                class="rce-tool-btn flex-1"
                :class="{
                  'bg-indigo-600/30 text-indigo-300':
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

          <!-- Progress Bar Specifics -->
          <div v-if="selectedElement.type === 'progressbar'" class="rce-prop-section">
            <p class="rce-prop-title">Progress Track</p>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="rce-prop-label">Track Color</span>
                <UPopover>
                  <button
                    type="button"
                    class="rce-color-chip-lg cursor-pointer"
                    :style="{ background: swatchPreview(selectedElement.trackColor || 'rgba(255,255,255,0.08)') }"
                  />
                  <template #content>
                    <GradientPicker
                      :model-value="selectedElement.trackColor || 'rgba(255,255,255,0.08)'"
                      :allow-radial="false"
                      @update:model-value="(v: string) => { if (selectedElement) selectedElement.trackColor = v; }"
                    />
                  </template>
                </UPopover>
              </div>
            </div>
          </div>

          <!-- Custom Image -->
          <div v-if="selectedElement.type === 'image'" class="rce-prop-section">
            <p class="rce-prop-title">Image</p>
            <UButton
              label="Replace image"
              color="neutral"
              variant="outline"
              block
              @click="replacingImageId = selectedElement!.id; imageUploadInput?.click()"
            />
          </div>

          <!-- Shadow / Glow -->
          <div class="rce-prop-section">
            <p class="rce-prop-title">Shadow</p>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div class="rce-prop-row">
                <span class="rce-prop-label">Color</span>
                <input
                  :value="selectedElement.shadowColor || '#000000'"
                  type="color"
                  class="rce-color-chip-lg cursor-pointer"
                  @input="selectedElement.shadowColor = ($event.target as HTMLInputElement).value"
                />
              </div>
              <div class="rce-prop-row">
                <span class="rce-prop-label">Blur</span>
                <input
                  v-model.number="selectedElement.shadowBlur"
                  type="number"
                  class="rce-num-input w-full"
                  min="0"
                />
              </div>
              <div class="rce-prop-row">
                <span class="rce-prop-label">X offset</span>
                <input
                  v-model.number="selectedElement.shadowOffsetX"
                  type="number"
                  class="rce-num-input w-full"
                />
              </div>
              <div class="rce-prop-row">
                <span class="rce-prop-label">Y offset</span>
                <input
                  v-model.number="selectedElement.shadowOffsetY"
                  type="number"
                  class="rce-num-input w-full"
                />
              </div>
            </div>
          </div>

          <!-- Fill & Gradient Picker -->
          <div
            v-if="
              selectedElement.type !== 'avatar' &&
              (selectedElement.type !== 'image' ||
                isTintableRankCardSvgSource(selectedElement.src)) &&
              selectedElement.type !== 'line'
            "
            class="rce-prop-section"
          >
            <p class="rce-prop-title">Fill</p>
            <UPopover>
              <button
                type="button"
                class="rce-color-chip-lg cursor-pointer"
                :style="{ background: swatchPreview(selectedElement.fill) }"
              />
              <template #content>
                <GradientPicker
                  :model-value="selectedElement.fill"
                  :allow-gradient="
                    selectedElement.type !== 'text' &&
                    selectedElement.type !== 'image'
                  "
                  @update:model-value="
                    (v: string) => {
                      if (selectedElement) selectedElement.fill = v;
                    }
                  "
                />
              </template>
            </UPopover>
          </div>

          <!-- Stroke & Gradient Picker -->
          <div
            v-if="
              selectedElement.type !== 'avatar' &&
              selectedElement.type !== 'image' &&
              selectedElement.type !== 'progressbar'
            "
            class="rce-prop-section"
          >
            <p class="rce-prop-title">Stroke</p>
            <div class="flex items-center gap-2">
              <UPopover>
                <button
                  type="button"
                  class="rce-color-chip-lg cursor-pointer"
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
                class="rce-num-input w-14"
                min="0"
                placeholder="0"
              />
            </div>
            <UCheckbox
              v-if="selectedElement.type === 'line'"
              v-model="selectedElement.arrow"
              label="Arrowhead"
              class="mt-2"
            />
          </div>

          <!-- Avatar Shape & Border -->
          <div v-if="selectedElement.type === 'avatar'" class="rce-prop-section">
            <p class="rce-prop-title">Avatar Shape</p>
            <div class="flex gap-1">
              <button
                class="rce-tool-btn-sm flex-1"
                :class="{ 'rce-layer-active': (selectedElement.avatarShape ?? 'circle') === 'circle' }"
                aria-label="Circle"
                @click="selectedElement.avatarShape = 'circle'"
              >
                <UIcon name="i-heroicons-sun" class="text-sm" />
              </button>
              <button
                class="rce-tool-btn-sm flex-1"
                :class="{ 'rce-layer-active': selectedElement.avatarShape === 'square' }"
                aria-label="Square"
                @click="selectedElement.avatarShape = 'square'"
              >
                <UIcon name="i-heroicons-stop" class="text-sm" />
              </button>
            </div>
            <div
              v-if="selectedElement.avatarShape === 'square'"
              class="rce-prop-row mt-1.5"
            >
              <span class="rce-prop-label">Corner Radius</span>
              <input
                v-model.number="selectedElement.avatarCornerRadius"
                type="number"
                class="rce-num-input w-full"
                min="0"
              />
            </div>
          </div>

          <div v-if="selectedElement.type === 'avatar'" class="rce-prop-section">
            <p class="rce-prop-title">Avatar Border</p>
            <div class="flex items-center gap-2">
              <div
                class="rce-color-chip-lg"
                :style="{ background: selectedElement.borderColor || '#818cf8' }"
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
                class="rce-num-input w-14"
                min="0"
                placeholder="0"
              />
            </div>
          </div>

          <!-- Opacity Slider -->
          <div class="rce-prop-section">
            <div class="flex items-center justify-between">
              <p class="rce-prop-title mb-0">Opacity</p>
              <span class="text-[10px] text-zinc-500 tabular-nums">
                {{ Math.round((selectedElement.opacity ?? 1) * 100) }}%
              </span>
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

        <!-- Multi-Selection Properties -->
        <div v-else-if="selectedElementIds.size > 1" class="flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between p-2 border-b border-white/10">
            <span class="text-xs font-medium text-zinc-300">
              {{ selectedElementIds.size }} layers selected
            </span>
            <div class="flex items-center gap-1">
              <UTooltip text="Duplicate selection">
                <button
                  class="rce-tool-btn"
                  aria-label="Duplicate selection"
                  @click="duplicateSelectedElement"
                >
                  <UIcon name="i-heroicons-document-duplicate" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Delete selection">
                <button
                  class="rce-tool-btn text-red-400 hover:text-red-300"
                  aria-label="Delete selection"
                  @click="deleteSelectedElement"
                >
                  <UIcon name="i-heroicons-trash" class="text-sm" />
                </button>
              </UTooltip>
            </div>
          </div>

          <!-- Align Suite for Multi-Selection -->
          <div class="rce-prop-section">
            <p class="rce-prop-title">Align</p>
            <div class="grid grid-cols-6 gap-1">
              <UTooltip text="Align left">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align left"
                  @click="alignLayers('left')"
                >
                  <UIcon name="i-lucide-align-start-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align center">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align center"
                  @click="alignLayers('center-h')"
                >
                  <UIcon name="i-lucide-align-center-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align right">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align right"
                  @click="alignLayers('right')"
                >
                  <UIcon name="i-lucide-align-end-vertical" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align top">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align top"
                  @click="alignLayers('top')"
                >
                  <UIcon name="i-lucide-align-start-horizontal" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align middle">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align middle"
                  @click="alignLayers('middle-v')"
                >
                  <UIcon name="i-lucide-align-center-horizontal" class="text-sm" />
                </button>
              </UTooltip>
              <UTooltip text="Align bottom">
                <button
                  class="rce-tool-btn-sm"
                  aria-label="Align bottom"
                  @click="alignLayers('bottom')"
                >
                  <UIcon name="i-lucide-align-end-horizontal" class="text-sm" />
                </button>
              </UTooltip>
            </div>
            <div class="grid grid-cols-2 gap-1 mt-1">
              <UTooltip text="Distribute horizontally">
                <button
                  class="rce-tool-btn-sm !w-full"
                  aria-label="Distribute horizontally"
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
                  class="rce-tool-btn-sm !w-full"
                  aria-label="Distribute vertically"
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

          <!-- Group Transform -->
          <div class="rce-prop-section">
            <p class="rce-prop-title">Group Transform</p>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div class="rce-prop-row">
                <span class="rce-prop-label">X</span>
                <input
                  :value="Math.round(groupBounds?.x ?? 0)"
                  type="number"
                  class="rce-num-input w-full"
                  @change="
                    (e: any) =>
                      applyGroupMove(Number(e.target.value), groupBounds?.y ?? 0)
                  "
                />
              </div>
              <div class="rce-prop-row">
                <span class="rce-prop-label">Y</span>
                <input
                  :value="Math.round(groupBounds?.y ?? 0)"
                  type="number"
                  class="rce-num-input w-full"
                  @change="
                    (e: any) =>
                      applyGroupMove(groupBounds?.x ?? 0, Number(e.target.value))
                  "
                />
              </div>
              <div class="rce-prop-row">
                <span class="rce-prop-label">W</span>
                <input
                  :value="Math.round(groupBounds?.width ?? 0)"
                  type="number"
                  min="1"
                  class="rce-num-input w-full"
                  @change="
                    (e: any) =>
                      applyGroupScale(Number(e.target.value), groupBounds?.height ?? 1)
                  "
                />
              </div>
              <div class="rce-prop-row">
                <span class="rce-prop-label">H</span>
                <input
                  :value="Math.round(groupBounds?.height ?? 0)"
                  type="number"
                  min="1"
                  class="rce-num-input w-full"
                  @change="
                    (e: any) =>
                      applyGroupScale(groupBounds?.width ?? 1, Number(e.target.value))
                  "
                />
              </div>
              <div class="rce-prop-row col-span-2">
                <span class="rce-prop-label">Rotation</span>
                <input
                  v-model.number.lazy="groupRotationDelta"
                  type="number"
                  class="rce-num-input w-full"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- No Selection Empty State -->
        <div
          v-else
          class="flex flex-col items-center justify-center h-full text-center py-12"
        >
          <UIcon
            name="i-heroicons-cursor-arrow-rays"
            class="text-2xl text-zinc-600 mb-2"
          />
          <p class="text-xs text-zinc-500">Select an element on canvas</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import {
  DEFAULT_RANK_CARD_TEMPLATE,
  getRankCardRenderCacheKey,
  getRankCardTintRasterSize,
  isTintableRankCardSvgSource,
  type RankCardTemplate,
  type RankCardElement,
} from "~/utils/rank-cards";
import {
  gradientType,
  parseGradientAngle,
  parseGradientColors,
  parseGradientStops,
} from "~/utils/gradient";
import { useGoogleFonts } from "~/composables/useGoogleFonts";

const { loadFont, loadTemplateFonts } = useGoogleFonts();

const props = defineProps<{
  modelValue?: RankCardTemplate;
  guildId: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: RankCardTemplate): void;
  (e: "save", val: RankCardTemplate): void;
}>();

const toast = useToast();

// ── Presets ────────────────────────────────────────────────────────────

interface PresetDef {
  name: string;
  preview: string;
  template: RankCardTemplate;
}

const PRESETS: PresetDef[] = [
  {
    name: "Modern Indigo",
    preview: "linear-gradient(135deg, #111827, #1e1b4b)",
    template: JSON.parse(JSON.stringify(DEFAULT_RANK_CARD_TEMPLATE)),
  },
  {
    name: "Neon Cyber",
    preview: "linear-gradient(135deg, #09090b, #0369a1)",
    template: {
      canvasWidth: 934,
      canvasHeight: 282,
      backgroundColor: "#030712",
      elements: [
        {
          id: "card-bg",
          type: "rect",
          x: 10,
          y: 10,
          width: 914,
          height: 262,
          fill: "linear-gradient(135deg, #030712, #082f49, #020617)",
          cornerRadius: 18,
          stroke: "rgba(6, 182, 212, 0.2)",
          strokeWidth: 1.5,
          opacity: 0.95,
          shadowColor: "rgba(6, 182, 212, 0.2)",
          shadowBlur: 20,
        },
        {
          id: "accent-bar",
          type: "rect",
          x: 10,
          y: 10,
          width: 914,
          height: 5,
          fill: "linear-gradient(90deg, #06b6d4, #3b82f6, #8b5cf6)",
          cornerRadius: 2,
        },
        {
          id: "avatar",
          type: "avatar",
          x: 100,
          y: 141,
          radius: 56,
          borderColor: "#06b6d4",
          borderWidth: 3,
          shadowColor: "rgba(6, 182, 212, 0.5)",
          shadowBlur: 15,
        },
        {
          id: "name-text",
          type: "text",
          x: 195,
          y: 105,
          text: "{displayName}",
          fontSize: 28,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#ffffff",
          align: "left",
        },
        {
          id: "user-tag",
          type: "text",
          x: 195,
          y: 140,
          text: "@{username}",
          fontSize: 15,
          fontFamily: "sans-serif",
          fill: "#38bdf8",
          align: "left",
        },
        {
          id: "rank-label",
          type: "text",
          x: 690,
          y: 85,
          text: "RANK",
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#06b6d4",
          align: "right",
        },
        {
          id: "rank-value",
          type: "text",
          x: 740,
          y: 83,
          text: "#{rank}",
          fontSize: 26,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#38bdf8",
          align: "right",
        },
        {
          id: "level-label",
          type: "text",
          x: 820,
          y: 85,
          text: "LEVEL",
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#3b82f6",
          align: "right",
        },
        {
          id: "level-value",
          type: "text",
          x: 875,
          y: 83,
          text: "{level}",
          fontSize: 28,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#60a5fa",
          align: "right",
        },
        {
          id: "xp-counter",
          type: "text",
          x: 875,
          y: 170,
          text: "{current_xp} / {next_xp} XP",
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#94a3b8",
          align: "right",
        },
        {
          id: "xp-progress",
          type: "progressbar",
          x: 195,
          y: 195,
          width: 680,
          height: 18,
          cornerRadius: 9,
          trackColor: "rgba(255, 255, 255, 0.08)",
          fill: "linear-gradient(90deg, #06b6d4, #3b82f6, #8b5cf6)",
          shadowColor: "rgba(6, 182, 212, 0.4)",
          shadowBlur: 10,
        },
      ],
    },
  },
  {
    name: "Sunset Blaze",
    preview: "linear-gradient(135deg, #18181b, #831843)",
    template: {
      canvasWidth: 934,
      canvasHeight: 282,
      backgroundColor: "#18181b",
      elements: [
        {
          id: "card-bg",
          type: "rect",
          x: 10,
          y: 10,
          width: 914,
          height: 262,
          fill: "linear-gradient(135deg, #18181b, #4c0519, #1c1917)",
          cornerRadius: 18,
          stroke: "rgba(249, 115, 22, 0.2)",
          strokeWidth: 1.5,
          opacity: 0.95,
          shadowColor: "rgba(236, 72, 153, 0.2)",
          shadowBlur: 20,
        },
        {
          id: "accent-bar",
          type: "rect",
          x: 10,
          y: 10,
          width: 914,
          height: 5,
          fill: "linear-gradient(90deg, #f97316, #ec4899, #f43f5e)",
          cornerRadius: 2,
        },
        {
          id: "avatar",
          type: "avatar",
          x: 100,
          y: 141,
          radius: 56,
          borderColor: "#f97316",
          borderWidth: 3,
          shadowColor: "rgba(249, 115, 22, 0.5)",
          shadowBlur: 15,
        },
        {
          id: "name-text",
          type: "text",
          x: 195,
          y: 105,
          text: "{displayName}",
          fontSize: 28,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#ffffff",
          align: "left",
        },
        {
          id: "user-tag",
          type: "text",
          x: 195,
          y: 140,
          text: "@{username}",
          fontSize: 15,
          fontFamily: "sans-serif",
          fill: "#fdba74",
          align: "left",
        },
        {
          id: "rank-label",
          type: "text",
          x: 690,
          y: 85,
          text: "RANK",
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#f97316",
          align: "right",
        },
        {
          id: "rank-value",
          type: "text",
          x: 740,
          y: 83,
          text: "#{rank}",
          fontSize: 26,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#fb923c",
          align: "right",
        },
        {
          id: "level-label",
          type: "text",
          x: 820,
          y: 85,
          text: "LEVEL",
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#ec4899",
          align: "right",
        },
        {
          id: "level-value",
          type: "text",
          x: 875,
          y: 83,
          text: "{level}",
          fontSize: 28,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#f472b6",
          align: "right",
        },
        {
          id: "xp-counter",
          type: "text",
          x: 875,
          y: 170,
          text: "{current_xp} / {next_xp} XP",
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#94a3b8",
          align: "right",
        },
        {
          id: "xp-progress",
          type: "progressbar",
          x: 195,
          y: 195,
          width: 680,
          height: 18,
          cornerRadius: 9,
          trackColor: "rgba(255, 255, 255, 0.08)",
          fill: "linear-gradient(90deg, #f97316, #ec4899, #f43f5e)",
          shadowColor: "rgba(249, 115, 22, 0.4)",
          shadowBlur: 10,
        },
      ],
    },
  },
  {
    name: "Emerald Forest",
    preview: "linear-gradient(135deg, #064e3b, #022c22)",
    template: {
      canvasWidth: 934,
      canvasHeight: 282,
      backgroundColor: "#022c22",
      elements: [
        {
          id: "card-bg",
          type: "rect",
          x: 10,
          y: 10,
          width: 914,
          height: 262,
          fill: "linear-gradient(135deg, #022c22, #064e3b, #041f18)",
          cornerRadius: 18,
          stroke: "rgba(16, 185, 129, 0.2)",
          strokeWidth: 1.5,
          opacity: 0.95,
          shadowColor: "rgba(16, 185, 129, 0.2)",
          shadowBlur: 20,
        },
        {
          id: "accent-bar",
          type: "rect",
          x: 10,
          y: 10,
          width: 914,
          height: 5,
          fill: "linear-gradient(90deg, #10b981, #34d399, #6ee7b7)",
          cornerRadius: 2,
        },
        {
          id: "avatar",
          type: "avatar",
          x: 100,
          y: 141,
          radius: 56,
          borderColor: "#10b981",
          borderWidth: 3,
          shadowColor: "rgba(16, 185, 129, 0.5)",
          shadowBlur: 15,
        },
        {
          id: "name-text",
          type: "text",
          x: 195,
          y: 105,
          text: "{displayName}",
          fontSize: 28,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#ffffff",
          align: "left",
        },
        {
          id: "user-tag",
          type: "text",
          x: 195,
          y: 140,
          text: "@{username}",
          fontSize: 15,
          fontFamily: "sans-serif",
          fill: "#6ee7b7",
          align: "left",
        },
        {
          id: "rank-label",
          type: "text",
          x: 690,
          y: 85,
          text: "RANK",
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#10b981",
          align: "right",
        },
        {
          id: "rank-value",
          type: "text",
          x: 740,
          y: 83,
          text: "#{rank}",
          fontSize: 26,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#34d399",
          align: "right",
        },
        {
          id: "level-label",
          type: "text",
          x: 820,
          y: 85,
          text: "LEVEL",
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#059669",
          align: "right",
        },
        {
          id: "level-value",
          type: "text",
          x: 875,
          y: 83,
          text: "{level}",
          fontSize: 28,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#6ee7b7",
          align: "right",
        },
        {
          id: "xp-counter",
          type: "text",
          x: 875,
          y: 170,
          text: "{current_xp} / {next_xp} XP",
          fontSize: 14,
          fontFamily: "sans-serif",
          fontStyle: "bold",
          fill: "#94a3b8",
          align: "right",
        },
        {
          id: "xp-progress",
          type: "progressbar",
          x: 195,
          y: 195,
          width: 680,
          height: 18,
          cornerRadius: 9,
          trackColor: "rgba(255, 255, 255, 0.08)",
          fill: "linear-gradient(90deg, #10b981, #34d399, #6ee7b7)",
          shadowColor: "rgba(16, 185, 129, 0.4)",
          shadowBlur: 10,
        },
      ],
    },
  },
];

// ── State ──────────────────────────────────────────────────────────────

const template = ref<RankCardTemplate>(
  props.modelValue
    ? JSON.parse(JSON.stringify(props.modelValue))
    : JSON.parse(JSON.stringify(DEFAULT_RANK_CARD_TEMPLATE)),
);

const selectedElementIds = ref<Set<string>>(new Set());
const selectedElementId = computed(() =>
  selectedElementIds.value.size === 1 ? [...selectedElementIds.value][0]! : null,
);

const saving = ref(false);
const stageRef = ref<any>(null);
const textFieldRef = ref<HTMLTextAreaElement | null>(null);
const transformerRef = ref<any>(null);
const transformerRevision = ref(0);
const canvasWrap = ref<HTMLElement | null>(null);
const zoomMultiplier = ref(1);
const isSpaceHeld = ref(false);
const isShiftHeld = ref(false);
const isPanning = ref(false);
const bgUploading = ref(false);
const bgImageObj = ref<HTMLImageElement | null>(null);
const bgImageFile = ref<File | null>(null);
const MAX_IMAGE_LAYER_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_LAYERS = 10;
const imageUploadInput = ref<HTMLInputElement | null>(null);
const replacingImageId = ref<string | null>(null);
const imageUploading = ref(false);

type BrowserRankCardImage = HTMLImageElement | HTMLCanvasElement;
interface BrowserRankCardImageCacheEntry {
  source: string;
  renderKey: string;
  original: HTMLImageElement;
  rendered: BrowserRankCardImage;
}
const imageObjects = ref<Record<string, BrowserRankCardImage>>({});
const imageCache = new Map<string, BrowserRankCardImageCacheEntry>();

function imageLayerCount(elements: RankCardElement[]) {
  return elements.filter((el) => el.type === "image").length;
}

// ── Undo/Redo History ──────────────────────────────────────────────────

const undoStack = ref<string[]>([]);
const redoStack = ref<string[]>([]);
const HISTORY_LIMIT = 50;
let historyTimer: ReturnType<typeof setTimeout> | null = null;

function captureSnapshot() {
  const json = JSON.stringify(template.value);
  if (undoStack.value[undoStack.value.length - 1] === json) return;
  undoStack.value.push(json);
  if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift();
  redoStack.value = [];
}

watch(
  template,
  () => {
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(captureSnapshot, 500);
  },
  { deep: true },
);

function flushPendingSnapshot() {
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
    captureSnapshot();
  }
}

function pruneSelectionToExisting() {
  selectedElementIds.value = new Set(
    [...selectedElementIds.value].filter((id) =>
      template.value.elements.some((el) => el.id === id),
    ),
  );
}

function undo() {
  flushPendingSnapshot();
  if (undoStack.value.length <= 1) return;
  const current = undoStack.value.pop()!;
  redoStack.value.push(current);
  const prev = undoStack.value[undoStack.value.length - 1]!;
  template.value = JSON.parse(prev);
  pruneSelectionToExisting();
}

function redo() {
  flushPendingSnapshot();
  if (redoStack.value.length === 0) return;
  const next = redoStack.value.pop()!;
  undoStack.value.push(next);
  template.value = JSON.parse(next);
  pruneSelectionToExisting();
}

const canUndo = computed(() => undoStack.value.length > 1);
const canRedo = computed(() => redoStack.value.length > 0);

// ── Background Image ───────────────────────────────────────────────────

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
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    if (dataUrl) loadBgImage(dataUrl);
  };
  reader.readAsDataURL(file);

  bgUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("guild_id", props.guildId);
    const res = await fetch("/api/xp/upload-bg", {
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

// ── Element Images & Tinting ───────────────────────────────────────────

function createTintedBrowserRankCardImage(
  image: HTMLImageElement,
  source: string,
  fill?: string,
  width?: number,
  height?: number,
): BrowserRankCardImage {
  if (!fill || !isTintableRankCardSvgSource(source)) return image;

  const canvas = document.createElement("canvas");
  const size = getRankCardTintRasterSize(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    width || image.width,
    height || image.height,
  );
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return image;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = fill;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";
  return canvas;
}

function cacheElementImage(
  el: RankCardElement,
  original: HTMLImageElement,
  renderKey: string,
) {
  if (!el.src) return;
  const rendered = createTintedBrowserRankCardImage(
    original,
    el.src,
    el.fill,
    el.width,
    el.height,
  );
  imageCache.set(el.id, {
    source: el.src,
    renderKey,
    original,
    rendered,
  });
  imageObjects.value = { ...imageObjects.value, [el.id]: rendered };
  stageRef.value?.getNode()?.batchDraw();
  void rebindTransformer();
}

function loadElementImage(el: RankCardElement) {
  if (el.type !== "image" || !el.src) return;
  const source = el.src;
  const renderKey = getRankCardRenderCacheKey(
    el.id,
    source,
    el.fill,
    el.width,
    el.height,
  );
  const cached = imageCache.get(el.id);
  if (cached?.renderKey === renderKey) return;
  if (cached?.source === source) {
    cacheElementImage(el, cached.original, renderKey);
    return;
  }

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    const currentElement = template.value.elements.find(
      (current) => current.id === el.id,
    );
    if (
      currentElement?.type !== "image" ||
      !currentElement.src ||
      getRankCardRenderCacheKey(
        currentElement.id,
        currentElement.src,
        currentElement.fill,
        currentElement.width,
        currentElement.height,
      ) !== renderKey
    ) {
      return;
    }
    cacheElementImage(currentElement, image, renderKey);
  };
  image.onerror = () => {
    console.warn("[RankCardEditor] Failed to load image layer", source);
  };
  image.src = source;
}

function syncElementImages(elements: RankCardElement[]) {
  const liveImageIds = new Set(
    elements.filter((el) => el.type === "image").map((el) => el.id),
  );
  const nextImageObjects = { ...imageObjects.value };
  let objectsChanged = false;

  for (const id of imageCache.keys()) {
    if (!liveImageIds.has(id)) imageCache.delete(id);
  }
  for (const id of Object.keys(nextImageObjects)) {
    if (!liveImageIds.has(id)) {
      delete nextImageObjects[id];
      objectsChanged = true;
    }
  }
  if (objectsChanged) imageObjects.value = nextImageObjects;

  elements.forEach(loadElementImage);
}

watch(
  () => template.value.elements,
  syncElementImages,
  { deep: true, immediate: true },
);

function loadLocalImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image."));
    };
    image.src = objectUrl;
  });
}

function handleImageFileSelection(event: Event) {
  const replaceId = replacingImageId.value;
  replacingImageId.value = null;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  const replaceElement = replaceId
    ? template.value.elements.find((el) => el.id === replaceId)
    : undefined;

  if (replaceElement?.type === "image") {
    void uploadImageLayer(file, replaceElement);
  } else {
    void uploadImageLayer(file);
  }
}

async function uploadImageLayer(file: File, replaceElement?: RankCardElement): Promise<void> {
  if (file.size > MAX_IMAGE_LAYER_SIZE) {
    toast.add({
      title: "Image too large",
      description: "Choose an image no larger than 5 MB.",
      color: "error",
    });
    return;
  }
  if (
    !replaceElement &&
    imageLayerCount(template.value.elements) >= MAX_IMAGE_LAYERS
  ) {
    toast.add({
      title: "Image layer limit reached",
      description: "A rank card template can contain up to 10 images.",
      color: "error",
    });
    return;
  }
  if (imageUploading.value) return;

  imageUploading.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("guild_id", props.guildId);
    const uploadPromise = fetch("/api/xp/upload-image", {
      method: "POST",
      body: formData,
    });
    const localImagePromise = loadLocalImage(file);
    const response = await uploadPromise;
    if (!response.ok) {
      void localImagePromise.catch(() => undefined);
      const error = await response.json().catch(() => ({}));
      throw new Error(error.statusMessage || "Could not upload image layer.");
    }

    const { url } = (await response.json()) as { url: string };
    const localImage = await localImagePromise;
    const naturalWidth = localImage.naturalWidth;
    const naturalHeight = localImage.naturalHeight;
    if (!naturalWidth || !naturalHeight) {
      throw new Error("Could not read image.");
    }
    const scale = Math.min(1, 200 / naturalWidth, 200 / naturalHeight);
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    if (replaceElement) {
      replaceElement.src = url;
      replaceElement.width = width;
      replaceElement.height = height;
      const nextImageObjects = { ...imageObjects.value };
      delete nextImageObjects[replaceElement.id];
      imageObjects.value = nextImageObjects;
      imageCache.delete(replaceElement.id);
      loadElementImage(replaceElement);
      toast.add({
        title: "Image layer replaced",
        description: "Remember to save your changes.",
        color: "success",
      });
      return;
    }

    const element: RankCardElement = {
      id: `image-${Date.now()}-${++elementCounter}`,
      type: "image",
      x: Math.round((template.value.canvasWidth - width) / 2),
      y: Math.round((template.value.canvasHeight - height) / 2),
      width,
      height,
      src: url,
      opacity: 1,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    template.value.elements.push(element);
    selectedElementIds.value = new Set([element.id]);
    loadElementImage(element);
    toast.add({
      title: "Image layer added",
      description: "Remember to save your changes.",
      color: "success",
    });
  } catch (err: any) {
    toast.add({
      title: "Upload failed",
      description: err?.message || "Could not upload image layer.",
      color: "error",
    });
  } finally {
    imageUploading.value = false;
  }
}

function applyPreset(preset: PresetDef) {
  const bgImage = template.value.backgroundImage;
  template.value = JSON.parse(JSON.stringify(preset.template));
  if (bgImage) template.value.backgroundImage = bgImage;
  selectedElementIds.value = new Set();
}

// ── Tools & Placeholders ───────────────────────────────────────────────

const placeholders = [
  "{displayName}",
  "{username}",
  "{rank}",
  "{level}",
  "{current_xp}",
  "{next_xp}",
  "{xp}",
  "{progress_percent}",
  "{messages}",
  "{server_name}",
  "{member_count}",
  "{tag}",
];

const toolTypes = [
  {
    type: "text" as const,
    icon: "i-heroicons-bars-3-bottom-left",
    label: "Text",
    color: "text-amber-400",
  },
  {
    type: "progressbar" as const,
    icon: "i-heroicons-chart-bar",
    label: "XP Progress Bar",
    color: "text-indigo-400",
  },
  {
    type: "avatar" as const,
    icon: "i-heroicons-user-circle",
    label: "Avatar",
    color: "text-purple-400",
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
    color: "text-teal-400",
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
    type: "image" as const,
    icon: "i-heroicons-photo",
    label: "Custom Image",
    color: "text-sky-400",
  },
];

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

// ── Transformer ────────────────────────────────────────────────────────

const transformerNodes = computed(() => {
  transformerRevision.value;
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
    const rect = node.getClientRect({ relativeTo: stage });
    if (node.getClassName() === "Text" && !node.rotation()) {
      const textWidth = (node as any).getTextWidth();
      const align = (node as any).align();
      const inset =
        align === "center"
          ? (rect.width - textWidth) / 2
          : align === "right"
            ? rect.width - textWidth
            : 0;
      return { ...rect, x: rect.x + inset, width: textWidth };
    }
    return rect;
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
    el: RankCardElement;
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

function scaleElementSize(el: RankCardElement, sx: number, sy: number) {
  switch (el.type) {
    case "rect":
    case "progressbar":
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
      el.radius = Math.round(Math.max(5, (el.radius ?? 56) * ((sx + sy) / 2)));
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

async function rebindTransformer() {
  await nextTick();
  transformerRevision.value++;
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
}

watch(selectedElementIds, () => {
  void rebindTransformer();
});

// ── Config Builders ────────────────────────────────────────────────────

function rectConfig(el: RankCardElement) {
  const w = el.width || 100;
  const h = el.height || 100;
  return {
    x: el.x,
    y: el.y,
    width: w,
    height: h,
    ...gradientFillProps(el.fill, 0, 0, w, h, "#111827"),
    cornerRadius: el.cornerRadius || 0,
    opacity: el.opacity ?? 1,
    ...gradientStrokeProps(el.stroke, 0, 0, w, h),
    strokeWidth: el.strokeWidth || 0,
    shadowColor: el.shadowColor,
    shadowBlur: el.shadowBlur,
    shadowOffsetX: el.shadowOffsetX,
    shadowOffsetY: el.shadowOffsetY,
    rotation: el.rotation || 0,
    draggable: true,
    name: el.id,
  };
}

function imageConfig(el: RankCardElement) {
  return {
    x: el.x,
    y: el.y,
    width: el.width || 100,
    height: el.height || 100,
    image: imageObjects.value[el.id],
    opacity: el.opacity ?? 1,
    rotation: el.rotation ?? 0,
    scaleX: el.scaleX ?? 1,
    scaleY: el.scaleY ?? 1,
    shadowColor: el.shadowColor,
    shadowBlur: el.shadowBlur,
    shadowOffsetX: el.shadowOffsetX,
    shadowOffsetY: el.shadowOffsetY,
    draggable: true,
    name: el.id,
  };
}

function circleConfig(el: RankCardElement) {
  const r = el.radius || 50;
  return {
    x: el.x,
    y: el.y,
    radius: r,
    ...gradientFillProps(el.fill, -r, -r, r, r, "#6366f1"),
    opacity: el.opacity ?? 1,
    ...gradientStrokeProps(el.stroke, -r, -r, r, r),
    strokeWidth: el.strokeWidth || 0,
    shadowColor: el.shadowColor,
    shadowBlur: el.shadowBlur,
    shadowOffsetX: el.shadowOffsetX,
    shadowOffsetY: el.shadowOffsetY,
    rotation: el.rotation ?? 0,
    scaleX: el.scaleX ?? 1,
    scaleY: el.scaleY ?? 1,
    draggable: true,
    name: el.id,
  };
}

function triangleConfig(el: RankCardElement) {
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
    shadowColor: el.shadowColor,
    shadowBlur: el.shadowBlur,
    shadowOffsetX: el.shadowOffsetX,
    shadowOffsetY: el.shadowOffsetY,
    rotation: el.rotation ?? 0,
    scaleX: el.scaleX ?? 1,
    scaleY: el.scaleY ?? 1,
    draggable: true,
    name: el.id,
  };
}

function starConfig(el: RankCardElement) {
  const r = el.outerRadius || 50;
  return {
    x: el.x,
    y: el.y,
    numPoints: el.numPoints || 5,
    innerRadius: el.innerRadius || 25,
    outerRadius: r,
    ...gradientFillProps(el.fill, -r, -r, r, r, "#eab308"),
    opacity: el.opacity ?? 1,
    ...gradientStrokeProps(el.stroke, -r, -r, r, r),
    strokeWidth: el.strokeWidth || 0,
    shadowColor: el.shadowColor,
    shadowBlur: el.shadowBlur,
    shadowOffsetX: el.shadowOffsetX,
    shadowOffsetY: el.shadowOffsetY,
    rotation: el.rotation ?? 0,
    scaleX: el.scaleX ?? 1,
    scaleY: el.scaleY ?? 1,
    draggable: true,
    name: el.id,
  };
}

function lineConfig(el: RankCardElement) {
  return {
    x: el.x,
    y: el.y,
    points: el.points || [-60, 0, 60, 0],
    stroke: el.stroke || "#6366f1",
    strokeWidth: el.strokeWidth || 3,
    opacity: el.opacity ?? 1,
    rotation: el.rotation ?? 0,
    draggable: true,
    name: el.id,
  };
}

function textConfig(el: RankCardElement) {
  const family = el.fontFamily || "sans-serif";
  const fontSize = el.fontSize || 24;
  const width = el.width || 400;
  return {
    x: el.x,
    y: el.y,
    offsetX: el.align === "center" ? width / 2 : el.align === "right" ? width : 0,
    offsetY: fontSize / 2,
    width,
    text: previewText(el.text || ""),
    fontSize,
    fontFamily: family,
    fontStyle: el.fontStyle || "",
    fill: el.fill || "#ffffff",
    align: el.align || "left",
    opacity: el.opacity ?? 1,
    rotation: el.rotation ?? 0,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth || 0,
    shadowColor: el.shadowColor,
    shadowBlur: el.shadowBlur,
    shadowOffsetX: el.shadowOffsetX,
    shadowOffsetY: el.shadowOffsetY,
    draggable: true,
    name: el.id,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

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
    .replace(/\{displayName\}/g, "Alex Johnson")
    .replace(/\{username\}/g, "alex_j")
    .replace(/\{tag\}/g, "alex_j#0001")
    .replace(/\{server_name\}/g, "My Server")
    .replace(/\{level\}/g, "14")
    .replace(/\{rank\}/g, "3")
    .replace(/\{current_xp\}/g, "1,240")
    .replace(/\{next_xp\}/g, "2,050")
    .replace(/\{xp\}/g, "8,450")
    .replace(/\{progress_percent\}/g, "65%")
    .replace(/\{messages\}/g, "342")
    .replace(/\{member_count\}/g, "1,250");
}

function elementLabel(el: RankCardElement): string {
  if (el.type === "text") return (el.text || "Text").substring(0, 16);
  if (el.type === "progressbar") return "XP Progress";
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}

function elementTypeIcon(type: string): string {
  const map: Record<string, string> = {
    text: "i-heroicons-bars-3-bottom-left",
    progressbar: "i-heroicons-chart-bar",
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

// ── Element CRUD ───────────────────────────────────────────────────────

let elementCounter = 0;

function addElement(type: RankCardElement["type"]) {
  elementCounter++;
  const id = `${type}-${Date.now()}-${elementCounter}`;
  const cx = template.value.canvasWidth / 2,
    cy = template.value.canvasHeight / 2;

  const defs: Record<string, Partial<RankCardElement>> = {
    text: {
      type: "text",
      x: cx,
      y: cy,
      text: "New Text",
      fontSize: 24,
      fontFamily: "sans-serif",
      fontStyle: "",
      fill: "#ffffff",
      align: "left",
      opacity: 1,
    },
    progressbar: {
      type: "progressbar",
      x: 195,
      y: 195,
      width: 680,
      height: 18,
      cornerRadius: 9,
      trackColor: "rgba(255, 255, 255, 0.08)",
      fill: "linear-gradient(90deg, #6366f1, #a855f7, #ec4899)",
      opacity: 1,
    },
    rect: {
      type: "rect",
      x: cx - 75,
      y: cy - 50,
      width: 150,
      height: 100,
      fill: "#1e1b4b",
      opacity: 1,
      cornerRadius: 8,
    },
    circle: {
      type: "circle",
      x: cx,
      y: cy,
      radius: 50,
      fill: "#6366f1",
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
      fill: "#eab308",
      opacity: 1,
    },
    line: {
      type: "line",
      x: cx,
      y: cy,
      points: [-60, 0, 60, 0],
      stroke: "#6366f1",
      strokeWidth: 3,
      opacity: 1,
      arrow: false,
    },
    avatar: {
      type: "avatar",
      x: 100,
      y: 141,
      radius: 56,
      borderColor: "#818cf8",
      borderWidth: 3,
      opacity: 1,
    },
  };

  if (!defs[type]) return;
  template.value.elements.push({ id, ...defs[type] } as RankCardElement);
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
  const deletedIds = new Set(selectedElementIds.value);
  template.value.elements = template.value.elements.filter(
    (el) => !deletedIds.has(el.id),
  );
  const nextImageObjects = { ...imageObjects.value };
  for (const id of deletedIds) {
    delete nextImageObjects[id];
    imageCache.delete(id);
  }
  imageObjects.value = nextImageObjects;
  selectedElementIds.value = new Set();
}

function duplicateSelectedElement() {
  if (selectedElementIds.value.size === 0) return;
  const imageDuplicates = [...selectedElementIds.value].filter(
    (id) => template.value.elements.find((el) => el.id === id)?.type === "image",
  ).length;
  if (imageLayerCount(template.value.elements) + imageDuplicates > MAX_IMAGE_LAYERS) {
    toast.add({
      title: "Image layer limit reached",
      description: "A rank card template can contain up to 10 images.",
      color: "error",
    });
    return;
  }
  const newIds = new Set<string>();
  for (const id of selectedElementIds.value) {
    const src = template.value.elements.find((el) => el.id === id);
    if (!src) continue;
    elementCounter++;
    const newEl: RankCardElement = {
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

function moveLayer(direction: "up" | "down") {
  if (!selectedElementId.value) return;
  const els = template.value.elements;
  const i = els.findIndex((el) => el.id === selectedElementId.value);
  if (i === -1) return;
  const target = direction === "up" ? i + 1 : i - 1;
  if (target < 0 || target >= els.length) return;
  [els[i], els[target]] = [els[target]!, els[i]!];
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

// ── Font Change Handler ────────────────────────────────────────────────

async function handleFontChange(family: string) {
  if (!selectedElement.value) return;
  selectedElement.value.fontFamily = family;
  await loadFont(family);
  stageRef.value?.getNode()?.batchDraw();
}

// ── Keyboard Shortcuts ─────────────────────────────────────────────────

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Shift" && !isShiftHeld.value) {
    isShiftHeld.value = true;
  }

  const target = e.target as HTMLElement;
  const isTextEntry =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable;
  if (isTextEntry) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }

  if (target.closest("button, [role='button']")) return;

  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteSelectedElement();
  }
  if (e.key === " " && !isSpaceHeld.value) {
    e.preventDefault();
    isSpaceHeld.value = true;
    stageRef.value?.getNode()?.listening(false);
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.key === "Shift") isShiftHeld.value = false;
  if (e.key === " ") {
    isSpaceHeld.value = false;
    isPanning.value = false;
    stageRef.value?.getNode()?.listening(true);
  }
}

function handleWindowBlur() {
  isShiftHeld.value = false;
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

// ── Drag / Transform End Handlers ──────────────────────────────────────

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

function handleDragStart(e: any, el: RankCardElement) {
  if (!selectedElementIds.value.has(el.id)) {
    selectedElementIds.value = new Set([el.id]);
  }
}

function moveOtherSelectedElements(
  movedEl: RankCardElement,
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

function handleDragEnd(e: any, el: RankCardElement) {
  const newX = Math.round(e.target.x());
  const newY = Math.round(e.target.y());
  moveOtherSelectedElements(el, newX, newY);
  el.x = newX;
  el.y = newY;
}

function handleLineHandleDrag(e: any, el: RankCardElement, pointIndex: number) {
  const pts = el.points ? [...el.points] : [-60, 0, 60, 0];
  pts[pointIndex] = Math.round(e.target.x() - el.x);
  pts[pointIndex + 1] = Math.round(e.target.y() - el.y);
  el.points = pts;
}

function handleTextDragEnd(e: any, el: RankCardElement) {
  const newX = Math.round(e.target.x());
  const newY = Math.round(e.target.y());
  moveOtherSelectedElements(el, newX, newY);
  el.x = newX;
  el.y = newY;
}

function handleTransformEnd(e: any, el: RankCardElement) {
  const node = e.target;
  el.x = Math.round(node.x());
  el.y = Math.round(node.y());
  el.rotation = Math.round(node.rotation());
  if (el.type === "rect" || el.type === "progressbar" || el.type === "image") {
    el.width = Math.round(Math.max(5, node.width() * node.scaleX()));
    el.height = Math.round(Math.max(5, node.height() * node.scaleY()));
    node.scaleX(1);
    node.scaleY(1);
  } else if (el.type === "avatar") {
    el.radius = Math.round(
      Math.max(5, (el.radius || 56) * ((node.scaleX() + node.scaleY()) / 2)),
    );
    node.scaleX(1);
    node.scaleY(1);
  } else if (el.type === "text") {
    el.width = Math.round(Math.max(20, node.width() * node.scaleX()));
    node.scaleX(1);
    node.scaleY(1);
  } else {
    el.scaleX = node.scaleX();
    el.scaleY = node.scaleY();
  }
}

function resetTemplate() {
  template.value = JSON.parse(JSON.stringify(DEFAULT_RANK_CARD_TEMPLATE));
  selectedElementIds.value = new Set();
}

function saveTemplate() {
  if (imageLayerCount(template.value.elements) > MAX_IMAGE_LAYERS) {
    toast.add({
      title: "Image layer limit reached",
      description: "A rank card template can contain up to 10 images.",
      color: "error",
    });
    return;
  }
  const clean = JSON.parse(JSON.stringify(template.value));
  emit("update:modelValue", clean);
  emit("save", clean);
}

// ── Lifecycle ──────────────────────────────────────────────────────────

onMounted(async () => {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleWindowBlur);

  await loadTemplateFonts(template.value.elements);
  stageRef.value?.getNode()?.batchDraw();
  undoStack.value = [JSON.stringify(template.value)];
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("blur", handleWindowBlur);
  if (historyTimer) clearTimeout(historyTimer);
});
</script>

<style scoped>
/* ── Foundation & Dark Glass Surface ── */
.rce {
  font-family:
    "Inter",
    system-ui,
    -apple-system,
    sans-serif;
  background: #0b0f19;
  color: #cbd5e1;
}

.rce-glass-panel {
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

/* ── Toolbar ── */
.rce-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  height: 44px;
}
.rce-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rce-toolbar-sep {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 2px;
}

/* ── Labels ── */
.rce-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
  letter-spacing: 0.02em;
  min-width: 14px;
  text-align: right;
}
.rce-panel-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.rce-prop-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
}

/* ── Inputs ── */
.rce-num-input {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 13px;
  padding: 5px 8px;
  font-variant-numeric: tabular-nums;
  outline: none;
  transition: border-color 0.15s;
}
.rce-num-input:focus {
  border-color: #6366f1;
}
.rce-textarea {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 13px;
  padding: 6px 8px;
  width: 100%;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}
.rce-textarea:focus {
  border-color: #6366f1;
}
.rce-select {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 13px;
  padding: 5px 8px;
  outline: none;
}

/* ── Buttons ── */
.rce-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: #94a3b8;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.rce-tool-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}
.rce-tool-btn-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: #64748b;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.rce-tool-btn-sm:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}
.rce-tool-btn-sm[aria-disabled="true"] {
  opacity: 0.35;
  cursor: not-allowed;
}
.rce-tool-btn-sm[aria-disabled="true"]:hover {
  background: transparent;
  color: #64748b;
}
.rce-tool-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.15s;
  color: #cbd5e1;
}
.rce-tool-row:hover {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
  color: #ffffff;
}

/* ── Color Chips ── */
.rce-color-chip-lg {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.1s;
}
.rce-color-chip-lg:hover {
  transform: scale(1.05);
}

/* ── Layers ── */
.rce-layer {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 12px;
  color: #94a3b8;
  background: transparent;
  border: 1px solid transparent;
  border-left-width: 3px;
  cursor: pointer;
  transition: all 0.1s;
}
.rce-layer:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}
.rce-layer-active {
  background: rgba(99, 102, 241, 0.18) !important;
  border-color: rgba(99, 102, 241, 0.4) !important;
  border-left-color: #6366f1 !important;
  color: #818cf8 !important;
  font-weight: 500;
}

/* ── Property Sections ── */
.rce-prop-section {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.rce-prop-title {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.rce-prop-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rce-placeholder-chip {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  padding: 3px 6px;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.1);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.2);
  cursor: pointer;
  transition: all 0.15s;
}
.rce-placeholder-chip:hover {
  background: rgba(99, 102, 241, 0.25);
  border-color: rgba(99, 102, 241, 0.5);
  color: #ffffff;
}

/* ── Konva Overrides ── */
.rce :deep(.konvajs-content) {
  border-radius: 0 !important;
}

/* Hide number input spinners */
.rce-num-input::-webkit-inner-spin-button,
.rce-num-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.rce-num-input {
  -moz-appearance: textfield;
  appearance: textfield;
}

/* ── Preset Buttons ── */
.rce-preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.15s;
  color: #94a3b8;
}
.rce-preset-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(99, 102, 241, 0.3);
  color: #e2e8f0;
}
.rce-preset-swatch {
  width: 100%;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
