export const RANK_CARD_IMAGE_PROXY_PREFIX = "/api/xp/bg/xp/";
export const MAX_RANK_CARD_IMAGE_LAYERS = 10;
export const MAX_RANK_CARD_TINT_PIXELS = 4_194_304;
export const MAX_RANK_CARD_TINT_DIMENSION = Math.floor(
  Math.sqrt(MAX_RANK_CARD_TINT_PIXELS),
);

export const RANK_CARD_IMAGE_SOURCE_ERROR =
  "Image elements must use an uploaded rank card image.";
export const RANK_CARD_IMAGE_COUNT_ERROR =
  "A rank card template can contain up to 10 images.";

interface RankCardImageElementLike {
  type?: unknown;
  src?: unknown;
}

export function isRankCardImageProxySource(
  source: unknown,
): source is string {
  return (
    typeof source === "string" &&
    source.startsWith(RANK_CARD_IMAGE_PROXY_PREFIX)
  );
}

export function isTintableRankCardSvgSource(source: unknown): source is string {
  return isRankCardImageProxySource(source) && source.endsWith(".svg");
}

export function getRankCardTintRasterSize(
  intrinsicWidth: number,
  intrinsicHeight: number,
  renderedWidth: number,
  renderedHeight: number,
): { width: number; height: number } {
  const width = Math.min(MAX_RANK_CARD_TINT_DIMENSION, Math.max(
    1,
    Math.ceil(Number.isFinite(renderedWidth) && renderedWidth > 0
      ? renderedWidth
      : intrinsicWidth || 1),
  ));
  const height = Math.min(MAX_RANK_CARD_TINT_DIMENSION, Math.max(
    1,
    Math.ceil(Number.isFinite(renderedHeight) && renderedHeight > 0
      ? renderedHeight
      : intrinsicHeight || 1),
  ));
  const scale = Math.min(1, Math.sqrt(MAX_RANK_CARD_TINT_PIXELS / (width * height)));

  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function validateRankCardImageElements(elements: unknown): string | null {
  if (!Array.isArray(elements)) return null;

  let imageCount = 0;
  for (const element of elements as RankCardImageElementLike[]) {
    if (element?.type !== "image") continue;
    imageCount += 1;
    if (!isRankCardImageProxySource(element.src)) {
      return RANK_CARD_IMAGE_SOURCE_ERROR;
    }
  }

  return imageCount > MAX_RANK_CARD_IMAGE_LAYERS
    ? RANK_CARD_IMAGE_COUNT_ERROR
    : null;
}

export function getRankCardRenderCacheKey(
  id: string,
  source: string,
  fill?: string,
  width?: number,
  height?: number,
): string {
  return JSON.stringify([id, source, fill ?? "", width ?? "", height ?? ""]);
}

// ── Level & XP Calculations ──────────────────────────────────────────────

/**
 * Returns the cumulative XP required to reach a specific level.
 * Level 0 = 0 XP
 * Level 1 = 100 XP
 * Level 2 = 255 XP (+155)
 * Level 3 = 475 XP (+220)
 * Level 4 = 780 XP (+305)
 * Formula: Cumulative sum of (5 * i^2 + 50 * i + 100) for i = 0..(level-1)
 */
export function getCumulativeXpForLevel(level: number): number {
  if (level <= 0) return 0;
  let total = 0;
  for (let i = 0; i < level; i++) {
    total += 5 * i * i + 50 * i + 100;
  }
  return total;
}

/**
 * Calculates user level from total lifetime XP.
 */
export function getLevelFromXp(xp: number): number {
  if (xp <= 0) return 0;
  let level = 0;
  let accumulated = 0;
  while (true) {
    const nextRequired = 5 * level * level + 50 * level + 100;
    if (accumulated + nextRequired > xp) {
      break;
    }
    accumulated += nextRequired;
    level++;
  }
  return level;
}

export interface XpProgressInfo {
  level: number;
  totalXp: number;
  currentLevelBaseXp: number;
  nextLevelBaseXp: number;
  xpInCurrentLevel: number;
  xpNeededForNextLevel: number;
  progressPercent: number;
}

/**
 * Computes full level progress metadata for a given XP value.
 */
export function getXpProgress(totalXp: number): XpProgressInfo {
  const safeXp = Math.max(0, totalXp || 0);
  const level = getLevelFromXp(safeXp);
  const currentLevelBaseXp = getCumulativeXpForLevel(level);
  const nextLevelBaseXp = getCumulativeXpForLevel(level + 1);
  const xpNeededForNextLevel = Math.max(1, nextLevelBaseXp - currentLevelBaseXp);
  const xpInCurrentLevel = Math.max(0, safeXp - currentLevelBaseXp);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((xpInCurrentLevel / xpNeededForNextLevel) * 100)),
  );

  return {
    level,
    totalXp: safeXp,
    currentLevelBaseXp,
    nextLevelBaseXp,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    progressPercent,
  };
}

export interface RankCardElement {
  id: string;
  type:
    | "text"
    | "image"
    | "rect"
    | "circle"
    | "avatar"
    | "triangle"
    | "star"
    | "line"
    | "progressbar";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fill?: string;
  align?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  opacity?: number;
  src?: string;
  radius?: number;
  borderColor?: string;
  borderWidth?: number;
  rotation?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  scaleX?: number;
  scaleY?: number;
  numPoints?: number;
  innerRadius?: number;
  outerRadius?: number;
  points?: number[];
  arrow?: boolean;
  avatarShape?: "circle" | "square";
  avatarCornerRadius?: number;
  trackColor?: string;
  trackBorderColor?: string;
  trackBorderWidth?: number;
}

export interface RankCardTemplate {
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundImage?: string;
  elements: RankCardElement[];
}

export const DEFAULT_RANK_CARD_TEMPLATE: RankCardTemplate = {
  canvasWidth: 934,
  canvasHeight: 282,
  backgroundColor: "#0b0f19",
  elements: [
    {
      id: "card-bg",
      type: "rect",
      x: 10,
      y: 10,
      width: 914,
      height: 262,
      fill: "linear-gradient(135deg, #111827, #1e1b4b, #0f172a)",
      cornerRadius: 18,
      stroke: "rgba(255, 255, 255, 0.08)",
      strokeWidth: 1.5,
      opacity: 0.95,
      shadowColor: "rgba(0, 0, 0, 0.6)",
      shadowBlur: 20,
    },
    {
      id: "accent-bar",
      type: "rect",
      x: 10,
      y: 10,
      width: 914,
      height: 5,
      fill: "linear-gradient(90deg, #6366f1, #a855f7, #ec4899)",
      cornerRadius: 2,
    },
    {
      id: "avatar",
      type: "avatar",
      x: 100,
      y: 141,
      radius: 56,
      borderColor: "#818cf8",
      borderWidth: 3,
      shadowColor: "rgba(99, 102, 241, 0.4)",
      shadowBlur: 15,
    },
    {
      id: "name-text",
      type: "text",
      x: 195,
      y: 105,
      text: "{displayName}",
      fontSize: 28,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#ffffff",
      align: "left",
    },
    {
      id: "user-tag",
      type: "text",
      x: 195,
      y: 140,
      text: "@{username}",
      fontSize: 15,
      fontFamily: "sans-serif",
      fill: "#94a3b8",
      align: "left",
    },
    {
      id: "rank-label",
      type: "text",
      x: 690,
      y: 85,
      text: "RANK",
      fontSize: 14,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#a855f7",
      align: "right",
    },
    {
      id: "rank-value",
      type: "text",
      x: 740,
      y: 83,
      text: "#{rank}",
      fontSize: 26,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#c084fc",
      align: "right",
    },
    {
      id: "level-label",
      type: "text",
      x: 820,
      y: 85,
      text: "LEVEL",
      fontSize: 14,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#6366f1",
      align: "right",
    },
    {
      id: "level-value",
      type: "text",
      x: 875,
      y: 83,
      text: "{level}",
      fontSize: 28,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#818cf8",
      align: "right",
    },
    {
      id: "xp-counter",
      type: "text",
      x: 875,
      y: 170,
      text: "{current_xp} / {next_xp} XP",
      fontSize: 14,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#94a3b8",
      align: "right",
    },
    {
      id: "xp-progress",
      type: "progressbar",
      x: 195,
      y: 195,
      width: 680,
      height: 18,
      cornerRadius: 9,
      trackColor: "rgba(255, 255, 255, 0.08)",
      fill: "linear-gradient(90deg, #6366f1, #a855f7, #ec4899)",
      shadowColor: "rgba(168, 85, 247, 0.35)",
      shadowBlur: 10,
    },
  ],
};
