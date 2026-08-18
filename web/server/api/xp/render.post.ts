/**
 * POST /api/xp/render
 *
 * Server-side rank card renderer for the XP module.
 * Called by the bot when `/rank` is invoked — renders the custom card template
 * with member stats and returns a PNG buffer.
 *
 * Auth: X-Render-Key header must match NUXT_RENDER_API_KEY.
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ensureTemplateFonts } from "../../utils/font-manager";
import { getRepos } from "../../utils/db";
import { getR2, getR2Object } from "../../utils/r2";
import {
  getCachedRankCardImage,
  type RankCardImageRenderCache,
} from "../../utils/xp-image-renderer";
import {
  getXpProgress,
  DEFAULT_RANK_CARD_TEMPLATE,
  type RankCardTemplate,
  type RankCardElement,
} from "@modus/db/rank-cards";

// ── Types ────────────────────────────────────────────────────────────

export interface RankCardRenderRequest {
  guildId: string;
  avatarUrl: string;
  username: string;
  displayName: string;
  tag: string;
  serverName: string;
  level?: number;
  xp?: number;
  rank?: number;
  totalMembers?: number;
  messageCount?: number;
}

// ── Placeholder Resolution ───────────────────────────────────────────

function resolvePlaceholders(
  text: string,
  data: RankCardRenderRequest,
  progress: ReturnType<typeof getXpProgress>,
): string {
  const formatNum = (n: number) => n.toLocaleString("en-US");

  return text
    .replace(/\{username\}/g, data.username)
    .replace(/\{displayName\}/g, data.displayName || data.username)
    .replace(/\{displayname\}/g, data.displayName || data.username)
    .replace(/\{tag\}/g, data.tag)
    .replace(/\{server_name\}/g, data.serverName)
    .replace(/\{level\}/g, String(progress.level))
    .replace(/\{xp\}/g, formatNum(progress.totalXp))
    .replace(/\{current_xp\}/g, formatNum(progress.xpInCurrentLevel))
    .replace(/\{next_xp\}/g, formatNum(progress.xpNeededForNextLevel))
    .replace(/\{rank\}/g, String(data.rank ?? 1))
    .replace(/\{progress_percent\}/g, `${progress.progressPercent}%`)
    .replace(/\{member_count\}/g, formatNum(data.totalMembers ?? 0))
    .replace(/\{messages\}/g, formatNum(data.messageCount ?? 0));
}

// ── Background image loader ─────────────────────────────────────────────

const XP_PROXY_PREFIX = "/api/xp/bg/";
const WELCOME_PROXY_PREFIX = "/api/welcome/bg/";

async function loadCardBackground(reference: string): Promise<any | null> {
  const prefix = reference.startsWith(XP_PROXY_PREFIX)
    ? XP_PROXY_PREFIX
    : reference.startsWith(WELCOME_PROXY_PREFIX)
      ? WELCOME_PROXY_PREFIX
      : null;

  if (prefix && getR2()) {
    const key = reference.slice(prefix.length);
    try {
      const object = await getR2Object(key);
      if (!object) return null;
      return await loadImage(object.body);
    } catch (err) {
      console.warn("[XP Render] R2 background load failed, falling back to HTTP:", err);
    }
  }
  return loadImage(reference);
}

async function loadCardImageLayer(reference: string): Promise<any | null> {
  if (!reference.startsWith(XP_PROXY_PREFIX) || !getR2()) return null;
  const key = reference.slice(XP_PROXY_PREFIX.length);
  if (!key.startsWith("xp/")) return null;

  try {
    const object = await getR2Object(key);
    return object ? await loadImage(object.body) : null;
  } catch (err) {
    console.warn("[XP Render] R2 asset load failed:", err);
    return null;
  }
}

// ── Gradient Parsing ─────────────────────────────────────────────────

function parseGradient(
  ctx: any,
  gradientStr: string,
  x: number,
  y: number,
  width: number,
  height: number,
): any {
  const match = gradientStr.match(/linear-gradient\(([^)]+)\)/);
  const gradientContents = match?.[1];
  if (!gradientContents) return gradientStr;

  const parts = gradientContents.split(",").map((s: string) => s.trim());
  const angleDeg = parseFloat(parts[0] ?? "") || 0;
  const angleRad = (angleDeg * Math.PI) / 180;

  const cx = x + width / 2;
  const cy = y + height / 2;
  const x0 = cx - (Math.cos(angleRad) * width) / 2;
  const y0 = cy - (Math.sin(angleRad) * height) / 2;
  const x1 = cx + (Math.cos(angleRad) * width) / 2;
  const y1 = cy + (Math.sin(angleRad) * height) / 2;

  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  const colors = parts.slice(1);
  colors.forEach((color: string, i: number) => {
    gradient.addColorStop(i / Math.max(colors.length - 1, 1), color);
  });

  return gradient;
}

export function parseRadialGradient(
  ctx: any,
  gradientStr: string,
  cx: number,
  cy: number,
  r: number,
): any {
  const match = gradientStr.match(/radial-gradient\(([^)]+)\)/);
  const gradientContents = match?.[1];
  if (!gradientContents) return gradientStr;

  const colors = gradientContents.split(",").map((s: string) => s.trim());
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  colors.forEach((color: string, i: number) => {
    gradient.addColorStop(i / Math.max(colors.length - 1, 1), color);
  });

  return gradient;
}

function resolveFillStyle(
  ctx: any,
  fillValue: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): any {
  if (fillValue.startsWith("linear-gradient")) {
    return parseGradient(
      ctx,
      fillValue,
      minX,
      minY,
      maxX - minX,
      maxY - minY,
    );
  }
  if (fillValue.startsWith("radial-gradient")) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const r = Math.max(maxX - minX, maxY - minY) / 2;
    return parseRadialGradient(ctx, fillValue, cx, cy, r);
  }
  return fillValue;
}

// ── Canvas Renderer ──────────────────────────────────────────────────

export async function renderRankCardImage(
  template: RankCardTemplate,
  data: RankCardRenderRequest,
): Promise<Buffer> {
  const { canvasWidth, canvasHeight } = template;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  const progress = getXpProgress(data.xp ?? 0);

  // Background color
  ctx.fillStyle = template.backgroundColor || "#0b0f19";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Background image
  if (template.backgroundImage) {
    try {
      const bgImage = await loadCardBackground(template.backgroundImage);
      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
      }
    } catch (err) {
      console.warn("[XP Render] Failed to load background image:", err);
    }
  }

  // Load avatar once
  let avatarImage: any = null;
  if (data.avatarUrl) {
    try {
      avatarImage = await loadImage(data.avatarUrl);
    } catch (err) {
      console.warn("[XP Render] Failed to load avatar:", err);
    }
  }

  const imageRenderCache: RankCardImageRenderCache = new Map();

  // Render elements in order
  for (const el of template.elements) {
    ctx.save();

    if (el.rotation) {
      ctx.translate(el.x, el.y);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-el.x, -el.y);
    }

    if (
      (el.scaleX !== undefined && el.scaleX !== 1) ||
      (el.scaleY !== undefined && el.scaleY !== 1)
    ) {
      ctx.translate(el.x, el.y);
      ctx.scale(el.scaleX ?? 1, el.scaleY ?? 1);
      ctx.translate(-el.x, -el.y);
    }

    if (el.opacity !== undefined && el.opacity < 1) {
      ctx.globalAlpha = el.opacity;
    }

    if (el.shadowColor) {
      ctx.shadowColor = el.shadowColor;
      ctx.shadowBlur = el.shadowBlur || 0;
      ctx.shadowOffsetX = el.shadowOffsetX || 0;
      ctx.shadowOffsetY = el.shadowOffsetY || 0;
    }

    switch (el.type) {
      case "rect": {
        const w = el.width || 100;
        const h = el.height || 100;
        const fillValue = el.fill || "#ffffff";

        ctx.fillStyle = resolveFillStyle(
          ctx,
          fillValue,
          el.x,
          el.y,
          el.x + w,
          el.y + h,
        );

        if (el.cornerRadius) {
          ctx.beginPath();
          ctx.roundRect(el.x, el.y, w, h, el.cornerRadius);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(el.x, el.y, w, h);
        }

        if (el.stroke) {
          ctx.strokeStyle = resolveFillStyle(
            ctx,
            el.stroke,
            el.x,
            el.y,
            el.x + w,
            el.y + h,
          );
          ctx.lineWidth = el.strokeWidth || 1;
          if (el.cornerRadius) {
            ctx.stroke();
          } else {
            ctx.strokeRect(el.x, el.y, w, h);
          }
        }
        break;
      }

      case "circle": {
        const radius = el.radius || 50;
        ctx.fillStyle = resolveFillStyle(
          ctx,
          el.fill || "#ffffff",
          el.x - radius,
          el.y - radius,
          el.x + radius,
          el.y + radius,
        );
        ctx.beginPath();
        ctx.arc(el.x, el.y, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();

        if (el.stroke) {
          ctx.strokeStyle = resolveFillStyle(
            ctx,
            el.stroke,
            el.x - radius,
            el.y - radius,
            el.x + radius,
            el.y + radius,
          );
          ctx.lineWidth = el.strokeWidth || 1;
          ctx.stroke();
        }
        break;
      }

      case "triangle": {
        const r = el.radius || 50;
        ctx.fillStyle = resolveFillStyle(
          ctx,
          el.fill || "#374151",
          el.x - r,
          el.y - r,
          el.x + r,
          el.y + r,
        );
        ctx.beginPath();
        for (let n = 0; n < 3; n++) {
          const angle = (n * 2 * Math.PI) / 3;
          const px = el.x + r * Math.sin(angle);
          const py = el.y - r * Math.cos(angle);
          if (n === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        if (el.stroke) {
          ctx.strokeStyle = resolveFillStyle(
            ctx,
            el.stroke,
            el.x - r,
            el.y - r,
            el.x + r,
            el.y + r,
          );
          ctx.lineWidth = el.strokeWidth || 1;
          ctx.stroke();
        }
        break;
      }

      case "star": {
        const numPoints = el.numPoints || 5;
        const innerRadius = el.innerRadius || 25;
        const outerRadius = el.outerRadius || 50;
        ctx.fillStyle = resolveFillStyle(
          ctx,
          el.fill || "#374151",
          el.x - outerRadius,
          el.y - outerRadius,
          el.x + outerRadius,
          el.y + outerRadius,
        );
        ctx.beginPath();
        for (let n = 0; n < numPoints * 2; n++) {
          const radius = n % 2 === 0 ? outerRadius : innerRadius;
          const angle = (n * Math.PI) / numPoints;
          const px = el.x + radius * Math.sin(angle);
          const py = el.y - radius * Math.cos(angle);
          if (n === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        if (el.stroke) {
          ctx.strokeStyle = resolveFillStyle(
            ctx,
            el.stroke,
            el.x - outerRadius,
            el.y - outerRadius,
            el.x + outerRadius,
            el.y + outerRadius,
          );
          ctx.lineWidth = el.strokeWidth || 1;
          ctx.stroke();
        }
        break;
      }

      case "line": {
        const [dx1 = -60, dy1 = 0, dx2 = 60, dy2 = 0] = el.points || [];
        const x1 = el.x + dx1;
        const y1 = el.y + dy1;
        const x2 = el.x + dx2;
        const y2 = el.y + dy2;

        ctx.strokeStyle = el.stroke || "#6366f1";
        ctx.lineWidth = el.strokeWidth || 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        if (el.arrow) {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLength = 10;
          const headWidth = 10;
          ctx.fillStyle = el.stroke || "#6366f1";
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(
            x2 - headLength * Math.cos(angle - Math.PI / 6),
            y2 - headLength * Math.sin(angle - Math.PI / 6),
          );
          ctx.lineTo(
            x2 - headWidth * Math.cos(angle + Math.PI / 6),
            y2 - headWidth * Math.sin(angle + Math.PI / 6),
          );
          ctx.closePath();
          ctx.fill();
        }
        break;
      }

      case "progressbar": {
        const w = el.width || 500;
        const h = el.height || 16;
        const r = Math.min(el.cornerRadius ?? 8, h / 2);
        const trackColor = el.trackColor || "rgba(255, 255, 255, 0.1)";

        // 1. Draw track
        ctx.fillStyle = trackColor;
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, w, h, r);
        ctx.closePath();
        ctx.fill();

        if (el.trackBorderWidth && el.trackBorderColor) {
          ctx.strokeStyle = el.trackBorderColor;
          ctx.lineWidth = el.trackBorderWidth;
          ctx.stroke();
        }

        // 2. Draw fill
        const fillWidth = Math.max(0, Math.min(w, (progress.progressPercent / 100) * w));
        if (fillWidth > 0) {
          ctx.fillStyle = resolveFillStyle(
            ctx,
            el.fill || "linear-gradient(90deg, #6366f1, #a855f7)",
            el.x,
            el.y,
            el.x + w,
            el.y + h,
          );

          ctx.beginPath();
          ctx.roundRect(el.x, el.y, fillWidth, h, r);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }

      case "text": {
        const resolvedText = resolvePlaceholders(el.text || "", data, progress);
        const style = el.fontStyle || "";
        const size = el.fontSize || 24;
        const family = el.fontFamily || "sans-serif";
        ctx.font = `${style} ${size}px "${family}"`.trim();
        ctx.fillStyle = el.fill || "#ffffff";
        ctx.textAlign = (el.align as CanvasTextAlign) || "left";
        ctx.textBaseline = "middle";
        ctx.fillText(resolvedText, el.x, el.y);

        if (el.stroke) {
          ctx.strokeStyle = el.stroke;
          ctx.lineWidth = el.strokeWidth || 1;
          ctx.strokeText(resolvedText, el.x, el.y);
        }
        break;
      }

      case "avatar": {
        if (!avatarImage) break;
        const r = el.radius || 50;
        const isSquare = el.avatarShape === "square";
        const cr = Math.max(0, el.avatarCornerRadius ?? 0);

        // Border
        if (el.borderWidth && el.borderColor) {
          ctx.fillStyle = el.borderColor;
          ctx.beginPath();
          if (isSquare) {
            ctx.roundRect(
              el.x - r - el.borderWidth,
              el.y - r - el.borderWidth,
              (r + el.borderWidth) * 2,
              (r + el.borderWidth) * 2,
              cr,
            );
          } else {
            ctx.arc(el.x, el.y, r + el.borderWidth, 0, Math.PI * 2);
          }
          ctx.closePath();
          ctx.fill();
        }

        // Clip + draw avatar
        ctx.beginPath();
        if (isSquare) {
          ctx.roundRect(el.x - r, el.y - r, r * 2, r * 2, cr);
        } else {
          ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
        }
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImage, el.x - r, el.y - r, r * 2, r * 2);
        break;
      }

      case "image": {
        if (!el.src) break;
        const img = await getCachedRankCardImage(
          { id: el.id, src: el.src, fill: el.fill, width: el.width, height: el.height },
          imageRenderCache,
          loadCardImageLayer,
        );
        if (img) {
          ctx.drawImage(img, el.x, el.y, el.width || img.width, el.height || img.height);
        }
        break;
      }

      default:
        break;
    }

    ctx.restore();
  }

  const pngData = await canvas.encode("png");
  return Buffer.from(pngData);
}

// ── API Handler ──────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  const renderKey = config.renderApiKey as string;
  if (!renderKey) {
    console.error("[XP Render] NUXT_RENDER_API_KEY is not configured.");
    throw createError({
      statusCode: 503,
      statusMessage: "Render endpoint is not configured.",
    });
  }

  const providedKey = getHeader(event, "x-render-key");
  if (providedKey !== renderKey) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const body = (await readBody(event)) as RankCardRenderRequest;
  if (!body?.guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guildId in request body",
    });
  }

  // Load template from DB
  let template: RankCardTemplate = DEFAULT_RANK_CARD_TEMPLATE;
  const repos = getRepos();
  if (repos) {
    try {
      const settings = await repos.guildConfigs.getModuleSettings(
        body.guildId,
        "xp",
      );
      if (settings?.cardTemplate?.elements && settings.cardTemplate.elements.length > 0) {
        template = settings.cardTemplate;
      }
    } catch (err) {
      console.error("[XP Render] Postgres template load failed:", err);
    }
  }

  try {
    await ensureTemplateFonts(template.elements as any);
  } catch (err) {
    console.warn("[XP Render] Font loading warning:", err);
  }

  try {
    const imageBuffer = await renderRankCardImage(template, body);
    setResponseHeader(event, "Content-Type", "image/png");
    setResponseHeader(event, "Content-Length", imageBuffer.length);
    setResponseHeader(event, "Cache-Control", "no-store");
    return imageBuffer;
  } catch (err) {
    console.error("[XP Render] Render failed:", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to render rank card",
    });
  }
});
