<template>
  <div class="space-y-4">
    <!-- Content Section -->
    <details class="group" open>
      <summary
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"
        />
        <div class="relative flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div
              class="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20"
            >
              <UIcon
                name="i-heroicons-document-text"
                class="text-blue-400 text-sm"
              />
            </div>
            <h3 class="text-sm font-semibold text-white">Content</h3>
            <UBadge
              v-if="form.title || form.description"
              color="success"
              variant="subtle"
              size="xs"
            >
              ✓
            </UBadge>
          </div>
          <UIcon
            name="i-heroicons-chevron-down"
            class="text-gray-400 transition-transform group-open:rotate-180"
          />
        </div>
      </summary>
      <div
        class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 space-y-3 -mt-1"
      >
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5"
            >Title</label
          >
          <UInput
            v-model="form.title"
            placeholder="Enter a catchy title..."
            :maxlength="256"
            size="lg"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">
            URL
            <span class="text-gray-500 text-xs font-normal"
              >(makes title clickable)</span
            >
          </label>
          <UInput
            v-model="form.url"
            placeholder="https://example.com"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">
            Description
            <span class="text-gray-500 text-xs font-normal"
              >(Markdown supported)</span
            >
          </label>
          <MarkdownToolbar
            v-model="form.description"
            :target="descriptionEl"
          />
          <UTextarea
            ref="descriptionRef"
            v-model="form.description"
            placeholder="Enter your message..."
            :rows="4"
            :maxlength="4096"
            size="lg"
            autoresize
            class="w-full"
            :ui="{ base: 'rounded-t-none' }"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5"
            >Color</label
          >
          <div class="flex items-center gap-3">
            <input
              v-model="form.color"
              type="color"
              class="w-10 h-10 rounded-lg cursor-pointer border-2 border-white/10 bg-transparent hover:border-primary-500/50 transition-colors"
            />
            <UInput
              v-model="form.color"
              placeholder="#5865F2"
              class="flex-1 w-full"
            />
          </div>
          <div class="flex gap-1.5 mt-2">
            <button
              v-for="(hex, name) in presetColors"
              :key="name"
              type="button"
              :title="name"
              class="group/color relative w-8 h-8 rounded-md border-2 transition-all hover:scale-110"
              :class="
                form.color === hex ? 'border-white scale-110' : 'border-white/20'
              "
              :style="{ backgroundColor: hex }"
              @click="form.color = hex"
            >
              <span
                class="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover/color:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
              >
                {{ name }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </details>

    <!-- Author Section -->
    <details v-if="sections.author" class="group">
      <summary
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none"
        />
        <div class="relative flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div
              class="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20"
            >
              <UIcon name="i-heroicons-user" class="text-purple-400 text-sm" />
            </div>
            <h3 class="text-sm font-semibold text-white">Author</h3>
            <UBadge
              v-if="form.authorName"
              color="success"
              variant="subtle"
              size="xs"
            >
              ✓
            </UBadge>
          </div>
          <UIcon
            name="i-heroicons-chevron-down"
            class="text-gray-400 transition-transform group-open:rotate-180"
          />
        </div>
      </summary>
      <div
        class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 space-y-3 -mt-1"
      >
        <UInput
          v-model="form.authorName"
          placeholder="Author name"
          class="w-full"
        />
        <UInput
          v-model="form.authorUrl"
          placeholder="Author URL (optional)"
          class="w-full"
        />
        <UInput
          v-model="form.authorIconUrl"
          placeholder="Author icon URL (optional)"
          class="w-full"
        />
      </div>
    </details>

    <!-- Fields Section -->
    <details v-if="sections.fields" class="group">
      <summary
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"
        />
        <div class="relative flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div
              class="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
            >
              <UIcon
                name="i-heroicons-list-bullet"
                class="text-emerald-400 text-sm"
              />
            </div>
            <h3 class="text-sm font-semibold text-white">Fields</h3>
            <UBadge
              :color="form.fields.length >= 25 ? 'error' : 'neutral'"
              variant="soft"
              size="xs"
            >
              {{ form.fields.length }}/25
            </UBadge>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-heroicons-plus"
              size="xs"
              :disabled="form.fields.length >= 25"
              @click.stop="addField"
            >
              Add
            </UButton>
            <UIcon
              name="i-heroicons-chevron-down"
              class="text-gray-400 transition-transform group-open:rotate-180"
            />
          </div>
        </div>
      </summary>
      <div
        class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 -mt-1"
      >
        <div v-if="form.fields.length === 0" class="py-4 text-center">
          <UIcon
            name="i-heroicons-inbox"
            class="text-3xl text-gray-600 mb-1"
          />
          <p class="text-xs text-gray-500">
            No fields yet. Click "Add" to create one.
          </p>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="(field, index) in form.fields"
            :key="index"
            class="relative group/field p-3 rounded-lg bg-gray-800/50 border border-white/5 hover:border-white/10 transition-colors"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-gray-400"
                >Field {{ index + 1 }}</span
              >
              <UButton
                icon="i-heroicons-trash"
                size="xs"
                color="error"
                variant="ghost"
                @click="removeField(index)"
              />
            </div>
            <div class="space-y-2">
              <UInput
                v-model="field.name"
                placeholder="Field name"
                class="w-full"
              />
              <UTextarea
                v-model="field.value"
                placeholder="Field value (Markdown supported)"
                :rows="2"
                autoresize
                class="w-full"
              />
              <div class="flex items-center gap-2 pt-1">
                <USwitch v-model="field.inline" size="sm" />
                <span class="text-xs text-gray-400">Inline</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </details>

    <!-- Images Section -->
    <details v-if="sections.images" class="group">
      <summary
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent pointer-events-none"
        />
        <div class="relative flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div
              class="p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20"
            >
              <UIcon name="i-heroicons-photo" class="text-pink-400 text-sm" />
            </div>
            <h3 class="text-sm font-semibold text-white">Images</h3>
            <UBadge
              v-if="form.imageUrl || form.thumbnailUrl"
              color="success"
              variant="subtle"
              size="xs"
            >
              ✓
            </UBadge>
          </div>
          <UIcon
            name="i-heroicons-chevron-down"
            class="text-gray-400 transition-transform group-open:rotate-180"
          />
        </div>
      </summary>
      <div
        class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 space-y-3 -mt-1"
      >
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">
            Large Image
            <span class="text-gray-500 text-xs font-normal">(full width)</span>
          </label>
          <UInput
            v-model="form.imageUrl"
            placeholder="https://example.com/image.png"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1.5">
            Thumbnail
            <span class="text-gray-500 text-xs font-normal"
              >(small, top-right)</span
            >
          </label>
          <UInput
            v-model="form.thumbnailUrl"
            placeholder="https://example.com/thumb.png"
            class="w-full"
          />
        </div>
      </div>
    </details>

    <!-- Footer Section -->
    <details v-if="sections.footer" class="group">
      <summary
        class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-4 cursor-pointer list-none select-none hover:border-white/20 transition-colors"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent pointer-events-none"
        />
        <div class="relative flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div
              class="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20"
            >
              <UIcon
                name="i-heroicons-chat-bubble-bottom-center-text"
                class="text-orange-400 text-sm"
              />
            </div>
            <h3 class="text-sm font-semibold text-white">Footer</h3>
            <UBadge
              v-if="form.footerText"
              color="success"
              variant="subtle"
              size="xs"
            >
              ✓
            </UBadge>
          </div>
          <UIcon
            name="i-heroicons-chevron-down"
            class="text-gray-400 transition-transform group-open:rotate-180"
          />
        </div>
      </summary>
      <div
        class="rounded-b-xl border border-t-0 border-white/10 bg-gray-900/50 p-4 space-y-3 -mt-1"
      >
        <UInput
          v-model="form.footerText"
          placeholder="Footer text"
          class="w-full"
        />
        <UInput
          v-model="form.footerIconUrl"
          placeholder="Footer icon URL (optional)"
          class="w-full"
        />
        <div class="flex items-center gap-2">
          <USwitch v-model="form.showTimestamp" />
          <span class="text-sm text-gray-400">Show timestamp</span>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { EmbedForm } from "~/utils/embed-form";

const form = defineModel<EmbedForm>({ required: true });

interface SectionVisibility {
  author?: boolean;
  fields?: boolean;
  images?: boolean;
  footer?: boolean;
}

const props = withDefaults(
  defineProps<{
    sections?: SectionVisibility;
  }>(),
  {
    sections: () => ({
      author: true,
      fields: true,
      images: true,
      footer: true,
    }),
  },
);

const sections = computed<Required<SectionVisibility>>(() => ({
  author: props.sections.author ?? true,
  fields: props.sections.fields ?? true,
  images: props.sections.images ?? true,
  footer: props.sections.footer ?? true,
}));

const presetColors: Record<string, string> = {
  Blurple: "#5865f2",
  Green: "#57f287",
  Yellow: "#fee75c",
  Red: "#ed4245",
  Fuchsia: "#eb459e",
  Orange: "#e67e22",
  Blue: "#3498db",
  Purple: "#9b59b6",
};

const descriptionRef = ref<{ textareaRef: HTMLTextAreaElement | null } | null>(
  null,
);
const descriptionEl = computed(
  () => descriptionRef.value?.textareaRef ?? null,
);

function addField() {
  if (form.value.fields.length >= 25) return;
  form.value.fields.push({ name: "", value: "", inline: false });
}

function removeField(index: number) {
  form.value.fields.splice(index, 1);
}
</script>
