export const WELCOME_IMAGE_PROXY_PREFIX = "/api/welcome/bg/welcome/";
export const MAX_WELCOME_IMAGE_LAYERS = 10;

export const WELCOME_IMAGE_SOURCE_ERROR =
  "Image elements must use an uploaded welcome image.";
export const WELCOME_IMAGE_COUNT_ERROR =
  "A welcome template can contain up to 10 images.";

interface WelcomeImageElementLike {
  type?: unknown;
  src?: unknown;
}

export function isWelcomeImageProxySource(
  source: unknown,
): source is string {
  return (
    typeof source === "string" &&
    source.startsWith(WELCOME_IMAGE_PROXY_PREFIX)
  );
}

export function isTintableWelcomeSvgSource(source: unknown): source is string {
  return isWelcomeImageProxySource(source) && source.endsWith(".svg");
}

export function validateWelcomeImageElements(elements: unknown): string | null {
  if (!Array.isArray(elements)) return null;

  let imageCount = 0;
  for (const element of elements as WelcomeImageElementLike[]) {
    if (element?.type !== "image") continue;
    imageCount += 1;
    if (!isWelcomeImageProxySource(element.src)) {
      return WELCOME_IMAGE_SOURCE_ERROR;
    }
  }

  return imageCount > MAX_WELCOME_IMAGE_LAYERS
    ? WELCOME_IMAGE_COUNT_ERROR
    : null;
}

export function getWelcomeImageRenderCacheKey(
  id: string,
  source: string,
  fill?: string,
): string {
  return JSON.stringify([id, source, fill ?? ""]);
}
