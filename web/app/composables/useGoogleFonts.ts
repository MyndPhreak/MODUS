/**
 * Client-side Google Fonts composable.
 *
 * Dynamically loads Google Font CSS into the page <head> for
 * Konva preview rendering. Fonts are loaded on-demand and cached
 * in a reactive Set to avoid duplicate <link> injections.
 */
import { ref } from "vue";
import {
  GOOGLE_FONTS,
  SYSTEM_FONTS,
  isSystemFont,
  googleFontsCssUrl,
  type FontDefinition,
} from "#shared/fonts";

// ── Module-level cache (persists across component remounts) ──────

const loadedFonts = new Set<string>();
const loadingFonts = ref(new Set<string>());

// ── Font Groups for the picker ───────────────────────────────────

export interface FontGroup {
  label: string;
  fonts: FontDefinition[];
}

function buildFontGroups(): FontGroup[] {
  const featured = GOOGLE_FONTS.filter((f) => f.featured);
  const sansSerif = GOOGLE_FONTS.filter(
    (f) => f.category === "sans-serif" && !f.featured,
  );
  const serif = GOOGLE_FONTS.filter(
    (f) => f.category === "serif" && !f.featured,
  );
  const display = GOOGLE_FONTS.filter(
    (f) => f.category === "display" && !f.featured,
  );
  const handwriting = GOOGLE_FONTS.filter(
    (f) => f.category === "handwriting" && !f.featured,
  );
  const monospace = GOOGLE_FONTS.filter(
    (f) => f.category === "monospace" && !f.featured,
  );

  return [
    { label: "System", fonts: SYSTEM_FONTS },
    { label: "Featured", fonts: featured },
    { label: "Sans-Serif", fonts: sansSerif },
    { label: "Serif", fonts: serif },
    { label: "Display", fonts: display },
    { label: "Handwriting", fonts: handwriting },
    { label: "Monospace", fonts: monospace },
  ].filter((g) => g.fonts.length > 0);
}

// ── Composable ───────────────────────────────────────────────────

export function useGoogleFonts() {
  const fontGroups = buildFontGroups();

  /**
   * Load a Google Font and resolve once the browser confirms it is
   * actually usable — not just that the stylesheet request completed.
   * No-op for system fonts or already-loaded fonts. Never rejects.
   */
  async function loadFont(family: string): Promise<void> {
    if (isSystemFont(family)) return;
    if (loadedFonts.has(family)) return;

    const fontDef = GOOGLE_FONTS.find((f) => f.family === family);
    const weights = fontDef?.weights ?? [400, 700];

    if (!loadingFonts.value.has(family)) {
      loadingFonts.value.add(family);

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = googleFontsCssUrl(family, weights);
      link.dataset.googleFont = family;
      document.head.appendChild(link);
    }

    try {
      await Promise.all(
        weights.map((weight) =>
          document.fonts.load(`${weight} 16px "${family}"`),
        ),
      );
      loadedFonts.add(family);
    } catch (err) {
      console.warn(`[GoogleFonts] Failed to load font: ${family}`, err);
    } finally {
      loadingFonts.value.delete(family);
    }
  }

  /**
   * Load all fonts referenced in a template's elements, resolving once
   * every one of them is actually ready to draw.
   */
  async function loadTemplateFonts(
    elements: { fontFamily?: string }[],
  ): Promise<void> {
    const families = new Set<string>();
    for (const el of elements) {
      if (el.fontFamily) families.add(el.fontFamily);
    }
    await Promise.all(Array.from(families, loadFont));
  }

  return {
    fontGroups,
    loadFont,
    loadTemplateFonts,
    loadingFonts,
    loadedFonts,
  };
}
