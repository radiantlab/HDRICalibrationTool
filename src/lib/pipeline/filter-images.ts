/**
 * Drops source frames that contribute nothing to the merge.
 *
 * Port of `filter_images` and `select_exposure_range` in
 * `src-tauri/src/pipeline/merge_exposures.rs`.
 *
 * A bracket usually runs past both ends of the useful range: the brightest
 * frames are clipped white inside the lens circle and the darkest are crushed
 * black. Those add nothing to the merge but cost a full decode each, so the
 * pipeline keeps the run from the last frame with no crushed pixels through to
 * the first with no clipped ones.
 *
 * Everything outside the lens circle is ignored, which matters: a fisheye
 * frame is mostly black surround, and counting it would make every frame look
 * shadow-clipped.
 */

/** A pixel darker than this in every channel counts as crushed. */
const BLACK_THRESHOLD = 27;
/** A pixel brighter than this in every channel counts as clipped. */
const WHITE_THRESHOLD = 228;

/** Rec. 601 luma, the weights the Rust implementation uses. */
const LUMA = { blue: 0.114, green: 0.587, red: 0.299 } as const;

export interface FrameStats {
  /**
   * Sum of luma over the masked pixels, divided by the full frame area.
   *
   * Not a mean over the mask -- the divisor is the whole frame, identical for
   * every frame in the set. It only has to be monotone in brightness, which is
   * all the sort needs.
   */
  brightnessScore: number;
  /** Position in the caller's list, so the selection can map back. */
  index: number;
  pixelsAbove: number;
  pixelsBelow: number;
}

/** Decodes an image path to RGBA pixels. */
export type DecodeImage = (path: string) => Promise<DecodedImage>;

/** Decoded pixels, RGBA, as `getImageData` or `ImageBitmap` would give them. */
export interface DecodedImage {
  height: number;
  rgba: Uint8ClampedArray;
  width: number;
}

export function circleMask(
  width: number,
  height: number,
  xcenter: number,
  ycenter: number,
  radius: number
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const rsquare = radius * radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - xcenter;
      const dy = y - ycenter;
      if (dx * dx + dy * dy <= rsquare) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

export function frameStats(
  image: DecodedImage,
  mask: Uint8Array,
  index: number
): FrameStats {
  let pixelsBelow = 0;
  let pixelsAbove = 0;
  let luma = 0;

  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 0) {
      continue;
    }
    const offset = i * 4;
    const red = image.rgba[offset] ?? 0;
    const green = image.rgba[offset + 1] ?? 0;
    const blue = image.rgba[offset + 2] ?? 0;

    luma += LUMA.red * red + LUMA.green * green + LUMA.blue * blue;

    // Every channel has to be past the threshold: a saturated red sky is not a
    // clipped highlight.
    if (
      red < BLACK_THRESHOLD &&
      green < BLACK_THRESHOLD &&
      blue < BLACK_THRESHOLD
    ) {
      pixelsBelow += 1;
    } else if (
      red > WHITE_THRESHOLD &&
      green > WHITE_THRESHOLD &&
      blue > WHITE_THRESHOLD
    ) {
      pixelsAbove += 1;
    }
  }

  return {
    brightnessScore: luma / (image.width * image.height),
    index,
    pixelsAbove,
    pixelsBelow,
  };
}

/**
 * Picks the usable run from frames already sorted brightest first.
 *
 * Returns inclusive bounds. Both fallbacks are deliberate: if no frame is free
 * of crushed pixels then every exposure is clipped in shadow, so the whole set
 * is kept from the brightest; likewise if none is free of clipped pixels, the
 * set is kept through to the darkest. Filtering is an optimisation, and it
 * must never discard the only frames there are.
 */
export function selectExposureRange(
  frames: Pick<FrameStats, "pixelsAbove" | "pixelsBelow">[]
): { start: number; end: number } | null {
  const last = frames.length - 1;
  if (last < 0) {
    return null;
  }

  let start = 0;
  for (let i = last; i >= 0; i -= 1) {
    if (frames[i]?.pixelsBelow === 0) {
      start = i;
      break;
    }
  }

  let end = last;
  for (let i = start; i <= last; i += 1) {
    if (frames[i]?.pixelsAbove === 0) {
      end = i;
      break;
    }
  }

  return { end, start };
}

/**
 * Returns the frames worth merging, in brightest-to-darkest order.
 *
 * Decoding is injected so this stays testable and host-agnostic: the browser
 * decodes with `createImageBitmap`, and tests hand over pixel arrays directly.
 */
export async function filterImages(
  images: string[],
  mask: { diameter: number; xleft: number; ytop: number },
  decode: (path: string) => Promise<DecodedImage>
): Promise<string[]> {
  if (images.length === 0) {
    return images;
  }

  const radius = mask.diameter / 2;
  const xcenter = mask.xleft + radius;
  const ycenter = mask.ytop + radius;

  const first = await decode(images[0] as string);
  const circle = circleMask(
    first.width,
    first.height,
    xcenter,
    ycenter,
    radius
  );

  const stats: FrameStats[] = [];
  for (let index = 0; index < images.length; index += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: decoding is sequential so only one full frame is resident at a time; a bracket is up to 18 frames at 21 megapixels
    const image = index === 0 ? first : await decode(images[index] as string);
    // One mask is built from the first frame and reused, so every frame has to
    // share its dimensions or the mask lands on the wrong pixels.
    if (image.width !== first.width || image.height !== first.height) {
      throw new Error(
        `filter_images: ${images[index]} is ${image.width}x${image.height} but the ` +
          `first image is ${first.width}x${first.height}; the lens mask cannot be ` +
          "applied to both"
      );
    }
    stats.push(frameStats(image, circle, index));
  }

  stats.sort((a, b) => b.brightnessScore - a.brightnessScore);

  const range = selectExposureRange(stats);
  if (!range) {
    return images;
  }

  return stats
    .slice(range.start, range.end + 1)
    .map((frame) => images[frame.index] as string);
}
