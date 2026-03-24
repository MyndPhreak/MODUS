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
          Default provider &amp; key used by all Premium guilds that haven't
          configured their own. Falls back to
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
            placeholder="sk-... or your provider key"
            icon="i-heroicons-lock-closed"
            autocomplete="off"
          />
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
              :disabled="!globalAI.aiApiKey"
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
          Stored in Appwrite — never exposed to guild admins.
        </p>
        <UButton
          icon="i-heroicons-check"
          :loading="savingGlobalAI"
          @click="saveGlobalAI"
        >
          Save Settings
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { Query } from "appwrite";

const { databases } = useAppwrite();
const toast = useToast();

const globalAI = ref({
  aiProvider: "Groq",
  aiApiKey: "",
  aiModel: "llama-3.3-70b-versatile",
  aiBaseUrl: "",
});
const savingGlobalAI = ref(false);
const globalAIModels = ref<string[]>([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
]);
const globalAIModelsLoading = ref(false);
const globalAIModelsWarning = ref("");

const databaseId = "discord_bot";

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
  globalAIModelsLoading.value = true;
  globalAIModelsWarning.value = "";
  try {
    const res = await $fetch<{ models: string[]; warning?: string }>(
      "/api/ai/models",
      {
        method: "POST",
        body: {
          provider: globalAI.value.aiProvider,
          apiKey: globalAI.value.aiApiKey || "__validate_only__",
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
    const response = await databases.listDocuments(
      databaseId,
      "guild_configs",
      [
        Query.equal("guildId", "__global__"),
        Query.equal("moduleName", "ai"),
        Query.limit(1),
      ],
    );
    if (response.total > 0 && response.documents[0]!.settings) {
      const saved = JSON.parse(response.documents[0]!.settings);
      globalAI.value = { ...globalAI.value, ...saved };
      if (globalAI.value.aiApiKey) await fetchGlobalAIModels();
    }
  } catch (error) {
    console.error("Error loading global AI config:", error);
  }
};

const saveGlobalAI = async () => {
  savingGlobalAI.value = true;
  try {
    const response = await databases.listDocuments(
      databaseId,
      "guild_configs",
      [
        Query.equal("guildId", "__global__"),
        Query.equal("moduleName", "ai"),
        Query.limit(1),
      ],
    );
    if (response.total > 0) {
      await databases.updateDocument(
        databaseId,
        "guild_configs",
        response.documents[0]!.$id,
        { settings: JSON.stringify(globalAI.value) },
      );
    } else {
      await databases.createDocument(databaseId, "guild_configs", "unique()", {
        guildId: "__global__",
        moduleName: "ai",
        enabled: true,
        settings: JSON.stringify(globalAI.value),
      });
    }
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
