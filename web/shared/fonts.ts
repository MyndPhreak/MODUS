/**
 * Google Fonts definitions for the Welcome Image Editor.
 *
 * Shared between:
 *   - Client (editor preview via WebFont CSS injection)
 *   - Server (render API via @napi-rs/canvas + TTF download)
 *
 * Fonts marked `featured: true` appear in the "Featured" group at
 * the top of the font picker. All others are grouped by `category`.
 */

export interface FontDefinition {
  /** Google Fonts family name (exact match) */
  family: string;
  /** Visual category for grouping */
  category: "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
  /** Weights to load (subset of what Google offers) */
  weights: number[];
  /** Shows in the "Featured" group at top of picker */
  featured?: boolean;
}

/**
 * System fallback fonts — always available, no download needed.
 */
export const SYSTEM_FONTS: FontDefinition[] = [
  { family: "sans-serif", category: "sans-serif", weights: [400, 700] },
  { family: "serif", category: "serif", weights: [400, 700] },
  { family: "monospace", category: "monospace", weights: [400, 700] },
];

/**
 * Curated Google Fonts list.
 * Add new fonts here — they become instantly available in the editor
 * and are lazy-downloaded on the render server when first used.
 */
export const GOOGLE_FONTS: FontDefinition[] = [
  // ── Featured (top picks) ───────────────────────────────────────
  { family: "Inter", category: "sans-serif", weights: [400, 600, 700, 900], featured: true },
  { family: "Montserrat", category: "sans-serif", weights: [400, 600, 700, 900], featured: true },
  { family: "Poppins", category: "sans-serif", weights: [400, 600, 700, 900], featured: true },
  { family: "Roboto", category: "sans-serif", weights: [400, 700, 900], featured: true },
  { family: "Bebas Neue", category: "display", weights: [400], featured: true },
  { family: "Orbitron", category: "sans-serif", weights: [400, 700, 900], featured: true },
  { family: "Bangers", category: "display", weights: [400], featured: true },
  { family: "Permanent Marker", category: "handwriting", weights: [400], featured: true },

  // ── Sans-Serif ─────────────────────────────────────────────────
  { family: "Open Sans", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Lato", category: "sans-serif", weights: [400, 700, 900] },
  { family: "Nunito", category: "sans-serif", weights: [400, 700, 900] },
  { family: "Raleway", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Outfit", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Rubik", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Nunito Sans", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Work Sans", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Quicksand", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Exo 2", category: "sans-serif", weights: [400, 600, 700, 900] },
  { family: "Kanit", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Josefin Sans", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Barlow", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Barlow Condensed", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Oswald", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Anton", category: "sans-serif", weights: [400] },
  { family: "Fjalla One", category: "sans-serif", weights: [400] },
  { family: "Teko", category: "sans-serif", weights: [400, 600, 700] },
  { family: "Archivo Black", category: "sans-serif", weights: [400] },

  // ── Serif ──────────────────────────────────────────────────────
  { family: "Playfair Display", category: "serif", weights: [400, 700, 900] },
  { family: "Merriweather", category: "serif", weights: [400, 700, 900] },
  { family: "Cinzel", category: "serif", weights: [400, 700, 900] },
  { family: "Cinzel Decorative", category: "serif", weights: [400, 700, 900] },
  { family: "Lora", category: "serif", weights: [400, 600, 700] },
  { family: "Cormorant Garamond", category: "serif", weights: [400, 600, 700] },
  { family: "EB Garamond", category: "serif", weights: [400, 600, 700] },
  { family: "Spectral", category: "serif", weights: [400, 600, 700] },

  // ── Display ────────────────────────────────────────────────────
  { family: "Righteous", category: "display", weights: [400] },
  { family: "Press Start 2P", category: "display", weights: [400] },
  { family: "Audiowide", category: "display", weights: [400] },
  { family: "Titan One", category: "display", weights: [400] },
  { family: "Bungee", category: "display", weights: [400] },
  { family: "Bungee Shade", category: "display", weights: [400] },
  { family: "Black Ops One", category: "display", weights: [400] },
  { family: "Fredoka One", category: "display", weights: [400] },
  { family: "Lilita One", category: "display", weights: [400] },
  { family: "Russo One", category: "display", weights: [400] },
  { family: "Passion One", category: "display", weights: [400, 700, 900] },
  { family: "Bungee Inline", category: "display", weights: [400] },
  { family: "Rampart One", category: "display", weights: [400] },
  { family: "Dela Gothic One", category: "display", weights: [400] },
  { family: "Silkscreen", category: "display", weights: [400, 700] },
  { family: "Pixelify Sans", category: "display", weights: [400, 600, 700] },

  // ── Handwriting ────────────────────────────────────────────────
  { family: "Pacifico", category: "handwriting", weights: [400] },
  { family: "Dancing Script", category: "handwriting", weights: [400, 700] },
  { family: "Caveat", category: "handwriting", weights: [400, 700] },
  { family: "Satisfy", category: "handwriting", weights: [400] },
  { family: "Great Vibes", category: "handwriting", weights: [400] },
  { family: "Sacramento", category: "handwriting", weights: [400] },
  { family: "Kalam", category: "handwriting", weights: [400, 700] },

  // ── Monospace ──────────────────────────────────────────────────
  { family: "Source Code Pro", category: "monospace", weights: [400, 600, 700] },
  { family: "JetBrains Mono", category: "monospace", weights: [400, 600, 700] },
  { family: "Fira Code", category: "monospace", weights: [400, 600, 700] },
  { family: "Space Mono", category: "monospace", weights: [400, 700] },
];

/** Combined list: system fonts + Google Fonts */
export const ALL_FONTS = [...SYSTEM_FONTS, ...GOOGLE_FONTS];

/**
 * Check if a font family is a system font (no download needed).
 */
export function isSystemFont(family: string): boolean {
  return SYSTEM_FONTS.some((f) => f.family === family);
}

/**
 * Find a font definition by family name.
 */
export function findFont(family: string): FontDefinition | undefined {
  return ALL_FONTS.find((f) => f.family === family);
}

/**
 * Build a Google Fonts CSS URL for a given font.
 * Works for both browser <link> loading and server-side TTF extraction.
 */
export function googleFontsCssUrl(family: string, weights: number[] = [400, 700]): string {
  const weightStr = weights.join(";");
  const encodedFamily = encodeURIComponent(family);
  return `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weightStr}&display=swap`;
}
