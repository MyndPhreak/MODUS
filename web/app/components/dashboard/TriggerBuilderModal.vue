<template>
  <USlideover v-model:open="isOpen" :ui="{ content: 'sm:max-w-3xl' }">
    <template #content>
    <div class="flex flex-col h-full bg-gray-950 border-l border-white/10">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <UIcon name="i-heroicons-bolt" class="text-emerald-400 text-xl" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-white">Trigger Builder</h2>
            <p class="text-xs text-gray-500">{{ trigger?.name || 'Loading...' }}</p>
          </div>
        </div>
        <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click="isOpen = false" />
      </div>

      <!-- Scrollable Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-8">
        
        <!-- 1. Sample Payload -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-medium text-white text-sm">1. Sample Payload</h3>
            <span class="text-xs text-gray-500">Paste JSON here to test filters and preview embeds</span>
          </div>
          <UTextarea
            v-model="sampleJson"
            placeholder="{&#10;  &#34;content&#34;: &#34;n8n fucked up&#34;&#10;}"
            :rows="8"
            class="w-full font-mono text-xs"
            :ui="{ base: 'w-full' }"
          />
          <div v-if="jsonError" class="text-xs text-red-400 flex items-center gap-1 mt-1">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
            Invalid JSON
          </div>
        </div>

        <!-- 1.5 Detected Fields -->
        <div v-if="detectedFields.length > 0" class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-medium text-white text-sm">Detected Fields</h3>
            <span class="text-xs text-gray-500">
              Click to insert into <span class="text-emerald-400">{{ lastFocusedField === 'description' ? 'Description' : 'Title' }}</span>
            </span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="field in detectedFields"
              :key="field.path"
              type="button"
              class="group inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-colors text-left max-w-full"
              @click="insertField(field.path)"
            >
              <code class="font-mono text-[11px] text-emerald-300 group-hover:text-emerald-200 shrink-0">{{ '{' + field.path + '}' }}</code>
              <span class="text-[10px] text-gray-500 truncate">{{ field.preview }}</span>
            </button>
          </div>
        </div>

        <!-- 2. Filters -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-medium text-white text-sm">2. Filter Rules</h3>
            <div class="flex items-center gap-2">
              <UBadge v-if="parsedSample" :color="filterPasses ? 'success' : 'error'" variant="soft" size="xs">
                {{ filterPasses ? 'Passes' : 'Fails' }}
              </UBadge>
              <UButton color="neutral" variant="soft" size="xs" icon="i-heroicons-plus" @click="addFilter">
                Add Rule
              </UButton>
            </div>
          </div>
          
          <div v-if="filters.length === 0" class="text-xs text-gray-500 italic p-3 border border-dashed border-white/10 rounded-lg text-center">
            No filters configured. All payloads will pass.
          </div>
          
          <div v-else class="space-y-2">
            <div v-for="(f, i) in filters" :key="i" class="flex items-center gap-2">
              <UInput v-model="f.key" placeholder="Key (e.g. content)" class="flex-1 font-mono text-xs" :ui="{ base: 'w-full' }" />
              <div class="text-gray-500 text-sm">==</div>
              <UInput v-model="f.value" placeholder="Value (e.g. *error*)" class="flex-1 font-mono text-xs" :ui="{ base: 'w-full' }" />
              <UButton color="error" variant="ghost" icon="i-heroicons-trash" size="xs" @click="removeFilter(i)" />
            </div>
            <p class="text-[10px] text-gray-500">Use asterisks (*) for wildcards, e.g. <code class="text-gray-400">*text*</code> to match any string containing "text". Deep paths like <code class="text-gray-400">data.error</code> are supported.</p>
          </div>
        </div>

        <!-- 3. Embed Template -->
        <div class="space-y-3">
          <h3 class="font-medium text-white text-sm">3. Embed Template</h3>
          <p class="text-[10px] text-gray-500">Use <code class="text-gray-400">{key.name}</code> to inject values from the sample payload.</p>
          
          <div class="space-y-4">
            <UFormField label="Color (Hex)" class="w-full">
              <div class="flex items-center gap-2 w-full">
                <input type="color" v-model="templateColor" class="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0" />
                <UInput v-model="templateColor" placeholder="#5865f2" class="flex-1 font-mono text-xs" :ui="{ base: 'w-full' }" />
              </div>
            </UFormField>
            <UFormField label="Title" class="w-full">
              <UInput
                v-model="templateTitle"
                placeholder="e.g. Alert: {content}"
                class="w-full"
                :ui="{ base: 'w-full' }"
                @focus="lastFocusedField = 'title'"
              />
            </UFormField>
            <UFormField label="Description" class="w-full">
              <UTextarea
                v-model="templateDesc"
                placeholder="Markdown supported..."
                :rows="4"
                class="w-full"
                :ui="{ base: 'w-full' }"
                @focus="lastFocusedField = 'description'"
              />
            </UFormField>
          </div>
        </div>

        <!-- 4. Preview -->
        <div class="space-y-3">
          <h3 class="font-medium text-white text-sm">Preview</h3>
          <div class="p-4 bg-gray-900 border border-white/5 rounded-xl">
            <EmbedPreview :form="previewForm" />
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="p-4 border-t border-white/10 flex justify-end gap-3 shrink-0 bg-gray-950">
        <UButton color="neutral" variant="soft" @click="isOpen = false">Cancel</UButton>
        <UButton color="primary" icon="i-heroicons-check" :loading="saving" @click="save">Save Changes</UButton>
      </div>
    </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { TriggerDocument } from '~/composables/useTriggers';
import EmbedPreview from '~/components/EmbedPreview.vue';

const props = defineProps<{
  trigger: TriggerDocument | null;
}>();

const isOpen = defineModel<boolean>('open', { default: false });
const emit = defineEmits(['save']);

const sampleJson = ref("{\n  \"content\": \"Example Payload\"\n}");
const jsonError = ref(false);

const parsedSample = computed(() => {
  if (!sampleJson.value.trim()) return {};
  try {
    jsonError.value = false;
    return JSON.parse(sampleJson.value);
  } catch {
    jsonError.value = true;
    return null;
  }
});

// Filters
const filters = ref<{key: string, value: string}[]>([]);

const addFilter = () => { filters.value.push({ key: '', value: '' }); };
const removeFilter = (idx: number) => { filters.value.splice(idx, 1); };

// Template
const templateTitle = ref("");
const templateDesc = ref("");
const templateColor = ref("#5865f2");

const lastFocusedField = ref<'title' | 'description'>('title');

const saving = ref(false);

// Walk parsed JSON and emit a flat list of leaf paths with previewable values.
function flattenLeaves(value: any, prefix = "", out: { path: string; preview: string }[] = [], depth = 0): { path: string; preview: string }[] {
  if (out.length >= 40 || depth > 6) return out;
  if (value === null || value === undefined) {
    if (prefix) out.push({ path: prefix, preview: String(value) });
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      if (prefix) out.push({ path: prefix, preview: '[]' });
      return out;
    }
    // Only descend into the first element to avoid index explosions.
    flattenLeaves(value[0], `${prefix}[0]`, out, depth + 1);
    return out;
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      flattenLeaves(value[key], prefix ? `${prefix}.${key}` : key, out, depth + 1);
      if (out.length >= 40) break;
    }
    return out;
  }
  if (prefix) {
    let preview = String(value);
    if (preview.length > 40) preview = preview.slice(0, 37) + '…';
    out.push({ path: prefix, preview });
  }
  return out;
}

const detectedFields = computed(() => {
  if (!parsedSample.value || typeof parsedSample.value !== 'object') return [];
  return flattenLeaves(parsedSample.value);
});

function insertField(path: string) {
  const token = `{${path}}`;
  if (lastFocusedField.value === 'description') {
    templateDesc.value = templateDesc.value ? `${templateDesc.value} ${token}` : token;
  } else {
    templateTitle.value = templateTitle.value ? `${templateTitle.value} ${token}` : token;
  }
}

// Initialize when opened
watch(() => isOpen.value, (val) => {
  if (val && props.trigger) {
    // Load filters
    try {
      if (props.trigger.filters) {
        const f = JSON.parse(props.trigger.filters);
        filters.value = Object.entries(f).map(([key, value]) => ({ key, value: String(value) }));
      } else {
        filters.value = [];
      }
    } catch {
      filters.value = [];
    }

    // Load template
    try {
      if (props.trigger.embed_template) {
        const t = JSON.parse(props.trigger.embed_template);
        templateTitle.value = t.title || "";
        templateDesc.value = t.description || "";
        templateColor.value = t.color ? '#' + t.color.toString(16).padStart(6, '0') : "#5865f2";
      } else {
        templateTitle.value = "";
        templateDesc.value = "";
        templateColor.value = "#5865f2";
      }
    } catch {
      templateTitle.value = "";
      templateDesc.value = "";
      templateColor.value = "#5865f2";
    }
  }
});

// Frontend evaluation logic matching backend
function resolveNestedPath(data: any, path: string): any {
  if (!data) return undefined;
  if (path in data) return data[path];
  const keys = path.split(".");
  let value: any = data;
  for (const key of keys) {
    if (value == null || typeof value !== "object") return undefined;
    value = value[key];
  }
  return value;
}

function resolvePlaceholders(template: string, data: any): string {
  if (!data) return template;
  return template.replace(/\{([^}]+)\}/g, (match, path) => {
    const val = resolveNestedPath(data, path);
    return val != null ? String(val) : match;
  });
}

const filterPasses = computed(() => {
  if (!parsedSample.value) return false;
  if (filters.value.length === 0) return true;
  
  for (const f of filters.value) {
    if (!f.key) continue;
    const actual = resolveNestedPath(parsedSample.value, f.key);
    const expected = f.value;
    
    let match = false;
    if (actual === expected) {
      match = true;
    } else if (typeof actual === "string" && typeof expected === "string") {
      const expectedLower = expected.toLowerCase();
      const actualLower = actual.toLowerCase();
      if (expectedLower.startsWith("*") && expectedLower.endsWith("*")) {
        match = actualLower.includes(expectedLower.slice(1, -1));
      } else if (expectedLower.startsWith("*")) {
        match = actualLower.endsWith(expectedLower.slice(1));
      } else if (expectedLower.endsWith("*")) {
        match = actualLower.startsWith(expectedLower.slice(0, -1));
      }
    }
    if (!match) return false;
  }
  return true;
});

const previewForm = computed(() => {
  const data = parsedSample.value || {};

  let previewTitle = templateTitle.value ? resolvePlaceholders(templateTitle.value, data) : undefined;
  let previewDesc = templateDesc.value ? resolvePlaceholders(templateDesc.value, data) : undefined;

  // Build inline embed fields from detected leaves when no template content is set,
  // so the preview shows a real embed instead of a raw JSON code block.
  let fields: { name: string; value: string; inline: boolean }[] = [];
  if (!previewTitle && !previewDesc) {
    previewTitle = "🔔 Webhook Triggered";
    fields = detectedFields.value.slice(0, 25).map((f) => ({
      name: f.path,
      value: f.preview || '—',
      inline: f.preview.length <= 24,
    }));
  }

  return {
    title: previewTitle,
    description: previewDesc,
    color: templateColor.value,
    fields,
    authorName: undefined,
    authorIconUrl: undefined,
    authorUrl: undefined,
    imageUrl: undefined,
    thumbnailUrl: undefined,
    footerText: undefined,
    footerIconUrl: undefined,
    showTimestamp: true
  } as any;
});

const save = async () => {
  saving.value = true;
  
  const finalFilters = {} as Record<string, string>;
  for (const f of filters.value) {
    if (f.key) finalFilters[f.key] = f.value;
  }
  
  const finalTemplate = {} as any;
  if (templateTitle.value) finalTemplate.title = templateTitle.value;
  if (templateDesc.value) finalTemplate.description = templateDesc.value;
  
  // Parse color hex back to integer
  if (templateColor.value) {
    const hexStr = templateColor.value.replace('#', '');
    if (hexStr) {
      finalTemplate.color = parseInt(hexStr, 16);
    }
  }

  emit('save', {
    filters: Object.keys(finalFilters).length > 0 ? JSON.stringify(finalFilters) : null,
    embed_template: Object.keys(finalTemplate).length > 0 ? JSON.stringify(finalTemplate) : null
  });
  
  saving.value = false;
  isOpen.value = false;
};
</script>
