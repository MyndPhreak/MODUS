export type GradientType = "linear" | "radial";

export function gradientType(fill?: string): GradientType | null {
  if (!fill) return null;
  if (fill.startsWith("linear-gradient")) return "linear";
  if (fill.startsWith("radial-gradient")) return "radial";
  return null;
}

export function parseGradientAngle(g: string): number {
  const m = g.match(/linear-gradient\(([^)]+)\)/);
  if (!m) return 135;
  const parsed = parseFloat((m[1] ?? "").split(",")[0]?.trim() ?? "");
  return Number.isNaN(parsed) ? 135 : parsed;
}

export function parseGradientColors(g: string): string[] {
  const m = g.match(/(?:linear|radial)-gradient\(([^)]+)\)/);
  if (!m) return ["#ffffff", "#000000"];
  let parts = (m[1] ?? "").split(",").map((s) => s.trim());
  if (g.startsWith("linear-gradient")) {
    parts = parts.slice(1);
  }
  return parts.length >= 2 ? parts : ["#ffffff", "#000000"];
}

export function parseGradientStops(g: string): (string | number)[] {
  const colors = parseGradientColors(g);
  const stops: (string | number)[] = [];
  colors.forEach((c, i) => {
    stops.push(i / Math.max(colors.length - 1, 1));
    stops.push(c);
  });
  return stops;
}

export function buildGradientString(
  type: GradientType,
  angleDeg: number,
  colors: string[],
): string {
  return type === "linear"
    ? `linear-gradient(${angleDeg}deg, ${colors.join(", ")})`
    : `radial-gradient(${colors.join(", ")})`;
}
