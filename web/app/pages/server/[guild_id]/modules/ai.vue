<template>
  <div class="space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <NuxtLink
          :to="`/server/${guildId}/modules`"
          class="p-2 rounded-lg hover:bg-white/5 transition-colors"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-5 h-5" />
        </NuxtLink>
        <div>
          <div class="flex items-center gap-3">
            <div
              class="p-2 rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20"
            >
              <UIcon
                name="i-heroicons-cpu-chip"
                class="w-6 h-6 text-violet-400"
              />
            </div>
            <h1 class="text-2xl font-bold">AI Assistant</h1>
            <UBadge
              v-if="isPremium"
              color="warning"
              variant="soft"
              size="sm"
              class="gap-1"
            >
              <UIcon name="i-heroicons-star-solid" class="w-3 h-3" />
              Premium
            </UBadge>
          </div>
          <p class="text-sm text-gray-500 mt-0.5 ml-[52px]">
            @mention the bot to chat. Powered by your choice of LLM provider.
          </p>
        </div>
      </div>

      <!-- Module enable toggle -->
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-gray-400">Module Active</span>
        <USwitch
          v-model="moduleEnabled"
          @update:model-value="toggleModule"
          :loading="savingEnabled"
          color="primary"
        />
      </div>
    </div>

    <!-- Premium notice banner (when using shared key) -->
    <UAlert
      v-if="!settings.aiApiKey && !isPremium"
      color="warning"
      variant="soft"
      icon="i-heroicons-star"
      title="Hosted AI requires Premium"
      description="This server doesn't have a premium subscription and no guild API key is configured. Add your own API key below to use the AI module, or contact the bot owner to enable Premium for this server."
    />

    <UAlert
      v-else-if="!settings.aiApiKey && isPremium"
      color="success"
      variant="soft"
      icon="i-heroicons-check-circle"
      title="Using Modus Hosted AI"
      description="This server is premium — it's using the bot's shared API key. Configure your own key below to use a different provider or lift rate limits."
    />

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <!-- ── Card 1: Provider Configuration ───────────────────────── -->
      <UCard class="xl:col-span-2">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-key" class="w-5 h-5 text-violet-400" />
            <h2 class="font-semibold text-base">Provider Configuration</h2>
          </div>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Provider Selector -->
          <UFormField label="AI Provider" required>
            <USelectMenu
              v-model="settings.aiProvider"
              :items="providerOptions"
              value-key="value"
              :search-input="false"
              placeholder="Select provider..."
              @update:model-value="(v) => onProviderChange(String(v ?? ''))"
            />
          </UFormField>

          <!-- API Key -->
          <UFormField
            label="API Key"
            hint="Leave empty to use Modus hosted key (Premium only)"
          >
            <UInput
              v-model="settings.aiApiKey"
              type="password"
              placeholder="sk-... or your provider key"
              icon="i-heroicons-lock-closed"
              autocomplete="off"
            />
          </UFormField>

          <!-- Model Selector -->
          <UFormField label="Model" required>
            <div class="flex gap-2">
              <USelectMenu
                v-model="settings.aiModel"
                :items="availableModels"
                :loading="modelsLoading"
                :disabled="modelsLoading"
                :search-input="{ placeholder: 'Search models...' }"
                placeholder="Select a model..."
                class="flex-1"
              />
              <UButton
                icon="i-heroicons-arrow-path"
                variant="ghost"
                :loading="modelsLoading"
                title="Fetch available models"
                @click="fetchModels"
              />
            </div>
            <p v-if="modelsWarning" class="text-xs text-amber-400 mt-1">
              {{ modelsWarning }}
            </p>
          </UFormField>

          <!-- Custom Base URL (OpenAI Compatible only) -->
          <UFormField
            v-if="settings.aiProvider === 'OpenAI Compatible'"
            label="Base URL"
            required
            hint="Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1"
          >
            <UInput
              v-model="settings.aiBaseUrl"
              placeholder="http://localhost:11434/v1"
              icon="i-heroicons-globe-alt"
            />
          </UFormField>
        </div>

        <!-- Provider quick-links -->
        <div class="mt-4 pt-4 border-t border-gray-800 flex flex-wrap gap-2">
          <span class="text-xs text-gray-500 self-center">Get an API key:</span>
          <a
            v-for="link in providerLinks"
            :key="link.name"
            :href="link.url"
            target="_blank"
            class="text-xs text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2"
          >
            {{ link.name }}
          </a>
        </div>
      </UCard>

      <!-- ── Card 2: System Prompt ─────────────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-chat-bubble-left-ellipsis"
                class="w-5 h-5 text-blue-400"
              />
              <h2 class="font-semibold text-base">
                Personality & System Prompt
              </h2>
            </div>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              @click="resetSystemPrompt"
            >
              Reset to default
            </UButton>
          </div>
        </template>

        <UFormField label="System Prompt">
          <UTextarea
            v-model="settings.systemPrompt"
            :rows="8"
            placeholder="You are Modus, a helpful Discord bot assistant..."
            class="font-mono text-sm w-full"
            resize
          />
        </UFormField>

        <div class="mt-2 flex justify-between items-center">
          <span class="text-xs text-gray-500">
            {{ settings.systemPrompt?.length ?? 0 }} characters
          </span>
          <span class="text-xs text-gray-500">
            This prompt sets the bot's personality and behavior.
          </span>
        </div>
      </UCard>

      <!-- ── Card 3: Conversation Memory ──────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="w-5 h-5 text-cyan-400" />
            <h2 class="font-semibold text-base">Conversation Memory</h2>
          </div>
        </template>

        <div class="space-y-5">
          <UFormField
            label="Enable Context"
            hint="When enabled, the bot remembers recent messages in each channel for more natural follow-up conversations."
          >
            <USwitch
              v-model="settings.contextEnabled"
              label="Remember conversation context"
            />
          </UFormField>

          <UFormField
            v-if="settings.contextEnabled"
            label="Messages to Remember"
            hint="How many recent messages to include as context per channel. More = better continuity but uses more tokens."
          >
            <div class="flex items-center gap-3">
              <USlider
                v-model="settings.contextMessageCount"
                :min="1"
                :max="20"
                :step="1"
                class="flex-1"
              />
              <span class="text-sm font-mono w-12 text-right">
                {{ settings.contextMessageCount }} msg
              </span>
            </div>
          </UFormField>

          <UFormField
            v-if="settings.contextEnabled"
            label="Memory Duration (minutes)"
            hint="Context messages older than this are forgotten. Keeps conversations fresh."
          >
            <div class="flex items-center gap-3">
              <USlider
                v-model="settings.contextTTLMinutes"
                :min="1"
                :max="60"
                :step="1"
                class="flex-1"
              />
              <span class="text-sm font-mono w-16 text-right">
                {{ settings.contextTTLMinutes }} min
              </span>
            </div>
          </UFormField>

          <UAlert
            v-if="settings.contextEnabled"
            color="info"
            variant="soft"
            icon="i-heroicons-information-circle"
            title="Token budget aware"
            description="Context messages are automatically trimmed to fit within your Max Input Tokens limit. The new message always gets priority."
          />
        </div>
      </UCard>

      <!-- ── Card 4: Rate Limiting & Limits ────────────────────────── -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-shield-check"
              class="w-5 h-5 text-emerald-400"
            />
            <h2 class="font-semibold text-base">Limits & Rate Limiting</h2>
          </div>
        </template>

        <div class="space-y-5">
          <UFormField
            label="User Cooldown (seconds)"
            :hint="
              !settings.aiApiKey ? 'Shared key: minimum 60s enforced.' : ''
            "
          >
            <div class="flex items-center gap-3">
              <USlider
                v-model="settings.rateLimitSeconds"
                :min="settings.aiApiKey ? 5 : 60"
                :max="300"
                :step="5"
                class="flex-1"
              />
              <span class="text-sm font-mono w-12 text-right">
                {{ settings.rateLimitSeconds }}s
              </span>
            </div>
          </UFormField>

          <UFormField
            label="Max Input Tokens"
            :hint="
              !settings.aiApiKey
                ? 'Shared key: max 500 enforced.'
                : 'Caps message length (~4 chars/token)'
            "
          >
            <div class="flex items-center gap-3">
              <USlider
                v-model="settings.maxInputTokens"
                :min="100"
                :max="settings.aiApiKey ? 4000 : 500"
                :step="50"
                class="flex-1"
              />
              <span class="text-sm font-mono w-16 text-right">
                {{ settings.maxInputTokens }} tok
              </span>
            </div>
          </UFormField>

          <UFormField
            label="Max Output Tokens"
            hint="Controls response length. Higher = more detailed but costs more."
          >
            <div class="flex items-center gap-3">
              <USlider
                v-model="settings.maxOutputTokens"
                :min="50"
                :max="settings.aiApiKey ? 4000 : 300"
                :step="50"
                class="flex-1"
              />
              <span class="text-sm font-mono w-16 text-right">
                {{ settings.maxOutputTokens }} tok
              </span>
            </div>
          </UFormField>

          <UFormField
            label="DM Responses"
            hint="Allow the bot to respond to @mentions in DMs."
          >
            <USwitch v-model="settings.respondToDMs" label="Respond in DMs" />
          </UFormField>

          <UFormField
            label="Tool Use — Music Control"
            hint="Allow the AI to play, skip, pause, and control music on @mention commands."
          >
            <USwitch
              v-model="settings.toolUseEnabled"
              label="Enable music tool use"
            />
          </UFormField>

          <!-- Low-capability model warning -->
          <UAlert
            v-if="settings.toolUseEnabled && toolUseWarning"
            color="warning"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            :title="toolUseWarning"
            description="Tool use works best with 70B+ models. Try llama-3.3-70b-versatile (Groq, free) or gpt-4o-mini (OpenAI) for reliable results."
          />
        </div>
      </UCard>
    </div>

    <!-- ── Card 4: Usage & Spending ──────────────────────────────────── -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-chart-bar"
              class="w-5 h-5 text-amber-400"
            />
            <h2 class="font-semibold text-base">Usage & Spending</h2>
          </div>
          <UButton
            size="xs"
            variant="ghost"
            icon="i-heroicons-arrow-path"
            :loading="usageLoading"
            @click="fetchUsage"
          />
        </div>
      </template>

      <div v-if="usageLoading" class="flex justify-center py-10">
        <UProgress />
      </div>

      <div
        v-else-if="usageLogs.length === 0"
        class="text-center py-10 text-gray-500"
      >
        <UIcon
          name="i-heroicons-chart-bar"
          class="w-10 h-10 mx-auto mb-3 opacity-20"
        />
        <p>No usage recorded yet. Start chatting with the bot!</p>
      </div>

      <div v-else class="space-y-6">
        <!-- Aggregate Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            v-for="stat in usageStats"
            :key="stat.label"
            class="bg-gray-900/50 rounded-xl p-4 ring-1 ring-gray-800"
          >
            <p class="text-xs text-gray-500 mb-1">{{ stat.label }}</p>
            <p class="text-2xl font-bold">{{ stat.value }}</p>
          </div>
        </div>

        <!-- Token ratio bar -->
        <div>
          <div class="flex justify-between text-xs text-gray-500 mb-1">
            <span>Input tokens</span>
            <span>Output tokens</span>
          </div>
          <div class="flex h-2 rounded-full overflow-hidden bg-gray-800">
            <div
              class="bg-blue-500 transition-all"
              :style="{ width: inputRatioPct + '%' }"
            />
            <div
              class="bg-violet-500 transition-all"
              :style="{ width: outputRatioPct + '%' }"
            />
          </div>
          <div class="flex justify-between text-xs text-gray-600 mt-1">
            <span>{{ totalInputTokens.toLocaleString() }}</span>
            <span>{{ totalOutputTokens.toLocaleString() }}</span>
          </div>
        </div>

        <!-- Provider/Model Breakdown -->
        <div>
          <h3 class="text-sm font-semibold text-gray-400 mb-3">By Model</h3>
          <div class="space-y-2">
            <div
              v-for="entry in modelBreakdown"
              :key="entry.model"
              class="flex items-center justify-between py-2 px-3 bg-gray-900/40 rounded-lg"
            >
              <div>
                <span class="text-sm font-medium">{{ entry.model }}</span>
                <span class="text-xs text-gray-500 ml-2">{{
                  entry.provider
                }}</span>
              </div>
              <div class="flex items-center gap-4 text-xs text-gray-400">
                <span>{{ entry.calls }} calls</span>
                <span>{{ entry.tokens.toLocaleString() }} tok</span>
                <span class="font-mono text-emerald-400"
                  >${{ entry.cost.toFixed(4) }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Activity -->
        <div>
          <h3 class="text-sm font-semibold text-gray-400 mb-3">
            Recent Activity
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-gray-500 border-b border-gray-800">
                  <th class="text-left pb-2">Time</th>
                  <th class="text-left pb-2">User</th>
                  <th class="text-left pb-2">Model</th>
                  <th class="text-right pb-2">Tokens</th>
                  <th class="text-right pb-2">Cost</th>
                  <th class="text-center pb-2">Action</th>
                  <th class="text-center pb-2">Key</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800/50">
                <tr
                  v-for="log in usageLogs.slice(0, 20)"
                  :key="log.$id"
                  class="hover:bg-white/2 transition-colors"
                >
                  <td class="py-2 text-gray-500 whitespace-nowrap">
                    {{ formatTime(log.timestamp) }}
                  </td>
                  <td class="py-2 font-mono text-gray-400">{{ log.userId }}</td>
                  <td class="py-2 text-gray-300">{{ log.model }}</td>
                  <td class="py-2 text-right text-gray-400">
                    {{ (log.total_tokens || 0).toLocaleString() }}
                  </td>
                  <td class="py-2 text-right text-emerald-400 font-mono">
                    ${{ (log.estimated_cost || 0).toFixed(4) }}
                  </td>
                  <td class="py-2 text-center">
                    <UBadge
                      :color="log.action === 'tool_use' ? 'success' : 'info'"
                      variant="soft"
                      size="xs"
                    >
                      {{ log.action === "tool_use" ? "🔧 Tool" : "💬 Chat" }}
                    </UBadge>
                  </td>
                  <td class="py-2 text-center">
                    <UBadge
                      :color="log.key_source === 'guild' ? 'info' : 'warning'"
                      variant="soft"
                      size="xs"
                    >
                      {{ log.key_source === "guild" ? "Guild" : "Shared" }}
                    </UBadge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Save Button -->
    <div class="flex justify-end">
      <UButton
        size="lg"
        icon="i-heroicons-check"
        :loading="saving"
        @click="saveSettings"
      >
        Save Settings
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Query } from "appwrite";

const route = useRoute();
const toast = useToast();
const { databases } = useAppwrite();

const guildId = computed(() => route.params.guild_id as string);

const DATABASE_ID = "discord_bot";
const GUILD_CONFIGS_COLLECTION = "guild_configs";
const SERVERS_COLLECTION = "servers";
const AI_USAGE_COLLECTION = "ai_usage_log";

// ── State ──────────────────────────────────────────────────────────

const moduleEnabled = ref(false);
const savingEnabled = ref(false);
const saving = ref(false);
const isPremium = ref(false);

const DEFAULT_SYSTEM_PROMPT = `You are Modus, a helpful and friendly AI assistant built into a Discord bot. 
You have a witty, upbeat personality. Keep responses concise (2-4 sentences max) and conversational. 
You can help with questions, have casual conversations, and assist server members. 
Do not pretend to have capabilities you don't have. Stay on topic and be helpful.`;

const settings = ref({
  aiProvider: "Groq" as string,
  aiApiKey: "",
  aiModel: "llama-3.3-70b-versatile",
  aiBaseUrl: "",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxInputTokens: 500,
  maxOutputTokens: 300,
  rateLimitSeconds: 60,
  respondToDMs: false,
  toolUseEnabled: false,
  contextEnabled: true,
  contextMessageCount: 5,
  contextTTLMinutes: 15,
});

const availableModels = ref<string[]>([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
]);
const modelsLoading = ref(false);
const modelsWarning = ref("");

const usageLogs = ref<any[]>([]);
const usageLoading = ref(false);

let guildConfigDocId: string | null = null;

// ── Consts ─────────────────────────────────────────────────────────

const providerOptions = [
  { label: "Groq (Free · Recommended)", value: "Groq" },
  { label: "OpenAI", value: "OpenAI" },
  { label: "Google Gemini", value: "Google Gemini" },
  { label: "Anthropic Claude", value: "Anthropic Claude" },
  {
    label: "OpenAI Compatible (Ollama, LM Studio…)",
    value: "OpenAI Compatible",
  },
];

const providerLinks = [
  { name: "Groq", url: "https://console.groq.com" },
  { name: "OpenAI", url: "https://platform.openai.com/api-keys" },
  { name: "Google Gemini", url: "https://aistudio.google.com/apikey" },
  { name: "Anthropic", url: "https://console.anthropic.com" },
];

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  Groq: "llama-3.3-70b-versatile",
  OpenAI: "gpt-4o-mini",
  "Google Gemini": "gemini-2.0-flash",
  "Anthropic Claude": "claude-haiku-3-5",
  "OpenAI Compatible": "",
};

// ── Usage Computed ─────────────────────────────────────────────────

const totalCalls = computed(() => usageLogs.value.length);
const totalInputTokens = computed(() =>
  usageLogs.value.reduce((s, l) => s + (l.input_tokens || 0), 0),
);
const totalOutputTokens = computed(() =>
  usageLogs.value.reduce((s, l) => s + (l.output_tokens || 0), 0),
);
const totalTokens = computed(
  () => totalInputTokens.value + totalOutputTokens.value,
);
const totalCost = computed(() =>
  usageLogs.value.reduce((s, l) => s + (l.estimated_cost || 0), 0),
);

const inputRatioPct = computed(() => {
  const total = totalTokens.value;
  return total === 0 ? 50 : (totalInputTokens.value / total) * 100;
});
const outputRatioPct = computed(() => 100 - inputRatioPct.value);

const usageStats = computed(() => [
  { label: "Total Calls", value: totalCalls.value.toLocaleString() },
  { label: "Total Tokens", value: totalTokens.value.toLocaleString() },
  { label: "Total Cost", value: `$${totalCost.value.toFixed(4)}` },
  {
    label: "Avg Cost / Call",
    value:
      totalCalls.value === 0
        ? "$0.0000"
        : `$${(totalCost.value / totalCalls.value).toFixed(4)}`,
  },
]);

// Warn if tool use is enabled with a small/low-capability model
const SMALL_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.2-1b",
  "llama-3.2-3b",
  "gemma-7b",
  "gemma2-9b",
  "mixtral-8x7b-32768", // older, less reliable for tool use
];
const toolUseWarning = computed(() => {
  if (!settings.value.toolUseEnabled) return "";
  const model = settings.value.aiModel?.toLowerCase() ?? "";
  const isSmall = SMALL_MODELS.some((m) => model.includes(m.toLowerCase()));
  if (isSmall) {
    return `"${settings.value.aiModel}" may produce unreliable tool calls.`;
  }
  return "";
});

const modelBreakdown = computed(() => {
  const map = new Map<
    string,
    { provider: string; calls: number; tokens: number; cost: number }
  >();
  for (const log of usageLogs.value) {
    const key = log.model;
    if (!map.has(key)) {
      map.set(key, { provider: log.provider, calls: 0, tokens: 0, cost: 0 });
    }
    const entry = map.get(key)!;
    entry.calls++;
    entry.tokens += log.total_tokens || 0;
    entry.cost += log.estimated_cost || 0;
  }
  return [...map.entries()]
    .map(([model, data]) => ({ model, ...data }))
    .sort((a, b) => b.calls - a.calls);
});

// ── Methods ────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    // Load module enabled state + settings
    const response = await databases.listDocuments(
      DATABASE_ID,
      GUILD_CONFIGS_COLLECTION,
      [
        Query.equal("guildId", guildId.value),
        Query.equal("moduleName", "ai"),
        Query.limit(1),
      ],
    );

    if (response.total > 0) {
      const doc = response.documents[0];
      guildConfigDocId = doc!.$id;
      moduleEnabled.value = doc!.enabled;
      if (doc!.settings) {
        const saved = JSON.parse(doc!.settings);
        settings.value = { ...settings.value, ...saved };
      }
    }

    // Check premium
    const serverRes = await databases.listDocuments(
      DATABASE_ID,
      SERVERS_COLLECTION,
      [Query.equal("guild_id", guildId.value), Query.limit(1)],
    );
    if (serverRes.total > 0) {
      isPremium.value = serverRes.documents[0]!.premium === true;
    }

    // Auto-fetch models for current provider
    await fetchModels();
    await fetchUsage();
  } catch (err) {
    console.error("[AI Dashboard] Error loading settings:", err);
  }
}

async function saveSettings() {
  saving.value = true;
  try {
    const settingsJson = JSON.stringify(settings.value);

    if (guildConfigDocId) {
      await databases.updateDocument(
        DATABASE_ID,
        GUILD_CONFIGS_COLLECTION,
        guildConfigDocId,
        {
          settings: settingsJson,
        },
      );
    } else {
      const doc = await databases.createDocument(
        DATABASE_ID,
        GUILD_CONFIGS_COLLECTION,
        "unique()",
        {
          guildId: guildId.value,
          moduleName: "ai",
          enabled: moduleEnabled.value,
          settings: settingsJson,
        },
      );
      guildConfigDocId = doc.$id;
    }

    toast.add({
      title: "Saved",
      description: "AI settings updated.",
      color: "success",
    });
  } catch (err) {
    console.error("[AI Dashboard] Save error:", err);
    toast.add({
      title: "Error",
      description: "Failed to save settings.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

async function toggleModule(enabled: boolean) {
  savingEnabled.value = true;
  try {
    if (guildConfigDocId) {
      await databases.updateDocument(
        DATABASE_ID,
        GUILD_CONFIGS_COLLECTION,
        guildConfigDocId,
        {
          enabled,
        },
      );
    } else {
      const doc = await databases.createDocument(
        DATABASE_ID,
        GUILD_CONFIGS_COLLECTION,
        "unique()",
        {
          guildId: guildId.value,
          moduleName: "ai",
          enabled,
          settings: JSON.stringify(settings.value),
        },
      );
      guildConfigDocId = doc.$id;
    }
    toast.add({
      title: enabled ? "Module Enabled" : "Module Disabled",
      color: enabled ? "success" : "neutral",
    });
  } catch (err) {
    moduleEnabled.value = !enabled;
    toast.add({
      title: "Error",
      description: "Failed to update module status.",
      color: "error",
    });
  } finally {
    savingEnabled.value = false;
  }
}

async function fetchModels() {
  modelsLoading.value = true;
  modelsWarning.value = "";

  // If using shared key fallback, use bot's provider; otherwise use configured one
  const provider = settings.value.aiProvider;
  const apiKey = settings.value.aiApiKey || "__validate_only__";

  try {
    const res = await $fetch<{ models: string[]; warning?: string }>(
      "/api/ai/models",
      {
        method: "POST",
        body: {
          provider,
          apiKey,
          baseUrl: settings.value.aiBaseUrl || undefined,
        },
      },
    );

    availableModels.value = res.models;
    if (res.warning) modelsWarning.value = res.warning;

    // If current model not in list, pick the first available
    if (
      availableModels.value.length > 0 &&
      !availableModels.value.includes(settings.value.aiModel)
    ) {
      settings.value.aiModel = availableModels.value[0] ?? "";
    }
  } catch (err) {
    console.error("[AI Dashboard] Failed to fetch models:", err);
    modelsWarning.value = "Could not fetch models. Check your API key.";
  } finally {
    modelsLoading.value = false;
  }
}

async function fetchUsage() {
  usageLoading.value = true;
  try {
    const response = await $fetch<{ documents: any[]; total: number }>(
      "/api/ai/usage",
      { query: { guild_id: guildId.value } },
    );
    usageLogs.value = response.documents;
  } catch (err) {
    console.error("[AI Dashboard] Error fetching usage:", err);
  } finally {
    usageLoading.value = false;
  }
}

function onProviderChange(provider: string) {
  // Set a sensible default model for the new provider
  settings.value.aiModel = PROVIDER_DEFAULT_MODELS[provider] || "";
  fetchModels();
}

// Auto-fetch models when a valid API key is entered
watch(
  [() => settings.value.aiProvider, () => settings.value.aiApiKey],
  ([_provider, key]) => {
    if (key && key.length > 10) fetchModels();
  },
);

// Re-fetch on provider change (returns fallback list even without a key)
watch(
  () => settings.value.aiProvider,
  () => fetchModels(),
);

function resetSystemPrompt() {
  settings.value.systemPrompt = DEFAULT_SYSTEM_PROMPT;
}

function formatTime(ts: string) {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

onMounted(loadSettings);
</script>
