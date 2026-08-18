import { createCanvas } from "@napi-rs/canvas";
import {
  getRankCardRenderCacheKey,
  isTintableRankCardSvgSource,
} from "@modus/db/rank-cards";

interface RankCardImageRenderElement {
  id: string;
  src: string;
  fill?: string;
  width?: number;
  height?: number;
}

interface RankCardImageCacheEntry {
  key: string;
  image: any | null;
}

export type RankCardImageRenderCache = Map<string, RankCardImageCacheEntry>;

export function createTintedRankCardImage(
  image: any,
  source: string,
  fill?: string,
  renderedWidth?: number,
  renderedHeight?: number,
): any {
  if (!fill || !isTintableRankCardSvgSource(source)) return image;

  const width = Math.min(2048, Math.max(1, Math.ceil(renderedWidth || image.width || 1)));
  const height = Math.min(2048, Math.max(1, Math.ceil(renderedHeight || image.height || 1)));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = fill;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "source-over";
  return canvas;
}

export async function getCachedRankCardImage(
  element: RankCardImageRenderElement,
  cache: RankCardImageRenderCache,
  loadImage: (source: string) => Promise<any | null>,
): Promise<any | null> {
  const key = getRankCardRenderCacheKey(
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
    ? createTintedRankCardImage(
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
