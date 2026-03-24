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
          class="p-2.5 rounded-xl bg-green-500/10 border border-green-500/20"
        >
          <UIcon
            name="i-heroicons-check-badge"
            class="text-green-400 text-lg"
          />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Verification Gate</h2>
          <p class="text-xs text-gray-500">
            Customise the embed and buttons members see when they join
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('verification') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{
          isModuleEnabled("verification") ? "Module Active" : "Module Disabled"
        }}
      </UBadge>
    </div>

    <!-- Embed Config -->
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
            <UIcon name="i-heroicons-document-text" class="text-indigo-400" />
          </div>
          <div>
            <h3 class="font-semibold text-white">Panel Embed</h3>
            <p class="text-[10px] text-gray-500">
              The message displayed above the verify buttons
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Title">
            <UInput
              v-model="settings.embed.title"
              placeholder="e.g. Welcome to the Server!"
              size="md"
              class="w-full"
              icon="i-heroicons-h1"
            />
          </UFormField>
          <UFormField label="Accent Color">
            <div class="flex items-center gap-2">
              <input
                type="color"
                v-model="settings.embed.color"
                class="h-9 w-12 rounded-lg border border-white/10 bg-transparent cursor-pointer"
              />
              <UInput
                v-model="settings.embed.color"
                placeholder="#5865F2"
                size="md"
                class="w-full"
                icon="i-heroicons-swatch"
              />
            </div>
          </UFormField>
        </div>

        <UFormField label="Description">
          <UTextarea
            v-model="settings.embed.description"
            placeholder="Welcome! Click the button below to verify yourself and gain access to the server."
            :rows="3"
            resize
            class="w-full"
          />
        </UFormField>

        <!-- Live preview chip -->
        <div
          v-if="settings.embed.title || settings.embed.description"
          class="flex items-start gap-3 p-3 rounded-lg border-l-4 bg-white/[0.03] border"
          :style="{
            borderLeftColor: settings.embed.color || '#5865F2',
            borderColor: 'rgba(255,255,255,0.06)',
          }"
        >
          <div class="flex-1 min-w-0">
            <p
              v-if="settings.embed.title"
              class="text-sm font-semibold text-white truncate"
            >
              {{ settings.embed.title }}
            </p>
            <p
              v-if="settings.embed.description"
              class="text-xs text-gray-400 mt-0.5 line-clamp-2"
            >
              {{ settings.embed.description }}
            </p>
          </div>
          <UBadge size="xs" color="neutral" variant="soft">Preview</UBadge>
        </div>
      </div>
    </div>

    <!-- Buttons Builder -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-4">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20"
          >
            <UIcon
              name="i-heroicons-cursor-arrow-rays"
              class="text-green-400"
            />
          </div>
          <div class="flex-1">
            <h3 class="font-semibold text-white">Verify Buttons</h3>
            <p class="text-[10px] text-gray-500">
              Each button assigns a role when clicked — max 5 per row, up to 25
              total
            </p>
          </div>
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-heroicons-plus"
            :disabled="settings.buttons.length >= 25"
            @click="addButton"
          >
            Add Button
          </UButton>
        </div>

        <!-- Empty state -->
        <div
          v-if="settings.buttons.length === 0"
          class="flex flex-col items-center justify-center py-10 text-center"
        >
          <div
            class="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-3"
          >
            <UIcon
              name="i-heroicons-cursor-arrow-rays"
              class="w-6 h-6 text-gray-600"
            />
          </div>
          <p class="text-gray-400 text-sm font-medium">No buttons yet</p>
          <p class="text-xs text-gray-600 mt-1">
            Click "Add Button" to create the first verify button
          </p>
        </div>

        <!-- Button list -->
        <div v-else class="space-y-3">
          <div
            v-for="(btn, index) in settings.buttons"
            :key="btn.id"
            class="rounded-lg bg-white/[0.03] border border-white/5 p-4 space-y-3"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-gray-400"
                >Button {{ index + 1 }}</span
              >
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                icon="i-heroicons-trash"
                @click="removeButton(index)"
              />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Label -->
              <UFormField label="Label">
                <UInput
                  v-model="btn.label"
                  placeholder="e.g. Verify to Enter"
                  size="sm"
                  icon="i-heroicons-tag"
                />
              </UFormField>

              <!-- Emoji -->
              <UFormField label="Emoji" hint="Optional">
                <UInput
                  v-model="btn.emoji"
                  placeholder="e.g. ✅ or leave blank"
                  size="sm"
                />
              </UFormField>

              <!-- Style -->
              <UFormField label="Button Color">
                <USelectMenu
                  v-model="btn.style"
                  :items="buttonStyleOptions"
                  value-key="value"
                  size="sm"
                />
              </UFormField>

              <!-- Role -->
              <UFormField label="Role to Grant">
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
                  v-model="btn.roleId"
                  :items="roleOptions"
                  value-key="value"
                  placeholder="Select role…"
                  searchable
                  size="sm"
                />
                <p v-else class="text-xs text-gray-600 italic py-1.5">
                  No roles available
                </p>
              </UFormField>
            </div>

            <!-- Preview pill -->
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-gray-600 uppercase tracking-wider"
                >Preview</span
              >
              <button
                :class="[
                  'px-3 py-1 rounded text-xs font-medium pointer-events-none select-none',
                  previewClass(btn.style),
                ]"
              >
                <span v-if="btn.emoji" class="mr-1">{{ btn.emoji }}</span>
                {{ btn.label || "Button" }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Deploy info card -->
    <div
      class="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-5"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none"
      />
      <div class="relative space-y-3">
        <div class="flex items-center gap-2 mb-1">
          <div
            class="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
          >
            <UIcon name="i-heroicons-rocket-launch" class="text-amber-400" />
          </div>
          <h3 class="font-semibold text-white">Deploy to Discord</h3>
        </div>
        <p class="text-xs text-gray-400">
          After saving your settings, run the following command in your Discord
          server to post the panel:
        </p>
        <div
          class="flex items-center gap-3 p-3 rounded-lg bg-black/30 border border-white/5 font-mono"
        >
          <UIcon
            name="i-heroicons-command-line"
            class="text-gray-500 shrink-0"
          />
          <code class="text-green-400 text-sm select-all"
            >/verification deploy #channel</code
          >
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-document-duplicate"
            class="ml-auto"
            @click="copyCommand('/verification deploy #channel')"
          >
            Copy
          </UButton>
        </div>
        <p class="text-[11px] text-gray-600">
          Re-running deploy will update the existing panel message in-place. If
          the message was deleted, a new one is posted automatically.
        </p>
      </div>
    </div>

    <!-- Save -->
    <div class="flex justify-end gap-3">
      <UButton
        color="primary"
        size="lg"
        icon="i-heroicons-check"
        :loading="saving"
        @click="save"
        class="min-w-[200px]"
      >
        Save Settings
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";

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

// ── Types ─────────────────────────────────────────────────────────────

interface VerificationButton {
  id: string;
  label: string;
  emoji: string;
  style: "Primary" | "Secondary" | "Success" | "Danger";
  roleId: string;
}

interface VerificationSettingsForm {
  embed: {
    title: string;
    description: string;
    color: string;
  };
  buttons: VerificationButton[];
}

// ── State ─────────────────────────────────────────────────────────────

const settings = reactive<VerificationSettingsForm>({
  embed: { title: "", description: "", color: "#5865F2" },
  buttons: [],
});

// ── Constants ─────────────────────────────────────────────────────────

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
  return map[style] ?? "bg-[#5865F2] text-white";
}

function addButton() {
  settings.buttons.push({
    id: uid(),
    label: "Verify to Enter",
    emoji: "✅",
    style: "Success",
    roleId: "",
  });
}

function removeButton(index: number) {
  settings.buttons.splice(index, 1);
}

function copyCommand(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.add({ title: "Copied!", color: "success" });
  });
}

// ── Save ──────────────────────────────────────────────────────────────

const save = async () => {
  saving.value = true;
  await saveModuleSettings("verification", {
    embed: {
      title: settings.embed.title || undefined,
      description: settings.embed.description || undefined,
      color: settings.embed.color || undefined,
    },
    buttons: settings.buttons.map((b) => ({
      id: b.id,
      label: b.label,
      emoji: b.emoji || undefined,
      style: b.style,
      roleId: b.roleId,
    })),
  });
  saving.value = false;
};

// ── Init ─────────────────────────────────────────────────────────────

onMounted(async () => {
  const saved = getModuleConfig("verification");
  if (saved) {
    if (saved.embed) {
      settings.embed.title = saved.embed.title ?? "";
      settings.embed.description = saved.embed.description ?? "";
      settings.embed.color = saved.embed.color ?? "#5865F2";
    }
    if (Array.isArray(saved.buttons)) {
      settings.buttons = saved.buttons.map((b: any) => ({
        id: b.id ?? uid(),
        label: b.label ?? "Verify to Enter",
        emoji: b.emoji ?? "",
        style: b.style ?? "Success",
        roleId: b.roleId ?? "",
      }));
    }
  }
  await loadRoles();
});
</script>
