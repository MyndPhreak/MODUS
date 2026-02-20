import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Message,
  GuildMember,
  TextChannel,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";

// ── Types ──────────────────────────────────────────────────────────

export type TriggerType = "message_create" | "message_edit";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "matches_regex"
  | "greater_than"
  | "less_than"
  | "in_list"
  | "not_in_list"
  | "has_role"
  | "not_has_role";

export interface Condition {
  type: "condition";
  field: string;
  operator: ConditionOperator;
  value: string | number | boolean | string[];
  flags?: string[]; // e.g. ['case_insensitive']
  negate?: boolean;
}

export interface ConditionGroup {
  operator: "AND" | "OR";
  conditions: (Condition | ConditionGroup)[];
  negate?: boolean;
}

export type ActionType =
  | "delete_message"
  | "warn_user"
  | "timeout_user"
  | "kick_user"
  | "ban_user"
  | "dm_user"
  | "send_channel_message"
  | "add_role"
  | "remove_role"
  | "log_to_modlog";

export interface ActionDef {
  type: ActionType;
  params?: Record<string, any>;
}

export interface AutoModRule {
  id: string;
  guild_id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: TriggerType;
  conditions: ConditionGroup;
  actions: ActionDef[];
  exempt_roles: string[];
  exempt_channels: string[];
  cooldown: number;
  created_by?: string;
}

// ── Rule Cache ─────────────────────────────────────────────────────

interface CachedRules {
  rules: AutoModRule[];
  fetchedAt: number;
}

const ruleCache = new Map<string, CachedRules>();
const CACHE_TTL_MS = 60_000; // 60 seconds

async function getRulesForGuild(
  moduleManager: ModuleManager,
  guildId: string,
  trigger: TriggerType,
): Promise<AutoModRule[]> {
  const cacheKey = `${guildId}:${trigger}`;
  const cached = ruleCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rules;
  }

  const docs = await moduleManager.appwriteService.getEnabledAutoModRules(
    guildId,
    trigger,
  );

  const rules: AutoModRule[] = docs.map((doc) => ({
    id: doc.$id,
    guild_id: doc.guild_id,
    name: doc.name,
    enabled: doc.enabled,
    priority: doc.priority ?? 0,
    trigger: doc.trigger,
    conditions: JSON.parse(doc.conditions),
    actions: JSON.parse(doc.actions),
    exempt_roles: doc.exempt_roles ? JSON.parse(doc.exempt_roles) : [],
    exempt_channels: doc.exempt_channels ? JSON.parse(doc.exempt_channels) : [],
    cooldown: doc.cooldown ?? 0,
    created_by: doc.created_by,
  }));

  // Sort by priority (lower = first)
  rules.sort((a, b) => a.priority - b.priority);

  ruleCache.set(cacheKey, { rules, fetchedAt: Date.now() });
  return rules;
}

/** Invalidate cache for a guild (called from web dashboard when rules change) */
export function invalidateAutoModCache(guildId: string) {
  for (const key of ruleCache.keys()) {
    if (key.startsWith(`${guildId}:`)) {
      ruleCache.delete(key);
    }
  }
}

// ── Cooldown Tracking ──────────────────────────────────────────────

// Map<ruleId:userId, lastTriggeredTimestamp>
const cooldownMap = new Map<string, number>();

function isOnCooldown(
  ruleId: string,
  userId: string,
  cooldownSec: number,
): boolean {
  if (cooldownSec <= 0) return false;
  const key = `${ruleId}:${userId}`;
  const last = cooldownMap.get(key);
  if (!last) return false;
  return Date.now() - last < cooldownSec * 1000;
}

function setCooldown(ruleId: string, userId: string) {
  cooldownMap.set(`${ruleId}:${userId}`, Date.now());
}

// Periodic cleanup of stale cooldowns (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of cooldownMap.entries()) {
    if (now - ts > 3600_000) cooldownMap.delete(key); // 1 hour max
  }
}, 300_000);

// ── Field Extraction ───────────────────────────────────────────────

function extractField(
  field: string,
  message: Message,
  member: GuildMember | null,
): string | number | boolean | string[] | null {
  switch (field) {
    // ── Message fields ──
    case "message.content":
      return message.content;
    case "message.content_lower":
      return message.content.toLowerCase();
    case "message.length":
      return message.content.length;
    case "message.word_count":
      return message.content.split(/\s+/).filter(Boolean).length;
    case "message.mentions_count":
      return message.mentions.users.size + message.mentions.roles.size;
    case "message.emoji_count": {
      const customEmoji = message.content.match(/<a?:\w+:\d+>/g);
      const unicodeEmoji = message.content.match(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      );
      return (customEmoji?.length ?? 0) + (unicodeEmoji?.length ?? 0);
    }
    case "message.links_count": {
      const urls = message.content.match(/https?:\/\/\S+/gi);
      return urls?.length ?? 0;
    }
    case "message.attachments_count":
      return message.attachments.size;
    case "message.has_embed":
      return message.embeds.length > 0;
    case "message.is_all_caps": {
      const letters = message.content.replace(/[^a-zA-Z]/g, "");
      return letters.length > 3 && letters === letters.toUpperCase();
    }
    case "message.caps_ratio": {
      const allLetters = message.content.replace(/[^a-zA-Z]/g, "");
      if (allLetters.length === 0) return 0;
      const upperCount = allLetters.replace(/[^A-Z]/g, "").length;
      return upperCount / allLetters.length;
    }
    case "message.sticker_count":
      return message.stickers.size;

    // ── User fields ──
    case "user.id":
      return message.author.id;
    case "user.username":
      return message.author.username;
    case "user.nickname":
      return member?.nickname ?? message.author.username;
    case "user.account_age_days": {
      const created = message.author.createdAt;
      return Math.floor((Date.now() - created.getTime()) / 86400000);
    }
    case "user.join_age_days": {
      if (!member?.joinedAt) return 0;
      return Math.floor((Date.now() - member.joinedAt.getTime()) / 86400000);
    }
    case "user.role_ids":
      return member ? Array.from(member.roles.cache.keys()) : [];
    case "user.is_bot":
      return message.author.bot;

    // ── Channel fields ──
    case "channel.id":
      return message.channelId;
    case "channel.name":
      return (message.channel as TextChannel)?.name ?? "";
    case "channel.is_nsfw":
      return (message.channel as TextChannel)?.nsfw ?? false;

    default:
      return null;
  }
}

// ── Condition Evaluation ───────────────────────────────────────────

function evaluateCondition(
  condition: Condition,
  message: Message,
  member: GuildMember | null,
): boolean {
  const fieldValue = extractField(condition.field, message, member);
  if (fieldValue === null && condition.operator !== "equals") return false;

  const caseInsensitive =
    condition.flags?.includes("case_insensitive") ?? false;

  let result = false;

  switch (condition.operator) {
    case "equals":
      if (
        typeof fieldValue === "string" &&
        typeof condition.value === "string"
      ) {
        result = caseInsensitive
          ? fieldValue.toLowerCase() === condition.value.toLowerCase()
          : fieldValue === condition.value;
      } else {
        result = fieldValue === condition.value;
      }
      break;

    case "not_equals":
      if (
        typeof fieldValue === "string" &&
        typeof condition.value === "string"
      ) {
        result = caseInsensitive
          ? fieldValue.toLowerCase() !== condition.value.toLowerCase()
          : fieldValue !== condition.value;
      } else {
        result = fieldValue !== condition.value;
      }
      break;

    case "contains": {
      const haystack = caseInsensitive
        ? String(fieldValue).toLowerCase()
        : String(fieldValue);
      const needle = caseInsensitive
        ? String(condition.value).toLowerCase()
        : String(condition.value);
      result = haystack.includes(needle);
      break;
    }

    case "not_contains": {
      const haystack = caseInsensitive
        ? String(fieldValue).toLowerCase()
        : String(fieldValue);
      const needle = caseInsensitive
        ? String(condition.value).toLowerCase()
        : String(condition.value);
      result = !haystack.includes(needle);
      break;
    }

    case "starts_with": {
      const str = caseInsensitive
        ? String(fieldValue).toLowerCase()
        : String(fieldValue);
      const prefix = caseInsensitive
        ? String(condition.value).toLowerCase()
        : String(condition.value);
      result = str.startsWith(prefix);
      break;
    }

    case "ends_with": {
      const str = caseInsensitive
        ? String(fieldValue).toLowerCase()
        : String(fieldValue);
      const suffix = caseInsensitive
        ? String(condition.value).toLowerCase()
        : String(condition.value);
      result = str.endsWith(suffix);
      break;
    }

    case "matches_regex": {
      try {
        const flags = caseInsensitive ? "gi" : "g";
        const regex = new RegExp(String(condition.value), flags);
        result = regex.test(String(fieldValue));
      } catch {
        // Invalid regex — treat as no match
        result = false;
      }
      break;
    }

    case "greater_than":
      result = Number(fieldValue) > Number(condition.value);
      break;

    case "less_than":
      result = Number(fieldValue) < Number(condition.value);
      break;

    case "in_list": {
      const list = Array.isArray(condition.value)
        ? condition.value
        : String(condition.value)
            .split(",")
            .map((s) => s.trim());
      const val = caseInsensitive
        ? String(fieldValue).toLowerCase()
        : String(fieldValue);
      result = list.some((item) =>
        caseInsensitive ? val.includes(item.toLowerCase()) : val.includes(item),
      );
      break;
    }

    case "not_in_list": {
      const list = Array.isArray(condition.value)
        ? condition.value
        : String(condition.value)
            .split(",")
            .map((s) => s.trim());
      const val = caseInsensitive
        ? String(fieldValue).toLowerCase()
        : String(fieldValue);
      result = !list.some((item) =>
        caseInsensitive ? val.includes(item.toLowerCase()) : val.includes(item),
      );
      break;
    }

    case "has_role": {
      const roleIds = Array.isArray(fieldValue) ? fieldValue : [];
      result = roleIds.includes(String(condition.value));
      break;
    }

    case "not_has_role": {
      const roleIds = Array.isArray(fieldValue) ? fieldValue : [];
      result = !roleIds.includes(String(condition.value));
      break;
    }

    default:
      result = false;
  }

  return condition.negate ? !result : result;
}

function evaluateConditionTree(
  group: ConditionGroup,
  message: Message,
  member: GuildMember | null,
): boolean {
  let result: boolean;

  if (group.operator === "AND") {
    result = group.conditions.every((node) => {
      if ("type" in node && node.type === "condition") {
        return evaluateCondition(node as Condition, message, member);
      }
      return evaluateConditionTree(node as ConditionGroup, message, member);
    });
  } else {
    // OR
    result = group.conditions.some((node) => {
      if ("type" in node && node.type === "condition") {
        return evaluateCondition(node as Condition, message, member);
      }
      return evaluateConditionTree(node as ConditionGroup, message, member);
    });
  }

  return group.negate ? !result : result;
}

// ── Action Execution ───────────────────────────────────────────────

async function executeActions(
  actions: ActionDef[],
  message: Message,
  member: GuildMember,
  rule: AutoModRule,
  moduleManager: ModuleManager,
): Promise<void> {
  const guildId = message.guildId!;
  const guild = message.guild!;

  for (const action of actions) {
    try {
      switch (action.type) {
        case "delete_message":
          if (message.deletable) {
            await message.delete().catch(() => {});
          }
          break;

        case "warn_user": {
          // Store warning in moderation settings (reuses existing pattern)
          const modSettings =
            await moduleManager.appwriteService.getModuleSettings(
              guildId,
              "moderation",
            );
          const warnings: any[] = modSettings.warnings || [];
          const lastCaseId = (modSettings.lastCaseId || 0) + 1;
          warnings.push({
            caseId: lastCaseId,
            guildId,
            moderatorId: "automod",
            moderatorTag: "AutoMod",
            targetId: member.id,
            targetTag: member.user.tag,
            action: "warn",
            reason: `AutoMod: Rule "${rule.name}" triggered`,
            timestamp: new Date().toISOString(),
          });
          await moduleManager.appwriteService.setModuleSettings(
            guildId,
            "moderation",
            { ...modSettings, warnings, lastCaseId },
          );
          break;
        }

        case "timeout_user": {
          const durationStr = action.params?.duration ?? "10m";
          const minutes = parseDurationMinutes(durationStr);
          if (minutes > 0 && member.moderatable) {
            await member.timeout(
              minutes * 60 * 1000,
              `AutoMod: Rule "${rule.name}"`,
            );
          }
          break;
        }

        case "kick_user":
          if (member.kickable) {
            await member.kick(`AutoMod: Rule "${rule.name}"`);
          }
          break;

        case "ban_user": {
          const deleteDays = action.params?.delete_days ?? 0;
          if (member.bannable) {
            await guild.members.ban(member, {
              reason: `AutoMod: Rule "${rule.name}"`,
              deleteMessageSeconds: deleteDays * 86400,
            });
          }
          break;
        }

        case "dm_user": {
          const dmMessage =
            action.params?.message ??
            `Your message in **${guild.name}** triggered an auto-moderation rule.`;
          try {
            await member.user.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xe67e22)
                  .setTitle(`⚠️ AutoMod — ${guild.name}`)
                  .setDescription(dmMessage)
                  .addFields({
                    name: "Rule",
                    value: rule.name,
                    inline: true,
                  })
                  .setTimestamp(),
              ],
            });
          } catch {
            // User has DMs disabled
          }
          break;
        }

        case "send_channel_message": {
          const channelId = action.params?.channel_id ?? message.channelId;
          const text =
            action.params?.message ??
            `⚠️ A message by <@${member.id}> was flagged by AutoMod.`;
          const targetChannel = guild.channels.cache.get(channelId);
          if (targetChannel instanceof TextChannel) {
            await targetChannel.send(text);
          }
          break;
        }

        case "add_role": {
          const roleId = action.params?.role_id;
          if (roleId && !member.roles.cache.has(roleId)) {
            await member.roles.add(roleId, `AutoMod: Rule "${rule.name}"`);
          }
          break;
        }

        case "remove_role": {
          const roleId = action.params?.role_id;
          if (roleId && member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId, `AutoMod: Rule "${rule.name}"`);
          }
          break;
        }

        case "log_to_modlog": {
          const modSettings =
            await moduleManager.appwriteService.getModuleSettings(
              guildId,
              "moderation",
            );
          if (modSettings.modLogChannelId) {
            const logChannel = guild.channels.cache.get(
              modSettings.modLogChannelId,
            );
            if (logChannel instanceof TextChannel) {
              const embed = new EmbedBuilder()
                .setColor(0xe67e22)
                .setTitle("🤖 AutoMod Action")
                .addFields(
                  { name: "Rule", value: rule.name, inline: true },
                  {
                    name: "User",
                    value: `${member.user.tag} (<@${member.id}>)`,
                    inline: true,
                  },
                  {
                    name: "Channel",
                    value: `<#${message.channelId}>`,
                    inline: true,
                  },
                  {
                    name: "Message",
                    value:
                      message.content.slice(0, 1024) || "(no text content)",
                  },
                  {
                    name: "Actions Taken",
                    value: actions.map((a) => `\`${a.type}\``).join(", "),
                  },
                )
                .setTimestamp();
              await logChannel.send({ embeds: [embed] });
            }
          }
          // Also log to Appwrite
          moduleManager.logger.info(
            `[AutoMod] Rule "${rule.name}" triggered on ${member.user.tag}: ${actions.map((a) => a.type).join(", ")}`,
            guildId,
            "automod",
          );
          break;
        }
      }
    } catch (err) {
      console.error(
        `[AutoMod] Error executing action ${action.type} for rule "${rule.name}":`,
        err,
      );
    }
  }
}

// ── Duration Parser ────────────────────────────────────────────────

function parseDurationMinutes(input: string): number {
  const match = input.match(
    /^(\d+)\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?)$/i,
  );
  if (!match) return 10; // default 10 minutes
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("m")) return value;
  if (unit.startsWith("h")) return value * 60;
  if (unit.startsWith("d")) return value * 1440;
  return value;
}

// ── Main Evaluation Entry Point ────────────────────────────────────

async function evaluateMessage(
  message: Message,
  trigger: TriggerType,
  moduleManager: ModuleManager,
): Promise<void> {
  // Ignore bots and DMs
  if (message.author.bot) return;
  if (!message.guild || !message.guildId) return;

  const guildId = message.guildId;

  // Check if automod module is enabled for this guild
  const isEnabled = await moduleManager.appwriteService.isModuleEnabled(
    guildId,
    "automod",
  );
  if (!isEnabled) return;

  const rules = await getRulesForGuild(moduleManager, guildId, trigger);
  if (rules.length === 0) return;

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  for (const rule of rules) {
    // Skip if user has an exempt role
    if (
      rule.exempt_roles.length > 0 &&
      rule.exempt_roles.some((roleId) => member.roles.cache.has(roleId))
    ) {
      continue;
    }

    // Skip if message is in an exempt channel
    if (
      rule.exempt_channels.length > 0 &&
      rule.exempt_channels.includes(message.channelId)
    ) {
      continue;
    }

    // Skip if on cooldown
    if (isOnCooldown(rule.id, message.author.id, rule.cooldown)) {
      continue;
    }

    // Evaluate the condition tree
    try {
      const matches = evaluateConditionTree(rule.conditions, message, member);
      if (matches) {
        setCooldown(rule.id, message.author.id);
        await executeActions(
          rule.actions,
          message,
          member,
          rule,
          moduleManager,
        );
        // Stop processing further rules if message was deleted
        if (rule.actions.some((a) => a.type === "delete_message")) {
          break;
        }
      }
    } catch (err) {
      console.error(
        `[AutoMod] Error evaluating rule "${rule.name}" in guild ${guildId}:`,
        err,
      );
    }
  }
}

// ── Module Definition ──────────────────────────────────────────────

const automodCommand = new SlashCommandBuilder()
  .setName("automod")
  .setDescription("View AutoMod rules status")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .toJSON();

const automodModule: BotModule = {
  name: "automod",
  description:
    "Programmable auto-moderation engine with IF/THEN rules, regex, and conditional logic",
  commands: [automodCommand],

  execute: async (
    interaction: ChatInputCommandInteraction,
    moduleManager: ModuleManager,
  ) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply("This command can only be used in a server.");
      return;
    }

    const rules = await moduleManager.appwriteService.getAutoModRules(guildId);
    const enabledCount = rules.filter((r) => r.enabled).length;

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle("🤖 AutoMod Engine")
      .setDescription(
        rules.length === 0
          ? "No rules configured yet. Use the web dashboard to create rules."
          : `**${rules.length}** rule(s) configured, **${enabledCount}** active.`,
      )
      .setTimestamp();

    if (rules.length > 0) {
      const ruleList = rules
        .slice(0, 10)
        .map((r) => {
          const status = r.enabled ? "🟢" : "🔴";
          return `${status} **${r.name}** — \`${r.trigger}\``;
        })
        .join("\n");
      embed.addFields({
        name: "Rules",
        value:
          ruleList +
          (rules.length > 10 ? `\n...and ${rules.length - 10} more` : ""),
      });
    }

    embed.setFooter({
      text: "Configure rules from the web dashboard → Modules → AutoMod",
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

// ── Event Registration ─────────────────────────────────────────────

export function registerAutoModEvents(moduleManager: ModuleManager) {
  const client = moduleManager["client"];

  client.on("messageCreate", async (message: Message) => {
    try {
      await evaluateMessage(message, "message_create", moduleManager);
    } catch (err) {
      console.error("[AutoMod] Error in messageCreate handler:", err);
    }
  });

  client.on("messageUpdate", async (_oldMessage, newMessage) => {
    // messageUpdate can provide partial messages — fetch full if needed
    if (!newMessage.author || newMessage.author.bot) return;
    if (!newMessage.guild) return;

    try {
      const fullMessage = newMessage.partial
        ? await newMessage.fetch().catch(() => null)
        : newMessage;
      if (fullMessage) {
        await evaluateMessage(
          fullMessage as Message,
          "message_edit",
          moduleManager,
        );
      }
    } catch (err) {
      console.error("[AutoMod] Error in messageUpdate handler:", err);
    }
  });

  console.log(
    "[AutoMod] messageCreate + messageUpdate event listeners registered.",
  );
}

export default automodModule;
