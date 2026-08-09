export interface ModuleMeta {
  displayName: string;
  category: ModuleCategoryKey;
  tags: string[];
  icon: string;
  bgClass: string;
  iconClass: string;
}

export type ModuleCategoryKey =
  | "moderation"
  | "engagement"
  | "community"
  | "voice"
  | "ai";

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
];

export const MODULE_METADATA: Record<string, ModuleMeta> = {
  music: {
    displayName: "Music",
    category: "voice",
    tags: ["audio", "playback", "queue", "spotify", "dj", "filters"],
    icon: "i-lucide-disc-3",
    bgClass: "bg-violet-500/10 border border-violet-500/20",
    iconClass: "text-violet-400",
  },
  moderation: {
    displayName: "Moderation",
    category: "moderation",
    tags: ["ban", "kick", "timeout", "warn", "mod-logs", "security"],
    icon: "i-lucide-gavel",
    bgClass: "bg-blue-500/10 border border-blue-500/20",
    iconClass: "text-blue-400",
  },
  automod: {
    displayName: "AutoMod",
    category: "moderation",
    tags: ["spam", "filters", "bad-words", "anti-invite", "automated", "links"],
    icon: "i-lucide-shield-ban",
    bgClass: "bg-orange-500/10 border border-orange-500/20",
    iconClass: "text-orange-400",
  },
  antiraid: {
    displayName: "Anti-Raid",
    category: "moderation",
    tags: ["lockdown", "join-flood", "mass-kick", "protection", "security"],
    icon: "i-lucide-siren",
    bgClass: "bg-rose-500/10 border border-rose-500/20",
    iconClass: "text-rose-400",
  },
  verification: {
    displayName: "Verification",
    category: "moderation",
    tags: ["captcha", "gate", "member-verification", "onboarding", "rules"],
    icon: "i-lucide-badge-check",
    bgClass: "bg-green-500/10 border border-green-500/20",
    iconClass: "text-green-400",
  },
  logging: {
    displayName: "Audit Logging",
    category: "moderation",
    tags: ["audit", "history", "tracking", "mod-logs", "events"],
    icon: "i-lucide-scroll-text",
    bgClass: "bg-cyan-500/10 border border-cyan-500/20",
    iconClass: "text-cyan-400",
  },
  welcome: {
    displayName: "Welcome Image",
    category: "engagement",
    tags: ["canvas", "welcome-card", "join", "greeting", "banner"],
    icon: "i-lucide-party-popper",
    bgClass: "bg-purple-500/10 border border-purple-500/20",
    iconClass: "text-purple-400",
  },
  milestones: {
    displayName: "Milestones",
    category: "engagement",
    tags: ["xp", "levels", "rewards", "leaderboard", "rank", "activity"],
    icon: "i-lucide-trophy",
    bgClass: "bg-amber-500/10 border border-amber-500/20",
    iconClass: "text-amber-400",
  },
  "reaction-roles": {
    displayName: "Reaction Roles",
    category: "engagement",
    tags: ["roles", "self-assign", "reactions", "buttons", "emotes"],
    icon: "i-lucide-smile-plus",
    bgClass: "bg-yellow-500/10 border border-yellow-500/20",
    iconClass: "text-yellow-400",
  },
  triggers: {
    displayName: "Triggers",
    category: "engagement",
    tags: ["auto-response", "custom-commands", "keywords", "automation"],
    icon: "i-lucide-zap",
    bgClass: "bg-emerald-500/10 border border-emerald-500/20",
    iconClass: "text-emerald-400",
  },
  alerts: {
    displayName: "Social Alerts",
    category: "engagement",
    tags: ["twitch", "youtube", "social", "stream", "notifications"],
    icon: "i-lucide-bell-ring",
    bgClass: "bg-pink-500/10 border border-pink-500/20",
    iconClass: "text-pink-400",
  },
  tickets: {
    displayName: "Tickets",
    category: "community",
    tags: ["support", "helpdesk", "transcripts", "modmail", "assistance"],
    icon: "i-lucide-ticket",
    bgClass: "bg-sky-500/10 border border-sky-500/20",
    iconClass: "text-sky-400",
  },
  events: {
    displayName: "Events",
    category: "community",
    tags: ["scheduler", "calendar", "reminders", "timezones", "community"],
    icon: "i-lucide-calendar-clock",
    bgClass: "bg-teal-500/10 border border-teal-500/20",
    iconClass: "text-teal-400",
  },
  polls: {
    displayName: "Polls",
    category: "community",
    tags: ["voting", "surveys", "multiple-choice", "results", "questions"],
    icon: "i-lucide-bar-chart-3",
    bgClass: "bg-fuchsia-500/10 border border-fuchsia-500/20",
    iconClass: "text-fuchsia-400",
  },
  embeds: {
    displayName: "Custom Embeds",
    category: "community",
    tags: ["visual-builder", "rich-embeds", "webhooks", "builder", "json"],
    icon: "i-lucide-layout-template",
    bgClass: "bg-violet-500/10 border border-violet-500/20",
    iconClass: "text-violet-400",
  },
  tags: {
    displayName: "Tags",
    category: "community",
    tags: ["snippets", "shortcuts", "canned-responses", "faq", "quick-reply"],
    icon: "i-lucide-tag",
    bgClass: "bg-teal-500/10 border border-teal-500/20",
    iconClass: "text-teal-400",
  },
  recording: {
    displayName: "Recording",
    category: "voice",
    tags: ["voice", "multitrack", "audio", "podcasts", "recording", "wav"],
    icon: "i-lucide-audio-waveform",
    bgClass: "bg-red-500/10 border border-red-500/20",
    iconClass: "text-red-400",
  },
  tempvoice: {
    displayName: "Temp Voice",
    category: "voice",
    tags: ["temporary-channels", "dynamic-vc", "voice-hub", "generator"],
    icon: "i-lucide-mic-vocal",
    bgClass: "bg-indigo-500/10 border border-indigo-500/20",
    iconClass: "text-indigo-400",
  },
  ai: {
    displayName: "AI Assistant",
    category: "ai",
    tags: ["gpt", "claude", "chat", "assistant", "smart", "vision", "bot"],
    icon: "i-lucide-bot",
    bgClass: "bg-violet-500/10 border border-violet-500/20",
    iconClass: "text-violet-400",
  },
  fun: {
    displayName: "Fun",
    category: "community",
    tags: ["games", "minigames", "entertainment", "fun"],
    icon: "i-lucide-gamepad-2",
    bgClass: "bg-amber-500/10 border border-amber-500/20",
    iconClass: "text-amber-400",
  },
  utility: {
    displayName: "Utility",
    category: "community",
    tags: ["tools", "helpers", "server-info", "ping", "utilities"],
    icon: "i-lucide-sliders-horizontal",
    bgClass: "bg-emerald-500/10 border border-emerald-500/20",
    iconClass: "text-emerald-400",
  },
};

/**
 * Returns complete metadata for a module, with dynamic fallbacks for new or unlisted modules.
 */
export function getModuleMetadata(name: string): ModuleMeta {
  const key = name.toLowerCase();
  if (MODULE_METADATA[key]) {
    return MODULE_METADATA[key];
  }

  // Fallback for new modules added dynamically
  const formattedTitle = name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    displayName: formattedTitle,
    category: "community",
    tags: [key, ...name.split(/[-_]/)],
    icon: "i-lucide-box",
    bgClass: "bg-gray-500/10 border border-gray-500/20",
    iconClass: "text-gray-400",
  };
}
