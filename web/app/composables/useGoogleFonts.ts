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
   * Load a Google Font's CSS into the page <head>.
   * No-op for system fonts or already-loaded fonts.
   */
  function loadFont(family: string): void {
    if (isSystemFont(family)) return;
    if (loadedFonts.has(family)) return;
    if (loadingFonts.value.has(family)) return;

    // Find font definition to get weights
    const fontDef = GOOGLE_FONTS.find((f) => f.family === family);
    const weights = fontDef?.weights ?? [400, 700];

    loadingFonts.value.add(family);

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = googleFontsCssUrl(family, weights);
    link.dataset.googleFont = family;

    link.onload = () => {
      loadedFonts.add(family);
      loadingFonts.value.delete(family);
    };

    link.onerror = () => {
      loadingFonts.value.delete(family);
      console.warn(`[GoogleFonts] Failed to load font: ${family}`);
    };

    document.head.appendChild(link);
  }

  /**
   * Load all fonts referenced in a template's elements.
   */
  function loadTemplateFonts(elements: { fontFamily?: string }[]): void {
    const families = new Set<string>();
    for (const el of elements) {
      if (el.fontFamily) families.add(el.fontFamily);
    }
    families.forEach(loadFont);
  }

  /**
   * Build flat list of font options for USelectMenu.
   * Groups are represented as separator items.
   */
  function buildFontItems(searchQuery?: string) {
    const items: { label: string; value: string; disabled?: boolean; separator?: boolean }[] = [];
    const query = searchQuery?.toLowerCase().trim();

    for (const group of fontGroups) {
      const filtered = query
        ? group.fonts.filter((f) =>
            f.family.toLowerCase().includes(query),
          )
        : group.fonts;

      if (filtered.length === 0) continue;

      // Group separator
      items.push({
        label: group.label,
        value: `__group_${group.label}`,
        disabled: true,
        separator: true,
      });

      for (const font of filtered) {
        items.push({ label: font.family, value: font.family });
      }
    }

    return items;
  }

  return {
    fontGroups,
    loadFont,
    loadTemplateFonts,
    buildFontItems,
    loadingFonts,
    loadedFonts,
  };
}
