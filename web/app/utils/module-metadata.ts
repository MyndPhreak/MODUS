import type { ModuleDoc, ModuleCategoryKey, ModuleColorToken } from "@modus/db";

export type { ModuleCategoryKey };

export interface ModuleCategoryInfo {
  key: ModuleCategoryKey;
  label: string;
  icon: string;
  description: string;
}

export const MODULE_CATEGORIES: ModuleCategoryInfo[] = [
  {
    key: "moderation",
    label: "Moderation & Safety",
    icon: "i-lucide-shield",
    description: "Keep your server safe with automated filters, anti-raid, and moderation tools.",
  },
  {
    key: "engagement",
    label: "Engagement & Rewards",
    icon: "i-lucide-sparkles",
    description: "Engage your community with XP progression, dynamic greetings, and automated triggers.",
  },
  {
    key: "community",
    label: "Community Tools",
    icon: "i-lucide-users",
    description: "Support desk tickets, event schedules, polls, custom embeds, and snippet tags.",
  },
  {
    key: "voice",
    label: "Voice & Media",
    icon: "i-lucide-volume-2",
    description: "High-fidelity music playback, multitrack voice recording, and dynamic voice rooms.",
  },
  {
    key: "ai",
    label: "AI & Intelligence",
    icon: "i-lucide-bot",
    description: "Intelligent conversations, vision analysis, and contextual server assistance.",
  },
  {
    key: "utility",
    label: "Utility & Tools",
    icon: "i-lucide-wrench",
    description: "Handy commands available to every member — help, status checks, announcements, and reminders.",
  },
];

/**
 * Literal Tailwind class strings per color token. Must stay literal (not
 * built via string interpolation) so Tailwind's content scanner retains
 * them in the production build.
 */
const COLOR_STYLES: Record<ModuleColorToken, { bgClass: string; iconClass: string }> = {
  violet: { bgClass: "bg-violet-500/10 border border-violet-500/20", iconClass: "text-violet-400" },
  blue: { bgClass: "bg-blue-500/10 border border-blue-500/20", iconClass: "text-blue-400" },
  orange: { bgClass: "bg-orange-500/10 border border-orange-500/20", iconClass: "text-orange-400" },
  rose: { bgClass: "bg-rose-500/10 border border-rose-500/20", iconClass: "text-rose-400" },
  green: { bgClass: "bg-green-500/10 border border-green-500/20", iconClass: "text-green-400" },
  cyan: { bgClass: "bg-cyan-500/10 border border-cyan-500/20", iconClass: "text-cyan-400" },
  purple: { bgClass: "bg-purple-500/10 border border-purple-500/20", iconClass: "text-purple-400" },
  amber: { bgClass: "bg-amber-500/10 border border-amber-500/20", iconClass: "text-amber-400" },
  yellow: { bgClass: "bg-yellow-500/10 border border-yellow-500/20", iconClass: "text-yellow-400" },
  emerald: { bgClass: "bg-emerald-500/10 border border-emerald-500/20", iconClass: "text-emerald-400" },
  pink: { bgClass: "bg-pink-500/10 border border-pink-500/20", iconClass: "text-pink-400" },
  sky: { bgClass: "bg-sky-500/10 border border-sky-500/20", iconClass: "text-sky-400" },
  teal: { bgClass: "bg-teal-500/10 border border-teal-500/20", iconClass: "text-teal-400" },
  fuchsia: { bgClass: "bg-fuchsia-500/10 border border-fuchsia-500/20", iconClass: "text-fuchsia-400" },
  red: { bgClass: "bg-red-500/10 border border-red-500/20", iconClass: "text-red-400" },
  indigo: { bgClass: "bg-indigo-500/10 border border-indigo-500/20", iconClass: "text-indigo-400" },
  gray: { bgClass: "bg-gray-500/10 border border-gray-500/20", iconClass: "text-gray-400" },
};

function titleCase(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export interface ModuleDisplay {
  displayName: string;
  icon: string;
  bgClass: string;
  iconClass: string;
  tags: string[];
  category: ModuleCategoryKey | null;
}

/** Valid category keys, derived from MODULE_CATEGORIES so this can't drift. */
const VALID_CATEGORY_KEYS = new Set<string>(MODULE_CATEGORIES.map((c) => c.key));

/**
 * Resolves a module's dashboard display identity from the DB-backed
 * `ModuleDoc` (populated by `BotModule.meta` on the bot side). Falls back to
 * a generic gray box if a module hasn't been given metadata yet — this
 * shouldn't happen for any module that intends to appear on the dashboard,
 * but keeps the grid from breaking if one slips through.
 */
export function getModuleDisplay(mod: ModuleDoc): ModuleDisplay {
  // mod.color comes from a free-text DB column, so it isn't guaranteed to be
  // a valid ModuleColorToken (stale row, hand-edited data, version skew) —
  // the `||` fallback below degrades safely to gray for any unknown value.
  const style =
    (mod.color && COLOR_STYLES[mod.color as ModuleColorToken]) || COLOR_STYLES.gray;
  const category =
    mod.category && VALID_CATEGORY_KEYS.has(mod.category)
      ? (mod.category as ModuleCategoryKey)
      : null;
  return {
    displayName: mod.displayName || titleCase(mod.name),
    icon: mod.icon || "i-lucide-box",
    bgClass: style.bgClass,
    iconClass: style.iconClass,
    tags: mod.tags && mod.tags.length > 0 ? mod.tags : [mod.name],
    category,
  };
}
