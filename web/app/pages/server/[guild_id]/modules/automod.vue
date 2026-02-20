<template>
  <div class="p-6 lg:p-8 space-y-6">
    <!-- ── Header ── -->
    <div class="flex items-center gap-4">
      <NuxtLink
        :to="`/server/${guildId}/modules`"
        class="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
      >
        <UIcon name="i-heroicons-arrow-left" class="text-gray-400" />
      </NuxtLink>
      <div class="flex items-center gap-3">
        <div
          class="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20"
        >
          <UIcon name="i-heroicons-funnel" class="text-orange-400 text-lg" />
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">AutoMod Rules</h2>
          <p class="text-xs text-gray-500">
            Programmable IF/THEN rules to automate moderation
          </p>
        </div>
      </div>
      <UBadge
        :color="isModuleEnabled('automod') ? 'success' : 'neutral'"
        variant="soft"
        class="ml-auto"
      >
        {{ isModuleEnabled("automod") ? "Module Active" : "Module Disabled" }}
      </UBadge>
    </div>

    <!-- ── Rules List ── -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-white">
          Rules
          <span class="text-gray-500 font-normal text-base ml-1"
            >({{ rules.length }})</span
          >
        </h3>
        <UButton
          color="primary"
          icon="i-heroicons-plus"
          size="sm"
          @click="openCreateModal()"
        >
          New Rule
        </UButton>
      </div>

      <!-- Loading -->
      <div
        v-if="loading"
        class="flex items-center justify-center py-12 text-gray-400 gap-2"
      >
        <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
        Loading rules...
      </div>

      <!-- Empty State -->
      <div
        v-else-if="rules.length === 0"
        class="relative overflow-hidden rounded-xl border border-dashed border-white/10 bg-gradient-to-br from-gray-900/50 to-gray-950/50 p-12 text-center"
      >
        <div
          class="absolute inset-0 bg-gradient-to-br from-orange-500/3 to-transparent pointer-events-none"
        />
        <div class="relative space-y-3">
          <div
            class="inline-flex p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20"
          >
            <UIcon name="i-heroicons-funnel" class="text-orange-400 text-3xl" />
          </div>
          <h4 class="text-lg font-semibold text-white">No rules yet</h4>
          <p class="text-sm text-gray-500 max-w-md mx-auto">
            Create your first auto-moderation rule. For example: if a message
            contains profanity, delete it and warn the user.
          </p>
          <UButton
            color="primary"
            icon="i-heroicons-plus"
            @click="openCreateModal()"
            class="mt-2"
          >
            Create Your First Rule
          </UButton>
        </div>
      </div>

      <!-- ── Rule Cards ── -->
      <div v-else class="space-y-3">
        <div
          v-for="rule in rules"
          :key="rule.$id"
          class="relative overflow-hidden rounded-xl border bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl transition-all duration-200 hover:border-white/20"
          :class="
            rule.enabled
              ? 'border-white/12 hover:border-orange-500/30'
              : 'border-white/8 opacity-60 hover:opacity-80'
          "
        >
          <!-- Gradient glow -->
          <div
            class="absolute inset-0 bg-gradient-to-br pointer-events-none"
            :class="
              rule.enabled
                ? 'from-orange-500/5 to-transparent'
                : 'from-gray-500/3 to-transparent'
            "
          />

          <div class="relative p-5">
            <!-- Top row: name + controls -->
            <div class="flex items-start gap-3 mb-4">
              <div
                class="p-2 rounded-lg mt-0.5 flex-shrink-0"
                :class="
                  rule.enabled
                    ? 'bg-orange-500/10 border border-orange-500/20'
                    : 'bg-gray-500/10 border border-gray-500/20'
                "
              >
                <UIcon
                  :name="triggerIcon(rule.trigger)"
                  :class="rule.enabled ? 'text-orange-400' : 'text-gray-500'"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-semibold text-white">
                  {{ rule.name }}
                </h4>
                <p class="text-[11px] text-gray-500 mt-0.5">
                  {{ triggerLabel(rule.trigger) }}
                  <span v-if="rule.cooldown" class="ml-1"
                    >· {{ rule.cooldown }}s cooldown</span
                  >
                  <span v-if="rule.priority > 0" class="ml-1"
                    >· Priority {{ rule.priority }}</span
                  >
                </p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <USwitch
                  :model-value="rule.enabled"
                  @update:model-value="(val: boolean) => toggleRule(rule, val)"
                  size="sm"
                />
                <UButton
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  icon="i-heroicons-pencil-square"
                  @click="openEditModal(rule)"
                />
                <UButton
                  variant="ghost"
                  color="error"
                  size="xs"
                  icon="i-heroicons-trash"
                  @click="confirmDelete(rule)"
                />
              </div>
            </div>

            <!-- Rule Flow Preview: IF → THEN -->
            <div class="flex items-center gap-2 flex-wrap">
              <!-- IF block -->
              <div
                class="flex items-center gap-1.5 bg-blue-500/8 border border-blue-500/20 rounded-lg px-3 py-1.5"
              >
                <span
                  class="text-[10px] font-bold text-blue-400 uppercase tracking-wider"
                  >IF</span
                >
                <div class="w-px h-3 bg-blue-500/30" />
                <UIcon
                  name="i-heroicons-funnel"
                  class="text-blue-400/70 text-xs"
                />
                <span class="text-xs text-blue-300">
                  {{ countConditions(rule) }} condition{{
                    countConditions(rule) !== 1 ? "s" : ""
                  }}
                </span>
              </div>

              <!-- Arrow -->
              <div class="flex items-center gap-1 text-gray-600">
                <div class="w-4 h-px bg-gray-700" />
                <UIcon
                  name="i-heroicons-arrow-right"
                  class="text-gray-600 text-xs"
                />
              </div>

              <!-- THEN actions -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <span
                  class="text-[10px] font-bold text-orange-400 uppercase tracking-wider bg-orange-500/8 border border-orange-500/20 rounded-lg px-2 py-1.5"
                  >THEN</span
                >
                <template v-if="parseActions(rule).length > 0">
                  <div
                    v-for="action in parseActions(rule)"
                    :key="action.type"
                    class="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium"
                    :class="actionChipClass(action.type)"
                  >
                    <UIcon
                      :name="actionIcon(action.type)"
                      class="text-[11px]"
                    />
                    {{ actionLabel(action.type) }}
                  </div>
                </template>
                <span v-else class="text-xs text-gray-600 italic"
                  >No actions</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Create / Edit Modal ── -->
    <UModal v-model:open="showModal" :ui="{ content: 'sm:max-w-4xl' }">
      <template #content>
        <div class="flex flex-col max-h-[88vh]">
          <!-- Modal header -->
          <div
            class="flex items-center gap-3 px-6 py-4 border-b border-white/8 flex-shrink-0"
          >
            <div
              class="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20"
            >
              <UIcon name="i-heroicons-funnel" class="text-orange-400" />
            </div>
            <div>
              <h3 class="text-base font-bold text-white">
                {{ editingRule ? "Edit Rule" : "Create Rule" }}
              </h3>
              <p class="text-xs text-gray-500">
                Configure trigger, conditions, and actions
              </p>
            </div>
          </div>

          <!-- Modal body -->
          <div class="overflow-y-auto flex-1 p-6 space-y-5">
            <!-- ── Section: Basic Info ── -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Rule Name -->
              <div
                class="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3"
              >
                <div class="flex items-center gap-2 mb-1">
                  <div class="p-1 rounded-md bg-white/5 border border-white/10">
                    <UIcon
                      name="i-heroicons-tag"
                      class="text-gray-400 text-sm"
                    />
                  </div>
                  <span
                    class="text-xs font-semibold text-gray-300 uppercase tracking-wider"
                    >Rule Name</span
                  >
                </div>
                <UInput
                  v-model="form.name"
                  placeholder="e.g. Profanity Filter, Anti-Spam"
                  size="md"
                />
              </div>

              <!-- Trigger -->
              <div
                class="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3"
              >
                <div class="flex items-center gap-2 mb-1">
                  <div
                    class="p-1 rounded-md bg-orange-500/10 border border-orange-500/20"
                  >
                    <UIcon
                      name="i-heroicons-bolt"
                      class="text-orange-400 text-sm"
                    />
                  </div>
                  <span
                    class="text-xs font-semibold text-orange-300 uppercase tracking-wider"
                    >Trigger Event</span
                  >
                </div>
                <USelectMenu
                  v-model="form.trigger"
                  :items="triggerOptions"
                  value-key="value"
                  size="md"
                />
                <p class="text-[11px] text-gray-500">
                  When should this rule be evaluated?
                </p>
              </div>
            </div>

            <!-- ── Section: Conditions (IF) ── -->
            <div
              class="relative overflow-hidden rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-4 space-y-3"
            >
              <div class="flex items-center gap-2 mb-1">
                <div
                  class="p-1 rounded-md bg-blue-500/10 border border-blue-500/20"
                >
                  <UIcon
                    name="i-heroicons-funnel"
                    class="text-blue-400 text-sm"
                  />
                </div>
                <span
                  class="text-xs font-semibold text-blue-300 uppercase tracking-wider"
                  >Conditions</span
                >
                <span class="text-xs text-gray-600 ml-1"
                  >— IF these are true…</span
                >
              </div>
              <ConditionGroupEditor v-model="form.conditions" :depth="0" />
            </div>

            <!-- ── Section: Actions (THEN) ── -->
            <div
              class="relative overflow-hidden rounded-xl border border-orange-500/20 bg-orange-500/[0.03] p-4 space-y-3"
            >
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <div
                    class="p-1 rounded-md bg-orange-500/10 border border-orange-500/20"
                  >
                    <UIcon
                      name="i-heroicons-play"
                      class="text-orange-400 text-sm"
                    />
                  </div>
                  <span
                    class="text-xs font-semibold text-orange-300 uppercase tracking-wider"
                    >Actions</span
                  >
                  <span class="text-xs text-gray-600 ml-1"
                    >— …THEN do this</span
                  >
                </div>
                <UButton
                  variant="soft"
                  color="primary"
                  size="xs"
                  icon="i-heroicons-plus"
                  @click="addAction()"
                >
                  Add Action
                </UButton>
              </div>

              <div class="space-y-2">
                <div
                  v-for="(action, idx) in form.actions"
                  :key="idx"
                  class="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-3"
                >
                  <!-- Action type row -->
                  <div class="flex items-center gap-2">
                    <div
                      class="w-1 self-stretch rounded-full flex-shrink-0"
                      :class="actionAccentBar(action.type)"
                    />
                    <div class="flex-1">
                      <USelectMenu
                        v-model="action.type"
                        :items="actionOptions"
                        value-key="value"
                        size="md"
                      />
                    </div>
                    <UButton
                      variant="ghost"
                      color="error"
                      size="sm"
                      icon="i-heroicons-x-mark"
                      @click="form.actions.splice(idx, 1)"
                    />
                  </div>
                  <!-- Action params -->
                  <div class="pl-3 space-y-3">
                    <!-- ── DM User: multiline message ── -->
                    <template v-if="action.type === 'dm_user'">
                      <div class="space-y-1">
                        <label class="text-[11px] font-medium text-gray-400"
                          >Message to send the user</label
                        >
                        <UTextarea
                          v-model="action.params.message"
                          placeholder="You have been warned for violating server rules..."
                          :rows="3"
                          autoresize
                          size="md"
                        />
                      </div>
                    </template>

                    <!-- ── Timeout User: number + unit picker ── -->
                    <template v-if="action.type === 'timeout_user'">
                      <div class="space-y-1">
                        <label class="text-[11px] font-medium text-gray-400">
                          Timeout duration
                          <span
                            v-if="
                              action.params._durationAmt &&
                              action.params._durationUnit
                            "
                            class="text-orange-300 ml-1"
                          >
                            → {{ action.params._durationAmt
                            }}{{ action.params._durationUnit }}
                          </span>
                        </label>
                        <div class="flex gap-2">
                          <UInput
                            v-model.number="action.params._durationAmt"
                            type="number"
                            :min="1"
                            :max="
                              action.params._durationUnit === 'm'
                                ? 40320
                                : action.params._durationUnit === 'h'
                                  ? 672
                                  : 28
                            "
                            placeholder="Amount"
                            size="md"
                            class="flex-1"
                            @update:model-value="syncDuration(action)"
                          />
                          <USelectMenu
                            v-model="action.params._durationUnit"
                            :items="durationUnitOptions"
                            value-key="value"
                            size="md"
                            class="w-36"
                            @update:model-value="syncDuration(action)"
                          />
                        </div>
                        <p class="text-[10px] text-gray-600">
                          Max: 28 days. Discord enforces a 28-day ceiling on
                          timeouts.
                        </p>
                      </div>
                    </template>

                    <!-- ── Kick User: optional reason ── -->
                    <template v-if="action.type === 'kick_user'">
                      <div class="space-y-1">
                        <label class="text-[11px] font-medium text-gray-400"
                          >Reason
                          <span class="text-gray-600"
                            >(optional, shown in audit log)</span
                          ></label
                        >
                        <UTextarea
                          v-model="action.params.reason"
                          placeholder="Violated server automod rule..."
                          :rows="2"
                          autoresize
                          size="md"
                        />
                      </div>
                    </template>

                    <!-- ── Ban User: optional reason + delete days ── -->
                    <template v-if="action.type === 'ban_user'">
                      <div class="space-y-1">
                        <label class="text-[11px] font-medium text-gray-400"
                          >Reason
                          <span class="text-gray-600"
                            >(optional, shown in audit log)</span
                          ></label
                        >
                        <UTextarea
                          v-model="action.params.reason"
                          placeholder="Violated server automod rule..."
                          :rows="2"
                          autoresize
                          size="md"
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-[11px] font-medium text-gray-400">
                          Delete message history
                          <span class="text-orange-300 ml-1"
                            >{{ action.params.delete_days ?? 0 }} day{{
                              (action.params.delete_days ?? 0) !== 1 ? "s" : ""
                            }}</span
                          >
                        </label>
                        <USlider
                          v-model="action.params.delete_days"
                          :min="0"
                          :max="7"
                          :step="1"
                        />
                        <p class="text-[10px] text-gray-600">
                          How many days of their message history to erase on ban
                          (0–7).
                        </p>
                      </div>
                    </template>

                    <!-- ── Send Channel Message: channel selector + big textarea ── -->
                    <template v-if="action.type === 'send_channel_message'">
                      <div v-if="channelOptions.length > 0" class="space-y-1">
                        <label class="text-[11px] font-medium text-gray-400"
                          >Post to channel</label
                        >
                        <USelectMenu
                          v-model="action.params.channel_id"
                          :items="channelOptions"
                          value-key="value"
                          placeholder="Select a channel..."
                          searchable
                          icon="i-heroicons-hashtag"
                          size="md"
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-[11px] font-medium text-gray-400"
                          >Message to post</label
                        >
                        <UTextarea
                          v-model="action.params.message"
                          placeholder="⚠️ A message was flagged by AutoMod in this channel..."
                          :rows="4"
                          autoresize
                          size="md"
                        />
                        <p class="text-[10px] text-gray-600">
                          Supports basic Discord markdown. Use
                          <code class="bg-white/5 px-1 rounded">{user}</code>
                          and
                          <code class="bg-white/5 px-1 rounded">{channel}</code>
                          as placeholders.
                        </p>
                      </div>
                    </template>

                    <!-- ── Add / Remove Role: searchable full-width selector ── -->
                    <template
                      v-if="
                        action.type === 'add_role' ||
                        action.type === 'remove_role'
                      "
                    >
                      <div class="space-y-1">
                        <label class="text-[11px] font-medium text-gray-400">
                          {{
                            action.type === "add_role"
                              ? "Role to assign"
                              : "Role to remove"
                          }}
                        </label>
                        <USelectMenu
                          v-model="action.params.role_id"
                          :items="roleOptions"
                          value-key="value"
                          :placeholder="
                            action.type === 'add_role'
                              ? 'Search and select a role...'
                              : 'Search and select a role to remove...'
                          "
                          searchable
                          size="md"
                        />
                        <p class="text-[10px] text-gray-600">
                          Bot role must be <em>above</em> the target role in the
                          server's role hierarchy.
                        </p>
                      </div>
                    </template>
                  </div>
                </div>

                <div
                  v-if="form.actions.length === 0"
                  class="flex items-center justify-center gap-2 py-6 text-gray-600 border border-dashed border-white/8 rounded-lg"
                >
                  <UIcon name="i-heroicons-play-circle" class="text-lg" />
                  <span class="text-xs"
                    >No actions yet — click
                    <strong>+ Add Action</strong> above</span
                  >
                </div>
              </div>
            </div>

            <!-- ── Section: Advanced (collapsible) ── -->
            <UAccordion :items="advancedItems">
              <template #body>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 pb-2">
                  <!-- Cooldown -->
                  <div class="space-y-2">
                    <label class="block text-sm font-medium">
                      Cooldown:
                      <span class="text-orange-300 ml-1">{{
                        form.cooldown === 0 ? "None" : `${form.cooldown}s`
                      }}</span>
                    </label>
                    <USlider
                      v-model="form.cooldown"
                      :min="0"
                      :max="300"
                      :step="5"
                    />
                    <p class="text-[11px] text-gray-500">
                      Seconds between re-triggers per user. Prevents rule spam.
                    </p>
                  </div>

                  <!-- Priority -->
                  <div class="space-y-2">
                    <label class="block text-sm font-medium">
                      Priority:
                      <span class="text-orange-300 ml-1">{{
                        form.priority
                      }}</span>
                    </label>
                    <USlider
                      v-model="form.priority"
                      :min="0"
                      :max="100"
                      :step="1"
                    />
                    <p class="text-[11px] text-gray-500">
                      Lower = higher priority. Rules run in order.
                    </p>
                  </div>

                  <!-- Exempt Roles -->
                  <div class="space-y-2">
                    <label class="block text-sm font-medium"
                      >Exempt Roles</label
                    >
                    <USelectMenu
                      v-if="roleOptions.length > 0"
                      v-model="form.exemptRoles"
                      :items="roleOptions"
                      value-key="value"
                      multiple
                      placeholder="Roles immune to this rule..."
                      size="md"
                    />
                    <UInput
                      v-else
                      v-model="form.exemptRolesInput"
                      placeholder="Role IDs, comma separated"
                      size="md"
                    />
                    <p class="text-[11px] text-gray-500">
                      These roles bypass this rule entirely.
                    </p>
                  </div>

                  <!-- Exempt Channels -->
                  <div class="space-y-2">
                    <label class="block text-sm font-medium"
                      >Exempt Channels</label
                    >
                    <USelectMenu
                      v-if="channelOptions.length > 0"
                      v-model="form.exemptChannels"
                      :items="channelOptions"
                      value-key="value"
                      multiple
                      placeholder="Channels where this rule won't apply..."
                      size="md"
                    />
                    <UInput
                      v-else
                      v-model="form.exemptChannelsInput"
                      placeholder="Channel IDs, comma separated"
                      size="md"
                    />
                    <p class="text-[11px] text-gray-500">
                      This rule won't fire in these channels.
                    </p>
                  </div>
                </div>
              </template>
            </UAccordion>
          </div>

          <!-- Modal footer -->
          <div
            class="flex justify-end gap-3 px-6 py-4 border-t border-white/8 flex-shrink-0"
          >
            <UButton color="neutral" variant="ghost" @click="showModal = false">
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="saving"
              icon="i-heroicons-check"
              @click="saveRule"
            >
              {{ editingRule ? "Save Changes" : "Create Rule" }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- ── Delete Confirmation Modal ── -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-red-500/20 border border-red-500/30">
              <UIcon
                name="i-heroicons-exclamation-triangle"
                class="w-6 h-6 text-red-400"
              />
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">Delete Rule</h3>
              <p class="text-sm text-gray-400">This action cannot be undone</p>
            </div>
          </div>
          <p class="text-gray-300">
            Are you sure you want to delete
            <strong>{{ deletingRule?.name }}</strong
            >?
          </p>
          <div class="flex justify-end gap-3 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showDeleteModal = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              :loading="deleting"
              icon="i-heroicons-trash"
              @click="deleteRule()"
            >
              Delete Rule
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Query } from "appwrite";
import ConditionGroupEditor from "~/components/automod/ConditionGroupEditor.vue";

const route = useRoute();
const guildId = route.params.guild_id as string;
const {
  isModuleEnabled,
  loadChannels,
  loadRoles,
  channelOptions,
  roleOptions,
} = useServerSettings(guildId);

const { databases } = useAppwrite();
const toast = useToast();

const databaseId = "discord_bot";
const collectionId = "automod_rules";

// ── State ──
const loading = ref(true);
const saving = ref(false);
const deleting = ref(false);
const rules = ref<any[]>([]);
const showModal = ref(false);
const showDeleteModal = ref(false);
const editingRule = ref<any>(null);
const deletingRule = ref<any>(null);

// ── Form ──
interface ActionForm {
  type: string;
  params: Record<string, any>;
}

const defaultConditions = () => ({
  operator: "AND" as "AND" | "OR",
  conditions: [
    {
      type: "condition" as const,
      field: "message.content",
      operator: "contains" as const,
      value: "",
      flags: ["case_insensitive"],
    },
  ],
});

const form = ref({
  name: "",
  trigger: "message_create",
  conditions: defaultConditions(),
  actions: [] as ActionForm[],
  cooldown: 0,
  priority: 0,
  exemptRoles: [] as string[],
  exemptChannels: [] as string[],
  exemptRolesInput: "",
  exemptChannelsInput: "",
});

// ── Options ──
const triggerOptions = [
  { label: "💬 Message Created", value: "message_create" },
  { label: "✏️ Message Edited", value: "message_edit" },
];

const actionOptions = [
  { label: "🗑️ Delete Message", value: "delete_message" },
  { label: "⚠️ Warn User", value: "warn_user" },
  { label: "🔇 Timeout User", value: "timeout_user" },
  { label: "👢 Kick User", value: "kick_user" },
  { label: "🔨 Ban User", value: "ban_user" },
  { label: "💬 DM User", value: "dm_user" },
  { label: "📢 Send Channel Message", value: "send_channel_message" },
  { label: "➕ Add Role", value: "add_role" },
  { label: "➖ Remove Role", value: "remove_role" },
  { label: "📋 Log to Mod Log", value: "log_to_modlog" },
];

const advancedItems = [
  {
    label: "Advanced Options",
    icon: "i-heroicons-cog-6-tooth",
    defaultOpen: false,
  },
];

// Duration unit selector for timeout action
const durationUnitOptions = [
  { label: "Minutes", value: "m" },
  { label: "Hours", value: "h" },
  { label: "Days", value: "d" },
];

// Sync the composed duration string (e.g. "30m") whenever amount or unit changes
const syncDuration = (action: ActionForm) => {
  const amt = action.params._durationAmt;
  const unit = action.params._durationUnit ?? "m";
  if (amt && amt > 0) {
    action.params.duration = `${amt}${unit}`;
  } else {
    action.params.duration = "";
  }
};

// ── Helpers ──
const triggerIcon = (trigger: string) => {
  switch (trigger) {
    case "message_create":
      return "i-heroicons-chat-bubble-left";
    case "message_edit":
      return "i-heroicons-pencil";
    default:
      return "i-heroicons-bolt";
  }
};

const triggerLabel = (trigger: string) => {
  switch (trigger) {
    case "message_create":
      return "Fires on: Message Created";
    case "message_edit":
      return "Fires on: Message Edited";
    default:
      return `Fires on: ${trigger}`;
  }
};

const actionChipClass = (type: string) => {
  const map: Record<string, string> = {
    delete_message: "bg-red-500/10 border-red-500/25 text-red-300",
    warn_user: "bg-amber-500/10 border-amber-500/25 text-amber-300",
    timeout_user: "bg-blue-500/10 border-blue-500/25 text-blue-300",
    kick_user: "bg-orange-500/10 border-orange-500/25 text-orange-300",
    ban_user: "bg-red-500/15 border-red-500/30 text-red-200",
    dm_user: "bg-sky-500/10 border-sky-500/25 text-sky-300",
    send_channel_message:
      "bg-indigo-500/10 border-indigo-500/25 text-indigo-300",
    add_role: "bg-emerald-500/10 border-emerald-500/25 text-emerald-300",
    remove_role: "bg-gray-500/10 border-gray-500/25 text-gray-400",
    log_to_modlog: "bg-purple-500/10 border-purple-500/25 text-purple-300",
  };
  return map[type] ?? "bg-white/5 border-white/10 text-gray-300";
};

const actionAccentBar = (type: string) => {
  const map: Record<string, string> = {
    delete_message: "bg-red-500",
    warn_user: "bg-amber-500",
    timeout_user: "bg-blue-500",
    kick_user: "bg-orange-500",
    ban_user: "bg-red-600",
    dm_user: "bg-sky-500",
    send_channel_message: "bg-indigo-500",
    add_role: "bg-emerald-500",
    remove_role: "bg-gray-500",
    log_to_modlog: "bg-purple-500",
  };
  return map[type] ?? "bg-white/20";
};

const actionIcon = (type: string) => {
  const map: Record<string, string> = {
    delete_message: "i-heroicons-trash",
    warn_user: "i-heroicons-exclamation-triangle",
    timeout_user: "i-heroicons-clock",
    kick_user: "i-heroicons-arrow-right-on-rectangle",
    ban_user: "i-heroicons-no-symbol",
    dm_user: "i-heroicons-envelope",
    send_channel_message: "i-heroicons-chat-bubble-left-right",
    add_role: "i-heroicons-plus-circle",
    remove_role: "i-heroicons-minus-circle",
    log_to_modlog: "i-heroicons-clipboard-document-list",
  };
  return map[type] ?? "i-heroicons-bolt";
};

const actionLabel = (type: string) => {
  const labels: Record<string, string> = {
    delete_message: "Delete",
    warn_user: "Warn",
    timeout_user: "Timeout",
    kick_user: "Kick",
    ban_user: "Ban",
    dm_user: "DM",
    send_channel_message: "Post Message",
    add_role: "Add Role",
    remove_role: "Remove Role",
    log_to_modlog: "Log",
  };
  return labels[type] ?? type;
};

const parseActions = (rule: any): ActionForm[] => {
  try {
    return JSON.parse(rule.actions);
  } catch {
    return [];
  }
};

const countConditions = (rule: any): number => {
  try {
    const conds = JSON.parse(rule.conditions);
    const count = (group: any): number => {
      if (!group.conditions) return 0;
      return group.conditions.reduce((acc: number, c: any) => {
        if (c.type === "condition") return acc + 1;
        return acc + count(c);
      }, 0);
    };
    return count(conds);
  } catch {
    return 0;
  }
};

// ── CRUD ──
const fetchRules = async () => {
  loading.value = true;
  try {
    const response = await databases.listDocuments(databaseId, collectionId, [
      Query.equal("guild_id", guildId),
      Query.limit(100),
    ]);
    rules.value = response.documents;
  } catch (error) {
    console.error("Error fetching automod rules:", error);
    toast.add({
      title: "Error",
      description: "Failed to load automod rules.",
      color: "error",
    });
  } finally {
    loading.value = false;
  }
};

const openCreateModal = () => {
  editingRule.value = null;
  form.value = {
    name: "",
    trigger: "message_create",
    conditions: defaultConditions(),
    actions: [],
    cooldown: 0,
    priority: 0,
    exemptRoles: [],
    exemptChannels: [],
    exemptRolesInput: "",
    exemptChannelsInput: "",
  };
  showModal.value = true;
};

const openEditModal = (rule: any) => {
  editingRule.value = rule;
  const conditions = JSON.parse(rule.conditions);
  const actions = JSON.parse(rule.actions).map((a: any) => {
    const params = a.params ?? {};
    // Re-hydrate timeout UI fields from stored duration string (e.g. "30m" → amt=30, unit="m")
    if (a.type === "timeout_user" && params.duration) {
      const match = String(params.duration).match(/^(\d+)([mhd])$/);
      if (match) {
        params._durationAmt = parseInt(match[1] as string, 10);
        params._durationUnit = match[2] as string;
      }
    }
    // Re-hydrate ban delete_days default
    if (a.type === "ban_user" && params.delete_days === undefined) {
      params.delete_days = 0;
    }
    return { type: a.type, params };
  });
  const exemptRoles = rule.exempt_roles ? JSON.parse(rule.exempt_roles) : [];
  const exemptChannels = rule.exempt_channels
    ? JSON.parse(rule.exempt_channels)
    : [];

  form.value = {
    name: rule.name,
    trigger: rule.trigger,
    conditions,
    actions,
    cooldown: rule.cooldown ?? 0,
    priority: rule.priority ?? 0,
    exemptRoles,
    exemptChannels,
    exemptRolesInput: exemptRoles.join(", "),
    exemptChannelsInput: exemptChannels.join(", "),
  };
  showModal.value = true;
};

const addAction = () => {
  form.value.actions.push({ type: "delete_message", params: {} });
};

const saveRule = async () => {
  if (!form.value.name.trim()) {
    toast.add({
      title: "Validation",
      description: "Please enter a rule name.",
      color: "warning",
    });
    return;
  }
  if (form.value.actions.length === 0) {
    toast.add({
      title: "Validation",
      description: "Add at least one action.",
      color: "warning",
    });
    return;
  }

  saving.value = true;

  const exemptRoles =
    roleOptions.value.length > 0
      ? form.value.exemptRoles
      : form.value.exemptRolesInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  const exemptChannels =
    channelOptions.value.length > 0
      ? form.value.exemptChannels
      : form.value.exemptChannelsInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  const payload = {
    guild_id: guildId,
    name: form.value.name,
    enabled: editingRule.value ? editingRule.value.enabled : true,
    priority: form.value.priority,
    trigger: form.value.trigger,
    conditions: JSON.stringify(form.value.conditions),
    actions: JSON.stringify(
      form.value.actions.map((a) => {
        // Strip internal UI-only duration picker fields before persisting
        const { _durationAmt, _durationUnit, ...cleanParams } = a.params;
        const hasParams = Object.keys(cleanParams).length > 0;
        return {
          type: a.type,
          ...(hasParams ? { params: cleanParams } : {}),
        };
      }),
    ),
    exempt_roles: JSON.stringify(exemptRoles),
    exempt_channels: JSON.stringify(exemptChannels),
    cooldown: form.value.cooldown,
    updated_at: new Date().toISOString(),
  };

  try {
    if (editingRule.value) {
      await databases.updateDocument(
        databaseId,
        collectionId,
        editingRule.value.$id,
        payload,
      );
      toast.add({
        title: "Rule Updated",
        description: `"${form.value.name}" has been updated.`,
        color: "success",
      });
    } else {
      await databases.createDocument(
        databaseId,
        collectionId,
        "unique()",
        payload,
      );
      toast.add({
        title: "Rule Created",
        description: `"${form.value.name}" has been created.`,
        color: "success",
      });
    }

    showModal.value = false;
    await fetchRules();
  } catch (error) {
    console.error("Error saving rule:", error);
    toast.add({
      title: "Error",
      description: "Failed to save rule. Please try again.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
};

const toggleRule = async (rule: any, enabled: boolean) => {
  try {
    await databases.updateDocument(databaseId, collectionId, rule.$id, {
      enabled,
      updated_at: new Date().toISOString(),
    });
    rule.enabled = enabled;
    toast.add({
      title: enabled ? "Rule Enabled" : "Rule Disabled",
      description: `"${rule.name}" is now ${enabled ? "active" : "inactive"}.`,
      color: "success",
    });
  } catch (error) {
    console.error("Error toggling rule:", error);
    toast.add({
      title: "Error",
      description: "Failed to update rule.",
      color: "error",
    });
  }
};

const confirmDelete = (rule: any) => {
  deletingRule.value = rule;
  showDeleteModal.value = true;
};

const deleteRule = async () => {
  if (!deletingRule.value) return;
  deleting.value = true;
  try {
    await databases.deleteDocument(
      databaseId,
      collectionId,
      deletingRule.value.$id,
    );
    toast.add({
      title: "Rule Deleted",
      description: `"${deletingRule.value.name}" has been removed.`,
      color: "success",
    });
    showDeleteModal.value = false;
    await fetchRules();
  } catch (error) {
    console.error("Error deleting rule:", error);
    toast.add({
      title: "Error",
      description: "Failed to delete rule.",
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
};

// ── Init ──
onMounted(async () => {
  loadChannels();
  loadRoles();
  await fetchRules();
});
</script>
