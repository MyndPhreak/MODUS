<template>
  <div
    class="flex flex-wrap items-center gap-0.5 px-1 py-1 rounded-t-xl border border-b-0 border-white/10 bg-gray-900/70 backdrop-blur-xl"
  >
    <button
      v-for="action in actions"
      :key="action.key"
      type="button"
      :title="action.title"
      class="inline-flex items-center justify-center h-7 min-w-7 px-1.5 rounded-md text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-sm"
      @click.stop.prevent="run(action)"
    >
      <UIcon v-if="action.icon" :name="action.icon" class="text-sm" />
      <span v-else class="font-semibold leading-none" :class="action.labelClass">{{ action.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface Action {
  key: string;
  title: string;
  icon?: string;
  label?: string;
  labelClass?: string;
  kind: "wrap" | "linePrefix" | "insert";
  before?: string;
  after?: string;
  prefix?: string;
  template?: string;
  placeholder?: string;
}

const model = defineModel<string>({ required: true });

const props = defineProps<{
  target: HTMLTextAreaElement | HTMLInputElement | null | undefined;
}>();

const actions = computed<Action[]>(() => [
  { key: "bold", title: "Bold (Ctrl+B)", label: "B", labelClass: "font-bold", kind: "wrap", before: "**", after: "**", placeholder: "bold text" },
  { key: "italic", title: "Italic (Ctrl+I)", label: "I", labelClass: "italic", kind: "wrap", before: "*", after: "*", placeholder: "italic text" },
  { key: "underline", title: "Underline", label: "U", labelClass: "underline", kind: "wrap", before: "__", after: "__", placeholder: "underline" },
  { key: "strike", title: "Strikethrough", label: "S", labelClass: "line-through", kind: "wrap", before: "~~", after: "~~", placeholder: "strikethrough" },
  { key: "spoiler", title: "Spoiler", icon: "i-heroicons-eye-slash", kind: "wrap", before: "||", after: "||", placeholder: "spoiler" },
  { key: "code", title: "Inline code", icon: "i-heroicons-code-bracket", kind: "wrap", before: "`", after: "`", placeholder: "code" },
  { key: "codeblock", title: "Code block", icon: "i-heroicons-code-bracket-square", kind: "wrap", before: "```\n", after: "\n```", placeholder: "code block" },
  { key: "link", title: "Link", icon: "i-heroicons-link", kind: "wrap", before: "[", after: "](https://)", placeholder: "link text" },
  { key: "quote", title: "Quote", icon: "i-heroicons-chat-bubble-left", kind: "linePrefix", prefix: "> " },
  { key: "list", title: "Bullet list", icon: "i-heroicons-list-bullet", kind: "linePrefix", prefix: "- " },
  { key: "h1", title: "Heading", label: "H", labelClass: "font-bold", kind: "linePrefix", prefix: "## " },
]);

function run(action: Action) {
  const el = props.target;
  if (!el) return;

  const value = model.value ?? "";
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;

  if (action.kind === "wrap") {
    applyWrap(el, value, start, end, action);
  } else if (action.kind === "linePrefix") {
    applyLinePrefix(el, value, start, end, action);
  }
}

function applyWrap(
  el: HTMLTextAreaElement | HTMLInputElement,
  value: string,
  start: number,
  end: number,
  action: Action,
) {
  const selected = value.slice(start, end);
  const inner = selected || action.placeholder || "";
  const before = action.before ?? "";
  const after = action.after ?? "";
  const next = value.slice(0, start) + before + inner + after + value.slice(end);
  commit(el, next, start + before.length, start + before.length + inner.length);
}

function applyLinePrefix(
  el: HTMLTextAreaElement | HTMLInputElement,
  value: string,
  start: number,
  end: number,
  action: Action,
) {
  const prefix = action.prefix ?? "";
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
  const block = value.slice(lineStart, sliceEnd);
  const prefixed = block
    .split("\n")
    .map((line) => (line.startsWith(prefix) ? line : prefix + line))
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + value.slice(sliceEnd);
  const delta = prefixed.length - block.length;
  commit(el, next, start + prefix.length, end + delta);
}

function commit(
  el: HTMLTextAreaElement | HTMLInputElement,
  next: string,
  selStart: number,
  selEnd: number,
) {
  model.value = next;
  // Wait for Vue to flush the v-model update, then restore selection.
  requestAnimationFrame(() => {
    el.focus();
    try {
      el.setSelectionRange(selStart, selEnd);
    } catch {
      // Some input types don't support setSelectionRange — ignore.
    }
  });
}
</script>
