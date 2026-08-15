/**
 * POST /api/welcome/render
 *
 * Server-side welcome image renderer.
 * Called by the bot when a new member joins — renders the template
 * with the member's data and returns a PNG buffer.
 *
 * Auth: X-Render-Key header must match NUXT_RENDER_API_KEY.
 *
 * Body: {
 *   guildId: string,
 *   avatarUrl: string,
 *   username: string,
 *   displayName: string,
 *   tag: string,
 *   serverName: string,
 *   memberCount: number
 * }
 *
 * Response: PNG image buffer (Content-Type: image/png)
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ensureTemplateFonts } from "../../utils/font-manager";
import { getRepos } from "../../utils/db";
import { getR2, getR2Object } from "../../utils/r2";
import {
  getCachedWelcomeImage,
  type WelcomeImageRenderCache,
} from "../../utils/welcome-image-renderer";

// ── Types ────────────────────────────────────────────────────────────

interface RenderRequest {
  guildId: string;
  avatarUrl: string;
  username: string;
  displayName: string;
  tag: string;
  serverName: string;
  memberCount: number;
}

interface TemplateElement {
  id: string;
  type:
    | "text"
    | "image"
    | "rect"
    | "circle"
    | "avatar"
    | "triangle"
    | "star"
    | "line";
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
}

interface WelcomeTemplate {
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundImage?: string;
  elements: TemplateElement[];
  channelId?: string;
}

// ── Placeholder Resolution ───────────────────────────────────────────

function resolvePlaceholders(text: string, data: RenderRequest): string {
  return text
    .replace(/\{username\}/g, data.username)
    .replace(/\{displayname\}/g, data.displayName)
    .replace(/\{tag\}/g, data.tag)
    .replace(/\{server_name\}/g, data.serverName)
    .replace(/\{member_count\}/g, String(data.memberCount));
}

// ── Background image loader ─────────────────────────────────────────────
//
// Backgrounds in the new flow live in R2 and are referenced by the proxy
// path `/api/welcome/bg/<key>`. When we see that shape we skip the HTTP
// round-trip and read the object directly. Legacy templates (full Appwrite
// URLs) fall through to loadImage() which resolves them over HTTP.

const WELCOME_PROXY_PREFIX = "/api/welcome/bg/";

async function loadWelcomeBackground(reference: string): Promise<any | null> {
  if (reference.startsWith(WELCOME_PROXY_PREFIX) && getR2()) {
    const key = reference.slice(WELCOME_PROXY_PREFIX.length);
    try {
      const object = await getR2Object(key);
      if (!object) return null;
      return await loadImage(object.body);
    } catch (err) {
      console.warn(
        "[Welcome Render] R2 background load failed, falling back to URL:",
        err,
      );
      // Fall through to the HTTP path as a safety net.
    }
  }
  return loadImage(reference);
}

async function loadWelcomeImageLayer(reference: string): Promise<any | null> {
  if (!reference.startsWith(WELCOME_PROXY_PREFIX) || !getR2()) return null;
  const key = reference.slice(WELCOME_PROXY_PREFIX.length);
  if (!key.startsWith("welcome/")) return null;

  try {
    const object = await getR2Object(key);
    return object ? await loadImage(object.body) : null;
  } catch (err) {
    console.warn("[Welcome Render] R2 asset load failed:", err);
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
  if (!match) return gradientStr;

  const parts = match[1].split(",").map((s: string) => s.trim());
  const angleDeg = parseFloat(parts[0]) || 0;
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

function parseRadialGradient(
  ctx: any,
  gradientStr: string,
  cx: number,
  cy: number,
  r: number,
): any {
  const match = gradientStr.match(/radial-gradient\(([^)]+)\)/);
  if (!match) return gradientStr;

  const colors = match[1]!.split(",").map((s: string) => s.trim());
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

// ── Image Renderer ───────────────────────────────────────────────────

async function renderWelcomeImage(
  template: WelcomeTemplate,
  data: RenderRequest,
): Promise<Buffer> {
  const { canvasWidth, canvasHeight } = template;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Background color
  ctx.fillStyle = template.backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Background image
  if (template.backgroundImage) {
    try {
      const bgImage = await loadWelcomeBackground(template.backgroundImage);
      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
      }
    } catch (err) {
      console.warn("[Welcome Render] Failed to load background image:", err);
    }
  }

  // Load avatar once
  let avatarImage: any = null;
  if (data.avatarUrl) {
    try {
      avatarImage = await loadImage(data.avatarUrl);
    } catch (err) {
      console.warn("[Welcome Render] Failed to load avatar:", err);
    }
  }

  const imageRenderCache: WelcomeImageRenderCache = new Map();

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
          const r = el.cornerRadius;
          ctx.beginPath();
          ctx.moveTo(el.x + r, el.y);
          ctx.lineTo(el.x + w - r, el.y);
          ctx.quadraticCurveTo(el.x + w, el.y, el.x + w, el.y + r);
          ctx.lineTo(el.x + w, el.y + h - r);
          ctx.quadraticCurveTo(el.x + w, el.y + h, el.x + w - r, el.y + h);
          ctx.lineTo(el.x + r, el.y + h);
          ctx.quadraticCurveTo(el.x, el.y + h, el.x, el.y + h - r);
          ctx.lineTo(el.x, el.y + r);
          ctx.quadraticCurveTo(el.x, el.y, el.x + r, el.y);
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

        ctx.strokeStyle = el.stroke || "#e4e4e7";
        ctx.lineWidth = el.strokeWidth || 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        if (el.arrow) {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLength = 10;
          const headWidth = 10;
          ctx.fillStyle = el.stroke || "#e4e4e7";
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

      case "text": {
        const resolvedText = resolvePlaceholders(el.text || "", data);
        const style = el.fontStyle || "";
        const size = el.fontSize || 24;
        const family = el.fontFamily || "sans-serif";
        ctx.font = `${style} ${size}px "${family}"`.trim();
        ctx.fillStyle = el.fill || "#ffffff";
        ctx.textAlign = (el.align as CanvasTextAlign) || "center";
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
        const r = el.radius || 64;
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
        const img = await getCachedWelcomeImage(
          { id: el.id, src: el.src, fill: el.fill, width: el.width, height: el.height },
          imageRenderCache,
          loadWelcomeImageLayer,
        );
        if (!img) {
          console.warn("[Welcome Render] Failed to load element image:", el.src);
          break;
        }
        ctx.drawImage(img, el.x, el.y, el.width || img.width, el.height || img.height);
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

// ── Default Template ─────────────────────────────────────────────────

const DEFAULT_TEMPLATE: WelcomeTemplate = {
  canvasWidth: 1024,
  canvasHeight: 500,
  backgroundColor: "#1a1a2e",
  elements: [
    {
      id: "bg-overlay",
      type: "rect",
      x: 0,
      y: 0,
      width: 1024,
      height: 500,
      fill: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
      opacity: 1,
    },
    {
      id: "decoration-top",
      type: "rect",
      x: 0,
      y: 0,
      width: 1024,
      height: 4,
      fill: "linear-gradient(90deg, #6366f1, #a78bfa, #c084fc)",
      opacity: 1,
    },
    {
      id: "avatar",
      type: "avatar",
      x: 512,
      y: 155,
      radius: 80,
      borderColor: "#a78bfa",
      borderWidth: 4,
    },
    {
      id: "welcome-label",
      type: "text",
      x: 512,
      y: 280,
      text: "WELCOME",
      fontSize: 44,
      fontFamily: "sans-serif",
      fontStyle: "bold",
      fill: "#ffffff",
      align: "center",
    },
    {
      id: "username-text",
      type: "text",
      x: 512,
      y: 340,
      text: "{username}",
      fontSize: 30,
      fontFamily: "sans-serif",
      fill: "#a78bfa",
      align: "center",
    },
    {
      id: "server-text",
      type: "text",
      x: 512,
      y: 395,
      text: "to {server_name}",
      fontSize: 20,
      fontFamily: "sans-serif",
      fill: "#9ca3af",
      align: "center",
    },
    {
      id: "member-count",
      type: "text",
      x: 512,
      y: 450,
      text: "Member #{member_count}",
      fontSize: 16,
      fontFamily: "sans-serif",
      fill: "#6b7280",
      align: "center",
    },
  ],
};

// ── API Handler ──────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // ── Auth ──
  // Fail closed: this renderer loads images from URLs found in the request
  // body and the guild's template, so it must never be callable without the
  // shared key. A missing key is a misconfiguration, not an open door.
  const renderKey = config.renderApiKey as string;
  if (!renderKey) {
    console.error(
      "[Welcome Render] NUXT_RENDER_API_KEY is not configured — refusing to render.",
    );
    throw createError({
      statusCode: 503,
      statusMessage: "Render endpoint is not configured.",
    });
  }
  const providedKey = getHeader(event, "x-render-key");
  if (providedKey !== renderKey) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  // ── Parse body ──
  const body = (await readBody(event)) as RenderRequest;
  if (!body?.guildId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guildId in request body",
    });
  }

  // ── Load template ────────────────────────────────────────────────────
  let template: WelcomeTemplate = DEFAULT_TEMPLATE;
  const repos = getRepos();
  if (!repos) {
    // Fall back to default template when Postgres isn't configured. The
    // endpoint still returns a rendered image so the bot's welcome event
    // doesn't fail on a misconfigured deployment.
    console.warn(
      "[Welcome Render] Database unavailable — rendering default template.",
    );
  } else {
    try {
      const settings = await repos.guildConfigs.getModuleSettings(
        body.guildId,
        "welcome",
      );
      if (settings && Object.keys(settings).length > 0) {
        template = { ...DEFAULT_TEMPLATE, ...settings };
      }
    } catch (err) {
      console.error("[Welcome Render] Postgres template load failed:", err);
    }
  }

  // ── Ensure fonts are downloaded/registered ──
  try {
    await ensureTemplateFonts(template.elements);
  } catch (err) {
    console.warn("[Welcome Render] Font loading warning:", err);
    // Continue with fallback fonts
  }

  // ── Render ──
  try {
    const imageBuffer = await renderWelcomeImage(template, body);

    // Return as PNG
    setResponseHeader(event, "Content-Type", "image/png");
    setResponseHeader(event, "Content-Length", String(imageBuffer.length));
    setResponseHeader(event, "Cache-Control", "no-store");
    return imageBuffer;
  } catch (err) {
    console.error("[Welcome Render] Render failed:", err);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to render welcome image",
    });
  }
});
