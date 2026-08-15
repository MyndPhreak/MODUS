const WELCOME_IMAGE_PROXY_PREFIX = "/api/welcome/bg/welcome/";

function isWelcomeImageProxySource(source: unknown): source is string {
  return (
    typeof source === "string" &&
    source.startsWith(WELCOME_IMAGE_PROXY_PREFIX)
  );
}

export function isTintableWelcomeSvgSource(source: unknown): source is string {
  return isWelcomeImageProxySource(source) && source.endsWith(".svg");
}

export function getWelcomeImageRenderCacheKey(
  id: string,
  source: string,
  fill?: string,
): string {
  return JSON.stringify([id, source, fill ?? ""]);
}
