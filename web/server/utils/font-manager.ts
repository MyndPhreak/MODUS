/**
 * Server-side Google Fonts manager.
 *
 * Downloads and caches .ttf files on demand, then registers
 * them with @napi-rs/canvas GlobalFonts for server-side rendering.
 *
 * Font files are stored in `web/data/fonts/<family>-<weight>.ttf`.
 */
import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isSystemFont, findFont, type FontDefinition } from "#shared/fonts";

const FONTS_DIR = join(process.cwd(), "data", "fonts");
const registeredFonts = new Set<string>();

/**
 * Ensure the font cache directory exists.
 */
function ensureFontsDir(): void {
  if (!existsSync(FONTS_DIR)) {
    mkdirSync(FONTS_DIR, { recursive: true });
  }
}

/**
 * Generate a safe filename for caching.
 */
function fontFileName(family: string, weight: number): string {
  const safe = family.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  return `${safe}-${weight}.ttf`;
}

/**
 * Extract TTF download URLs from Google Fonts CSS response.
 *
 * Google Fonts CSS2 API returns different formats depending on the
 * User-Agent header. We request with a UA that triggers .ttf URLs.
 */
async function extractTtfUrls(
  family: string,
  weights: number[],
): Promise<{ weight: number; url: string }[]> {
  const weightStr = weights.join(";");
  const encodedFamily = encodeURIComponent(family);
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weightStr}&display=swap`;

  // Use a User-Agent that triggers TTF format (not woff2)
  const response = await fetch(cssUrl, {
    headers: {
      // Older IE UA to get .ttf instead of .woff2
      "User-Agent":
        "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Fonts CSS for "${family}": ${response.status}`,
    );
  }

  const css = await response.text();

  // Parse @font-face blocks to extract weight and URL
  const results: { weight: number; url: string }[] = [];
  const blockRegex = /@font-face\s*\{([^}]+)\}/g;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(css)) !== null) {
    const block = blockMatch[1];

    // Extract font-weight
    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    const weight = weightMatch ? parseInt(weightMatch[1]) : 400;

    // Extract URL (prefer .ttf)
    const urlMatch = block.match(/url\(([^)]+\.ttf[^)]*)\)/);
    if (urlMatch) {
      results.push({ weight, url: urlMatch[1].replace(/['"]/g, "") });
    }
  }

  return results;
}

/**
 * Download a single font file and cache it locally.
 */
async function downloadFont(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download font from ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(destPath, buffer);
}

/**
 * Register a cached font file with @napi-rs/canvas GlobalFonts.
 */
function registerFont(family: string, filePath: string): void {
  const key = filePath;
  if (registeredFonts.has(key)) return;

  GlobalFonts.registerFromPath(filePath, family);
  registeredFonts.add(key);
}

/**
 * Ensure a Google Font is available for rendering.
 *
 * Downloads the .ttf files if not already cached, then registers
 * them with GlobalFonts. No-op for system fonts.
 *
 * @param family - The Google Font family name (e.g., "Montserrat")
 * @returns true if the font is ready to use
 */
export async function ensureGoogleFont(family: string): Promise<boolean> {
  // System fonts are always available
  if (isSystemFont(family)) return true;

  ensureFontsDir();

  // Determine which weights to fetch
  const fontDef = findFont(family);
  const weights = fontDef?.weights ?? [400, 700];

  // Check if all weight files are already cached
  const missingWeights: number[] = [];
  for (const w of weights) {
    const fileName = fontFileName(family, w);
    const filePath = join(FONTS_DIR, fileName);
    if (existsSync(filePath)) {
      // Already cached — just register if not already
      registerFont(family, filePath);
    } else {
      missingWeights.push(w);
    }
  }

  if (missingWeights.length === 0) return true;

  // Download missing weights
  try {
    console.log(
      `[FontManager] Downloading "${family}" weights: ${missingWeights.join(", ")}`,
    );
    const ttfUrls = await extractTtfUrls(family, missingWeights);

    for (const { weight, url } of ttfUrls) {
      const fileName = fontFileName(family, weight);
      const filePath = join(FONTS_DIR, fileName);

      await downloadFont(url, filePath);
      registerFont(family, filePath);
      console.log(`[FontManager] Cached: ${fileName}`);
    }

    return true;
  } catch (err) {
    console.error(`[FontManager] Failed to load font "${family}":`, err);
    return false;
  }
}

/**
 * Ensure all fonts referenced in a template are available.
 * Extracts unique fontFamily values from elements and loads them.
 */
export async function ensureTemplateFonts(
  elements: { fontFamily?: string }[],
): Promise<void> {
  const families = new Set<string>();
  for (const el of elements) {
    if (el.fontFamily && !isSystemFont(el.fontFamily)) {
      families.add(el.fontFamily);
    }
  }

  await Promise.all([...families].map((f) => ensureGoogleFont(f)));
}

/**
 * Register any pre-cached fonts from the data/fonts directory.
 * Call this at server startup to avoid first-request latency.
 */
export function registerCachedFonts(): void {
  ensureFontsDir();

  const files = readdirSync(FONTS_DIR).filter((f) => f.endsWith(".ttf"));
  for (const file of files) {
    // Extract family name from filename: "Montserrat-700.ttf" → "Montserrat"
    const family = file.replace(/-\d+\.ttf$/, "").replace(/_/g, " ");
    const filePath = join(FONTS_DIR, file);
    registerFont(family, filePath);
  }

  if (files.length > 0) {
    console.log(`[FontManager] Registered ${files.length} cached font files`);
  }
}

// Auto-register cached fonts when this module is first imported
registerCachedFonts();
