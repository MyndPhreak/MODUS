import { createCanvas } from "@napi-rs/canvas";
import {
  getWelcomeImageRenderCacheKey,
  getWelcomeImageTintRasterSize,
  isTintableWelcomeSvgSource,
} from "@modus/db/welcome-images";

interface WelcomeImageRenderElement {
  id: string;
  src: string;
  fill?: string;
  width?: number;
  height?: number;
}

interface WelcomeImageCacheEntry {
  key: string;
  image: any | null;
}

export type WelcomeImageRenderCache = Map<string, WelcomeImageCacheEntry>;

export function createTintedWelcomeImage(
  image: any,
  source: string,
  fill?: string,
  renderedWidth?: number,
  renderedHeight?: number,
): any {
  if (!fill || !isTintableWelcomeSvgSource(source)) return image;

  const { width, height } = getWelcomeImageTintRasterSize(
    Number(image.width) || 1,
    Number(image.height) || 1,
    Number(renderedWidth) || Number(image.width) || 1,
    Number(renderedHeight) || Number(image.height) || 1,
  );
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = fill;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "source-over";
  return canvas;
}

export async function getCachedWelcomeImage(
  element: WelcomeImageRenderElement,
  cache: WelcomeImageRenderCache,
  loadImage: (source: string) => Promise<any | null>,
): Promise<any | null> {
  const key = getWelcomeImageRenderCacheKey(
    element.id,
    element.src,
    element.fill,
    element.width,
    element.height,
  );
  const cached = cache.get(element.id);
  if (cached?.key === key) return cached.image;

  const sourceImage = await loadImage(element.src);
  const image = sourceImage
    ? createTintedWelcomeImage(
        sourceImage,
        element.src,
        element.fill,
        element.width,
        element.height,
      )
    : null;
  cache.set(element.id, { key, image });
  return image;
}
