<template>
  <div class="p-8 space-y-8">
    <!-- Header -->
    <div class="flex items-start gap-4">
      <div
        class="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 flex-shrink-0 mt-0.5"
      >
        <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-violet-400" />
      </div>
      <div>
        <h1 class="text-2xl font-black text-white tracking-tight gradient-text">
          Global AI Settings
        </h1>
        <p class="text-gray-400 text-sm mt-1">
          Default provider, key &amp; token limits used by all Premium guilds
          that haven't configured their own key. Falls back to
          <code class="text-xs bg-gray-800 px-1 rounded">.env</code> if not set
          here.
        </p>
      </div>
    </div>

    <!-- Settings card -->
    <div class="glass-card rounded-2xl border border-white/8 overflow-hidden">
      <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <UFormField label="Default Provider">
          <USelectMenu
            v-model="globalAI.aiProvider"
            :items="aiProviderOptions"
            value-key="value"
            placeholder="Select provider..."
            :search-input="false"
          />
        </UFormField>

        <UFormField label="API Key">
          <UInput
            v-model="globalAI.aiApiKey"
            type="password"
            :placeholder="
              hasStoredApiKey
                ? 'Key is set — leave blank to keep it'
                : 'sk-... or your provider key'
            "
            icon="i-heroicons-lock-closed"
            autocomplete="off"
          />
          <p class="text-xs mt-1" :class="hasStoredApiKey ? 'text-emerald-400' : 'text-amber-400'">
            {{
              hasStoredApiKey
                ? "✅ A key is currently on file. It's never shown here — leave this blank to keep it."
                : "⚠️ No key on file. The shared/Premium AI path won't work until one is set."
            }}
          </p>
        </UFormField>

        <UFormField label="Default Model">
          <div class="flex gap-2">
            <USelectMenu
              v-model="globalAI.aiModel"
              :items="globalAIModels"
              :loading="globalAIModelsLoading"
              :disabled="globalAIModelsLoading"
              :search-input="{ placeholder: 'Search models...' }"
              placeholder="Select or type a model..."
              class="flex-1"
            />
            <UButton
              icon="i-heroicons-arrow-path"
              variant="ghost"
              :loading="globalAIModelsLoading"
              :disabled="!globalAI.aiApiKey && !hasStoredApiKey"
              title="Fetch available models"
              @click="fetchGlobalAIModels"
            />
          </div>
          <p v-if="globalAIModelsWarning" class="text-xs text-amber-400 mt-1">
            {{ globalAIModelsWarning }}
          </p>
        </UFormField>

        <UFormField label="Base URL (Ollama / LM Studio only)">
          <UInput
            v-model="globalAI.aiBaseUrl"
            placeholder="http://localhost:11434/v1 (optional)"
            icon="i-heroicons-globe-alt"
          />
        </UFormField>

        <UFormField
          label="Max Response Tokens"
          hint="Raise this if the AI's replies get cut off mid-sentence."
        >
          <UInput
            v-model.number="globalAI.maxOutputTokens"
            type="number"
            min="1"
            placeholder="512"
          />
        </UFormField>

        <UFormField
          label="Max Input Tokens"
          hint="Caps how much of a user's message is sent to the model."
        >
          <UInput
            v-model.number="globalAI.maxInputTokens"
            type="number"
            min="1"
            placeholder="500"
          />
        </UFormField>

        <UFormField
          label="Per-User Cooldown (seconds)"
          hint="Rate limit applied per user on the shared key."
        >
          <UInput
            v-model.number="globalAI.rateLimitSeconds"
            type="number"
            min="1"
            placeholder="60"
          />
        </UFormField>
      </div>

      <div class="px-6 pt-0 pb-4 -mt-1">
        <p class="text-xs text-gray-500">
          <UIcon
            name="i-heroicons-information-circle"
            class="inline w-3.5 h-3.5 mb-0.5"
          />
          These three limits apply to every guild on the shared/Premium key —
          individual guilds can't override them from their own dashboard.
        </p>
      </div>

      <div
        class="px-6 pb-4 pt-0 flex flex-wrap items-center gap-3 border-t border-white/5 -mt-1 pt-4"
      >
        <span class="text-xs text-gray-500">Get an API key:</span>
        <a
          v-for="link in aiProviderLinks"
          :key="link.name"
          :href="link.url"
          target="_blank"
          class="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
          >{{ link.name }}</a
        >
      </div>

      <div
        class="px-6 py-4 border-t border-white/5 flex items-center justify-between"
      >
        <p class="text-xs text-gray-500">
          <UIcon
            name="i-heroicons-information-circle"
            class="inline w-3.5 h-3.5 mb-0.5"
          />
          Stored server-side — never exposed to guild admins.
        </p>
        <UButton
          icon="i-heroicons-check"
          :loading="savingGlobalAI"
          @click="requestSave"
        >
          Save Settings
        </UButton>
      </div>
    </div>

    <!-- Save confirmation -->
    <UModal v-model:open="confirmOpen" title="Save Global AI Settings?">
      <template #body>
        <div class="space-y-4 p-1">
          <p class="text-sm text-gray-400">
            {{
              providerChanged
                ? "You're changing the default provider. A reason is required."
                : "A reason is optional for this change."
            }}
          </p>
          <UFormField
            label="Reason"
            :required="providerChanged"
            :hint="providerChanged ? undefined : 'Optional'"
          >
            <UTextarea
              v-model="reason"
              placeholder="Why is this changing?"
              class="w-full"
              :rows="3"
            />
          </UFormField>
        </div>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="confirmOpen = false">Cancel</UButton>
          <UButton
            :loading="savingGlobalAI"
            :disabled="providerChanged && !reason.trim()"
            @click="saveGlobalAI"
          >
            Save
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";

const toast = useToast();

const globalAI = ref({
  aiProvider: "Groq",
  aiApiKey: "",
  aiModel: "llama-3.3-70b-versatile",
  aiBaseUrl: "",
  maxOutputTokens: 512,
  maxInputTokens: 500,
  rateLimitSeconds: 60,
});
const savedProvider = ref(globalAI.value.aiProvider);
const hasStoredApiKey = ref(false);
const savingGlobalAI = ref(false);
const confirmOpen = ref(false);
const reason = ref("");
const providerChanged = computed(
  () => globalAI.value.aiProvider !== savedProvider.value,
);
const globalAIModels = ref<string[]>([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
]);
const globalAIModelsLoading = ref(false);
const globalAIModelsWarning = ref("");

const aiProviderOptions = [
  { label: "Groq (Free · Recommended)", value: "Groq" },
  { label: "OpenAI", value: "OpenAI" },
  { label: "Google Gemini", value: "Google Gemini" },
  { label: "Anthropic Claude", value: "Anthropic Claude" },
  {
    label: "OpenAI Compatible (Ollama, LM Studio…)",
    value: "OpenAI Compatible",
  },
];

const aiProviderLinks = [
  { name: "Groq", url: "https://console.groq.com" },
  { name: "OpenAI", url: "https://platform.openai.com/api-keys" },
  { name: "Google Gemini", url: "https://aistudio.google.com/apikey" },
  { name: "Anthropic", url: "https://console.anthropic.com" },
];

const fetchGlobalAIModels = async () => {
  // A typed key always wins; otherwise fall back to the one already on file
  // (the field is left blank after load/save, so we never re-send it as text).
  const useStored = !globalAI.value.aiApiKey && hasStoredApiKey.value;
  if (!globalAI.value.aiApiKey && !useStored) return;

  globalAIModelsLoading.value = true;
  globalAIModelsWarning.value = "";
  try {
    const res = await $fetch<{ models: string[]; warning?: string }>(
      "/api/ai/models",
      {
        method: "POST",
        body: {
          provider: globalAI.value.aiProvider,
          ...(useStored
            ? { useStored: true }
            : { apiKey: globalAI.value.aiApiKey }),
          baseUrl: globalAI.value.aiBaseUrl || undefined,
        },
      },
    );
    globalAIModels.value = res.models;
    if (res.warning) globalAIModelsWarning.value = res.warning;
  } catch {
    globalAIModelsWarning.value =
      "Could not fetch models — check your API key.";
  } finally {
    globalAIModelsLoading.value = false;
  }
};

const loadGlobalAI = async () => {
  try {
    const saved = await $fetch<Record<string, any>>("/api/global-config/ai");
    if (saved && Object.keys(saved).length > 0) {
      const { hasApiKey, ...rest } = saved;
      globalAI.value = { ...globalAI.value, ...rest, aiApiKey: "" };
      hasStoredApiKey.value = Boolean(hasApiKey);
      savedProvider.value = globalAI.value.aiProvider;
      if (hasStoredApiKey.value) fetchGlobalAIModels();
    }
  } catch (error) {
    console.error("Error loading global AI config:", error);
  }
};

const requestSave = () => {
  reason.value = "";
  confirmOpen.value = true;
};

const saveGlobalAI = async () => {
  if (providerChanged.value && !reason.value.trim()) return;

  savingGlobalAI.value = true;
  try {
    await $fetch("/api/global-config/ai", {
      method: "PUT",
      body: { ...globalAI.value, reason: reason.value.trim() || undefined },
    });
    if (globalAI.value.aiApiKey) hasStoredApiKey.value = true;
    globalAI.value.aiApiKey = "";
    savedProvider.value = globalAI.value.aiProvider;
    confirmOpen.value = false;
    toast.add({
      title: "Saved",
      description: "Global AI settings updated.",
      color: "success",
    });
  } catch (error) {
    console.error("Error saving global AI config:", error);
    toast.add({
      title: "Error",
      description: "Failed to save global AI settings.",
      color: "error",
    });
  } finally {
    savingGlobalAI.value = false;
  }
};

// Auto-fetch models when provider or key changes
watch(
  [() => globalAI.value.aiProvider, () => globalAI.value.aiApiKey],
  ([_provider, key]) => {
    if (key && key.length > 10) fetchGlobalAIModels();
  },
);
watch(
  () => globalAI.value.aiProvider,
  () => fetchGlobalAIModels(),
);

onMounted(() => loadGlobalAI());
</script>

<style scoped>
.gradient-text {
  background: linear-gradient(to bottom right, #ffffff 30%, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
