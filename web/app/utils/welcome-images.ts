const WELCOME_IMAGE_PROXY_PREFIX = "/api/welcome/bg/welcome/";
const MAX_WELCOME_IMAGE_TINT_PIXELS = 4_194_304;

function isWelcomeImageProxySource(source: unknown): source is string {
  return (
    typeof source === "string" &&
    source.startsWith(WELCOME_IMAGE_PROXY_PREFIX)
  );
}

export function isTintableWelcomeSvgSource(source: unknown): source is string {
  return isWelcomeImageProxySource(source) && source.endsWith(".svg");
}

export function getWelcomeImageTintRasterSize(
  intrinsicWidth: number,
  intrinsicHeight: number,
  renderedWidth: number,
  renderedHeight: number,
): { width: number; height: number } {
  const width = Math.max(
    1,
    Math.ceil(Number.isFinite(renderedWidth) && renderedWidth > 0
      ? renderedWidth
      : intrinsicWidth || 1),
  );
  const height = Math.max(
    1,
    Math.ceil(Number.isFinite(renderedHeight) && renderedHeight > 0
      ? renderedHeight
      : intrinsicHeight || 1),
  );
  const scale = Math.min(1, Math.sqrt(MAX_WELCOME_IMAGE_TINT_PIXELS / (width * height)));

  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function getWelcomeImageRenderCacheKey(
  id: string,
  source: string,
  fill?: string,
): string {
  return JSON.stringify([id, source, fill ?? ""]);
}
