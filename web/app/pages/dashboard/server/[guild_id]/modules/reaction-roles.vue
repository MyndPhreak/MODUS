<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/dashboard/server/${guildId}/modules`"
        class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <UIcon name="i-heroicons-arrow-left" class="text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div
          class="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20"
        >
          <UIcon
            name="i-heroicons-cursor-arrow-rays"
            class="text-violet-400 text-lg"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Button Roles</h2>
          <p class="text-xs text-gray-500">
            Create panels with buttons or dropdowns that toggle roles
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('reaction-roles') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{
          isModuleEnabled("reaction-roles")
            ? "Module Active"
            : "Module Disabled"
        }}
      </UBadge>
    </div>

    <!-- Panel list + editor split -->
    <div class="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6">
      <!-- Panel Sidebar -->
      <div class="space-y-3">
        <!-- Add panel -->
        <UButton
          color="primary"
          variant="soft"
          icon="i-heroicons-plus"
          class="w-full justify-center"
          @click="showAddPanel = true"
        >
          New Panel
        </UButton>

        <!-- Panel list -->
        <div class="space-y-1.5">
          <button
            v-for="panel in settings.panels"
            :key="panel.id"
            :class="[
              'w-full text-left px-3 py-2.5 rounded-lg border transition-all',
              selectedPanelId === panel.id
                ? 'bg-white/10 border-violet-500/40 text-white'
                : 'bg-white/[0.03] border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-300',
            ]"
            @click="selectedPanelId = panel.id"
          >
            <div class="flex items-center gap-2 min-w-0">
              <UIcon
                :name="
                  panel.type === 'dropdown'
                    ? 'i-heroicons-chevron-down-circle'
                    : 'i-heroicons-squares-2x2'
                "
                class="text-sm shrink-0"
              />
              <span class="text-sm font-medium truncate">{{
                panel.name
              }}</span>
              <div class="ml-auto shrink-0 flex items-center gap-1">
                <span class="text-[10px] text-gray-600">{{
                  panel.entries.length
                }}</span>
                <UIcon
                  v-if="panel.messageId"
                  name="i-heroicons-check-circle"
                  class="text-green-500 text-xs"
                />
              </div>
            </div>
          </button>

          <!-- Empty state -->
          <div
            v-if="settings.panels.length === 0"
            class="flex flex-col items-center justify-center py-8 text-center rounded-lg bg-white/[0.02] border border-white/5"
          >
            <UIcon
              name="i-heroicons-squares-2x2"
              class="w-8 h-8 text-gray-700 mb-2"
            />
            <p class="text-xs text-gray-500">No panels yet</p>
          </div>
        </div>
      </div>

      <!-- Panel Editor -->
      <div v-if="selectedPanel" class="space-y-5">
        <!-- Panel meta -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none"
          />
          <div class="relative space-y-4">
            <div class="flex items-center gap-2 justify-between">
              <div class="flex items-center gap-2">
                <div
                  class="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
                >
                  <UIcon
                    name="i-heroicons-pencil-square"
                    class="text-violet-400"
                  />
                </div>
                <h3 class="font-semibold text-white">Panel Settings</h3>
              </div>
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                icon="i-heroicons-trash"
                @click="deletePanel(selectedPanel!.id)"
              >
                Delete
              </UButton>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField label="Panel Name">
                <UInput
                  v-model="selectedPanel.name"
                  placeholder="e.g. Game Roles"
                  icon="i-heroicons-tag"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Panel Type"
                :description="
                  selectedPanel.type === 'dropdown'
                    ? 'Dropdown: users pick multiple roles from a select menu (max 25)'
                    : 'Buttons: each role gets its own clickable button (max 5×5)'
                "
              >
                <USelectMenu
                  v-model="selectedPanel.type"
                  :items="panelTypeOptions"
                  value-key="value"
                  icon="i-heroicons-squares-2x2"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </div>

        <!-- Embed editor -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"
          />
          <div class="relative space-y-4">
            <div class="flex items-center gap-2 mb-1">
              <div
                class="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
              >
                <UIcon
                  name="i-heroicons-document-text"
                  class="text-indigo-400"
                />
              </div>
              <div>
                <h3 class="font-semibold text-white">Panel Embed</h3>
                <p class="text-[10px] text-gray-500">
                  The message displayed above the panel
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField label="Title">
                <UInput
                  v-model="selectedPanel.embed.title"
                  placeholder="e.g. Choose Your Roles"
                  icon="i-heroicons-h1"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Accent Color">
                <div class="flex items-center gap-2">
                  <input
                    type="color"
                    v-model="selectedPanel.embed.color"
                    class="h-9 w-12 rounded-lg border border-white/10 bg-transparent cursor-pointer shrink-0"
                  />
                  <UInput
                    v-model="selectedPanel.embed.color"
                    placeholder="#5865F2"
                    icon="i-heroicons-swatch"
                    class="w-full"
                  />
                </div>
              </UFormField>
            </div>

            <UFormField label="Description">
              <UTextarea
                v-model="selectedPanel.embed.description"
                placeholder="Select a role from the options below."
                :rows="2"
                resize
                class="w-full"
              />
            </UFormField>

            <!-- Live preview -->
            <div
              v-if="
                selectedPanel.embed.title || selectedPanel.embed.description
              "
              class="flex items-start gap-3 p-3 rounded-lg border-l-4 bg-white/[0.03] border"
              :style="{
                borderLeftColor: selectedPanel.embed.color || '#5865F2',
                borderColor: 'rgba(255,255,255,0.06)',
              }"
            >
              <div class="flex-1 min-w-0">
                <p
                  v-if="selectedPanel.embed.title"
                  class="text-sm font-semibold text-white truncate"
                >
                  {{ selectedPanel.embed.title }}
                </p>
                <p
                  v-if="selectedPanel.embed.description"
                  class="text-xs text-gray-400 mt-0.5 line-clamp-2"
                >
                  {{ selectedPanel.embed.description }}
                </p>
              </div>
              <UBadge size="xs" color="neutral" variant="soft">Preview</UBadge>
            </div>
          </div>
        </div>

        <!-- Entries / Roles -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none"
          />
          <div class="relative space-y-4">
            <div class="flex items-center gap-2">
              <div
                class="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20"
              >
                <UIcon
                  name="i-heroicons-shield-check"
                  class="text-green-400"
                />
              </div>
              <div class="flex-1">
                <h3 class="font-semibold text-white">Role Entries</h3>
                <p class="text-[10px] text-gray-500">
                  {{
                    selectedPanel.type === "dropdown"
                      ? "Up to 25 options in the select menu"
                      : "Up to 25 buttons (5 per row)"
                  }}
                </p>
              </div>
              <UButton
                size="xs"
                color="primary"
                variant="soft"
                icon="i-heroicons-plus"
                :disabled="selectedPanel.entries.length >= 25"
                @click="addEntry"
              >
                Add Entry
              </UButton>
            </div>

            <!-- Empty -->
            <div
              v-if="selectedPanel.entries.length === 0"
              class="flex flex-col items-center justify-center py-8 text-center"
            >
              <UIcon
                name="i-heroicons-shield-check"
                class="w-7 h-7 text-gray-700 mb-2"
              />
              <p class="text-xs text-gray-500">
                No entries yet — click "Add Entry"
              </p>
            </div>

            <!-- Entry list -->
            <div v-else class="space-y-3">
              <div
                v-for="(entry, idx) in selectedPanel.entries"
                :key="entry.id"
                class="rounded-lg bg-white/[0.03] border border-white/5 p-4 space-y-3"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-medium text-gray-400">
                    {{
                      selectedPanel.type === "dropdown" ? "Option" : "Button"
                    }}
                    {{ idx + 1 }}
                  </span>
                  <UButton
                    color="error"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-x-mark"
                    @click="removeEntry(idx)"
                  />
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <UFormField label="Label">
                    <UInput
                      v-model="entry.label"
                      placeholder="e.g. 🎮 Gamer"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Emoji" hint="Optional">
                    <UInput
                      v-model="entry.emoji"
                      placeholder="e.g. 🎮"
                      class="w-full"
                    />
                  </UFormField>

                  <!-- Style (only for buttons) -->
                  <UFormField
                    v-if="selectedPanel.type === 'buttons'"
                    label="Button Color"
                  >
                    <USelectMenu
                      v-model="entry.style"
                      :items="buttonStyleOptions"
                      value-key="value"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Role">
                    <div
                      v-if="state.rolesLoading"
                      class="flex items-center gap-2 py-1.5 text-gray-400"
                    >
                      <UIcon
                        name="i-heroicons-arrow-path"
                        class="animate-spin text-green-400 text-sm"
                      />
                      <span class="text-xs">Loading…</span>
                    </div>
                    <USelectMenu
                      v-else-if="roleOptions.length > 0"
                      v-model="entry.roleId"
                      :items="roleOptions"
                      value-key="value"
                      placeholder="Select role…"
                      searchable
                      class="w-full"
                    />
                    <p
                      v-else
                      class="text-xs text-gray-600 italic py-1.5"
                    >
                      No roles available
                    </p>
                  </UFormField>
                </div>

                <!-- Button preview (only for button panels) -->
                <div
                  v-if="selectedPanel.type === 'buttons'"
                  class="flex items-center gap-2"
                >
                  <span
                    class="text-[10px] text-gray-600 uppercase tracking-wider"
                    >Preview</span
                  >
                  <button
                    :class="[
                      'px-3 py-1 rounded text-xs font-medium pointer-events-none select-none',
                      previewClass(entry.style),
                    ]"
                  >
                    <span v-if="entry.emoji" class="mr-1">{{
                      entry.emoji
                    }}</span>
                    {{ entry.label || "Button" }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Deploy info -->
        <div
          class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
        >
          <div
            class="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none"
          />
          <div class="relative space-y-3">
            <div class="flex items-center gap-2">
              <div
                class="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
              >
                <UIcon
                  name="i-heroicons-rocket-launch"
                  class="text-amber-400"
                />
              </div>
              <h3 class="font-semibold text-white">Deploy to Discord</h3>
            </div>
            <p class="text-xs text-gray-400">
              After saving, run this command in your Discord server to post the
              panel:
            </p>
            <div
              class="flex items-center gap-3 p-3 rounded-lg bg-black/30 border border-white/5 font-mono"
            >
              <UIcon
                name="i-heroicons-command-line"
                class="text-gray-500 shrink-0"
              />
              <code class="text-violet-400 text-sm select-all">
                /buttonroles deploy {{ selectedPanel.name }} #channel
              </code>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-document-duplicate"
                class="ml-auto shrink-0"
                @click="
                  copyCommand(
                    `/buttonroles deploy ${selectedPanel.name} #channel`,
                  )
                "
              >
                Copy
              </UButton>
            </div>
            <div
              v-if="selectedPanel.messageId"
              class="flex items-center gap-2 text-xs text-green-400"
            >
              <UIcon name="i-heroicons-check-circle" />
              <span
                >Panel is currently deployed. Re-running the command will update
                it in-place.</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- No panel selected placeholder -->
      <div
        v-else
        class="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 py-20 text-center"
      >
        <div
          class="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4"
        >
          <UIcon
            name="i-heroicons-cursor-arrow-rays"
            class="w-8 h-8 text-gray-600"
          />
        </div>
        <p class="text-gray-400 font-medium">Select a panel to edit</p>
        <p class="text-xs text-gray-600 mt-1">
          Or create a new panel with the button above
        </p>
      </div>
    </div>

    <!-- Save -->
    <div class="flex justify-end">
      <UButton
        color="primary"
        size="lg"
        icon="i-heroicons-check"
        :loading="saving"
        @click="save"
        class="min-w-[200px]"
      >
        Save All Panels
      </UButton>
    </div>

    <!-- Add Panel Modal -->
    <UModal v-model:open="showAddPanel" title="Create New Panel">
      <template #body>
        <div class="space-y-4 p-1">
          <UFormField label="Panel Name">
            <UInput
              v-model="newPanel.name"
              placeholder="e.g. Game Roles"
              icon="i-heroicons-tag"
              class="w-full"
              autofocus
            />
          </UFormField>

          <UFormField
            label="Panel Type"
            :description="
              newPanel.type === 'dropdown'
                ? 'A select menu where users pick from a list — great for many roles.'
                : 'Individual buttons for each role — great for up to 5–10 visually distinct roles.'
            "
          >
            <USelectMenu
              v-model="newPanel.type"
              :items="panelTypeOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton
            variant="ghost"
            color="neutral"
            @click="showAddPanel = false"
            >Cancel</UButton
          >
          <UButton
            color="primary"
            icon="i-heroicons-plus"
            :disabled="!newPanel.name.trim()"
            @click="createPanel"
          >
            Create Panel
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";

const toast = useToast();
const route = useRoute();
const guildId = route.params.guild_id as string;
const {
  state,
  isModuleEnabled,
  saveModuleSettings,
  getModuleConfig,
  loadRoles,
  roleOptions,
} = useServerSettings(guildId);

const saving = ref(false);
const showAddPanel = ref(false);
const selectedPanelId = ref<string | null>(null);

// ── Types ────────────────────────────────────────────────────────────

interface PanelEmbed {
  title: string;
  description: string;
  color: string;
}

interface RoleEntry {
  id: string;
  label: string;
  emoji: string;
  style: "Primary" | "Secondary" | "Success" | "Danger";
  roleId: string;
}

interface RolePanel {
  id: string;
  name: string;
  channelId?: string;
  messageId?: string;
  type: "buttons" | "dropdown";
  embed: PanelEmbed;
  entries: RoleEntry[];
}

interface ButtonRolesForm {
  panels: RolePanel[];
}

// ── State ────────────────────────────────────────────────────────────

const settings = reactive<ButtonRolesForm>({ panels: [] });

const newPanel = reactive({
  name: "",
  type: "buttons" as "buttons" | "dropdown",
});

const selectedPanel = computed<RolePanel | null>(() => {
  if (!selectedPanelId.value) return null;
  return settings.panels.find((p) => p.id === selectedPanelId.value) ?? null;
});

// ── Constants ────────────────────────────────────────────────────────

const panelTypeOptions = [
  { label: "🔲 Buttons", value: "buttons" },
  { label: "▾ Dropdown (Select Menu)", value: "dropdown" },
];

const buttonStyleOptions = [
  { label: "🟦 Blurple (Primary)", value: "Primary" },
  { label: "⬜ Grey (Secondary)", value: "Secondary" },
  { label: "🟩 Green (Success)", value: "Success" },
  { label: "🟥 Red (Danger)", value: "Danger" },
];

// ── Helpers ───────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function previewClass(style: string): string {
  const map: Record<string, string> = {
    Primary: "bg-[#5865F2] text-white",
    Secondary: "bg-[#4f545c] text-white",
    Success: "bg-[#3ba55d] text-white",
    Danger: "bg-[#ed4245] text-white",
  };
  return map[style] ?? map["Primary"]!;
}

function copyCommand(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.add({ title: "Copied!", color: "success" });
  });
}

function createPanel() {
  if (!newPanel.name.trim()) return;
  const panel: RolePanel = {
    id: uid(),
    name: newPanel.name.trim(),
    type: newPanel.type,
    embed: { title: "", description: "", color: "#5865F2" },
    entries: [],
  };
  settings.panels.push(panel);
  selectedPanelId.value = panel.id;
  newPanel.name = "";
  newPanel.type = "buttons";
  showAddPanel.value = false;
}

function deletePanel(id: string) {
  const idx = settings.panels.findIndex((p) => p.id === id);
  if (idx > -1) {
    settings.panels.splice(idx, 1);
    selectedPanelId.value = settings.panels[0]?.id ?? null;
  }
}

function addEntry() {
  if (!selectedPanel.value) return;
  selectedPanel.value.entries.push({
    id: uid(),
    label: "",
    emoji: "",
    style: "Primary",
    roleId: "",
  });
}

function removeEntry(index: number) {
  selectedPanel.value?.entries.splice(index, 1);
}

// ── Save ─────────────────────────────────────────────────────────────

const save = async () => {
  saving.value = true;
  await saveModuleSettings("reaction-roles", {
    panels: settings.panels.map((p) => ({
      id: p.id,
      name: p.name,
      channelId: p.channelId,
      messageId: p.messageId,
      type: p.type,
      embed: {
        title: p.embed.title || undefined,
        description: p.embed.description || undefined,
        color: p.embed.color || undefined,
      },
      entries: p.entries.map((e) => ({
        id: e.id,
        label: e.label,
        emoji: e.emoji || undefined,
        style: e.style,
        roleId: e.roleId,
      })),
    })),
  });
  saving.value = false;
};

// ── Init ─────────────────────────────────────────────────────────────

onMounted(async () => {
  const saved = getModuleConfig("reaction-roles");
  if (saved?.panels && Array.isArray(saved.panels)) {
    settings.panels = saved.panels.map((p: any) => ({
      id: p.id ?? uid(),
      name: p.name ?? "Unnamed Panel",
      channelId: p.channelId,
      messageId: p.messageId,
      type: p.type ?? "buttons",
      embed: {
        title: p.embed?.title ?? "",
        description: p.embed?.description ?? "",
        color: p.embed?.color ?? "#5865F2",
      },
      entries: (p.entries ?? []).map((e: any) => ({
        id: e.id ?? uid(),
        label: e.label ?? "",
        emoji: e.emoji ?? "",
        style: e.style ?? "Primary",
        roleId: e.roleId ?? "",
      })),
    }));
    if (settings.panels.length > 0) {
      selectedPanelId.value = settings.panels[0]!.id;
    }
  }
  await loadRoles();
});
</script>
