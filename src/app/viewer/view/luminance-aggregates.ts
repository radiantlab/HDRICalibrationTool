import { quantileSorted } from "simple-statistics";
import type { FalsecolorLuminanceMatrix } from "./falsecolor-luminance-webgpu";
import type { ImageRectSelection } from "./image-selection-context";

const HISTOGRAM_BIN_COUNT = 24;

export interface LuminanceHistogramBin {
  count: number;
  end: number;
  start: number;
}

export interface LuminanceSummary {
  average: number | null;
  histogram: LuminanceHistogramBin[];
  histogramMaximum: number | null;
  histogramMinimum: number | null;
  maskApplied: boolean;
  maximum: number | null;
  median: number | null;
  minimum: number | null;
  outlierCount: number;
  sampleCount: number;
  standardDeviation: number | null;
}

/** The lens circle a fisheye picture was cropped around, in pixel space. */
export interface CircularMask {
  centerX: number;
  centerY: number;
  radius: number;
}

const EMPTY_SUMMARY: LuminanceSummary = {
  average: null,
  histogram: [],
  histogramMaximum: null,
  histogramMinimum: null,
  maskApplied: false,
  maximum: null,
  median: null,
  minimum: null,
  outlierCount: 0,
  sampleCount: 0,
  standardDeviation: null,
};

// Radiance view types: -vta (angular fisheye) and -vth (hemispherical fisheye)
// are the two the pipeline crops a lens circle out of. -vtv and friends fill
// the frame, so their corners are real image data, not mask.
const ANGULAR_FISHEYE_VIEW_REGEX = /(?:^|\s)-vt[ah](?:\s|$)/;

/**
 * Recovers the lens circle from the picture's own header.
 *
 * The viewer opens whatever HDR file is dropped on it and has no access to the
 * mask geometry the run was configured with. It does not need it: `crop`
 * produces a square circumscribing the lens circle, so the circle is the one
 * inscribed in that square. The `VIEW=` line written by `header_editing` says
 * whether there is a circle to look for at all.
 *
 * Squareness is required, not assumed. Two pictures reach this viewer that
 * carry a fisheye VIEW= but are not the plain crop: a falsecolor `_fc.hdr`,
 * which is wider than tall because of its legend strip, and a run whose
 * resize target was not square, which stretches the circle into an ellipse.
 * Inventing a circle for either would exclude valid pixels, so they get no
 * mask and the readings stay as they were.
 */
export function inferFisheyeMask(
  matrix: FalsecolorLuminanceMatrix | null,
  metadata: Record<string, string> | null
): CircularMask | null {
  if (!matrix || matrix.width !== matrix.height || matrix.width <= 0) {
    return null;
  }

  const view = metadata?.VIEW;
  if (!(view && ANGULAR_FISHEYE_VIEW_REGEX.test(view))) {
    return null;
  }

  return {
    centerX: matrix.width / 2,
    centerY: matrix.height / 2,
    radius: matrix.width / 2,
  };
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

interface RegionBounds {
  endX: number;
  endY: number;
  startX: number;
  startY: number;
}

interface RegionLuminanceSamples {
  maximum: number;
  minimum: number;
  sum: number;
  values: Float32Array;
}

function resolveRegionBounds(
  matrix: FalsecolorLuminanceMatrix,
  selection: ImageRectSelection | null
): RegionBounds {
  if (!selection) {
    return {
      endX: matrix.width,
      endY: matrix.height,
      startX: 0,
      startY: 0,
    };
  }

  const startX = clamp(Math.floor(selection.x), 0, matrix.width);
  const startY = clamp(Math.floor(selection.y), 0, matrix.height);
  const endX = clamp(Math.ceil(selection.x + selection.width), 0, matrix.width);
  const endY = clamp(
    Math.ceil(selection.y + selection.height),
    0,
    matrix.height
  );

  return { endX, endY, startX, startY };
}

function collectRegionLuminanceSamples(
  matrix: FalsecolorLuminanceMatrix | null,
  selection: ImageRectSelection | null,
  mask: CircularMask | null
): RegionLuminanceSamples | null {
  if (!matrix) {
    return null;
  }

  const bounds = resolveRegionBounds(matrix, selection);
  const regionWidth = bounds.endX - bounds.startX;
  const regionHeight = bounds.endY - bounds.startY;

  if (regionWidth <= 0 || regionHeight <= 0) {
    return null;
  }

  const expectedSamples = regionWidth * regionHeight;
  const values = new Float32Array(expectedSamples);
  const squaredRadius = mask ? mask.radius * mask.radius : 0;
  let sampleIndex = 0;
  let sum = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (let y = bounds.startY; y < bounds.endY; y += 1) {
    const rowOffset = y * matrix.width;
    // Pixel centres, so a pixel counts as inside only when its middle is.
    const offsetY = mask ? y + 0.5 - mask.centerY : 0;
    for (let x = bounds.startX; x < bounds.endX; x += 1) {
      if (mask) {
        const offsetX = x + 0.5 - mask.centerX;
        if (offsetX * offsetX + offsetY * offsetY > squaredRadius) {
          continue;
        }
      }
      const luminance = matrix.values[rowOffset + x] ?? 0;
      values[sampleIndex] = luminance;
      sum += luminance;
      minimum = Math.min(minimum, luminance);
      maximum = Math.max(maximum, luminance);
      sampleIndex += 1;
    }
  }

  if (sampleIndex === 0) {
    return null;
  }

  return {
    maximum,
    minimum,
    sum,
    // The buffer was sized for the whole rect; only the kept pixels are real.
    values: values.subarray(0, sampleIndex),
  };
}

function buildHistogram(
  values: Float32Array,
  minimum: number,
  maximum: number,
  binCount = HISTOGRAM_BIN_COUNT
): LuminanceHistogramBin[] {
  if (values.length === 0) {
    return [];
  }

  if (minimum === maximum) {
    return [
      {
        count: values.length,
        end: maximum,
        start: minimum,
      },
    ];
  }

  const safeBinCount = Math.max(1, Math.floor(binCount));
  const step = (maximum - minimum) / safeBinCount;
  const counts = Array.from({ length: safeBinCount }, () => 0);

  for (const rawValue of Array.from(values)) {
    const value = rawValue ?? minimum;
    const rawIndex = Math.floor((value - minimum) / step);
    const binIndex = clamp(rawIndex, 0, safeBinCount - 1);
    counts[binIndex] = (counts[binIndex] ?? 0) + 1;
  }

  return counts.map((count, index) => {
    const start = minimum + step * index;
    const end = index === safeBinCount - 1 ? maximum : start + step;
    return {
      count,
      end,
      start,
    };
  });
}

function filterHistogramOutliers(sortedValues: Float32Array) {
  if (sortedValues.length === 0) {
    return {
      maximum: null,
      minimum: null,
      outlierCount: 0,
      values: sortedValues,
    };
  }

  const sortedArray = Array.from(sortedValues);
  const q1 = quantileSorted(sortedArray, 0.25);
  const q3 = quantileSorted(sortedArray, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - iqr * 1.5;
  const upperFence = q3 + iqr * 1.5;

  let startIndex = 0;
  while ((sortedValues[startIndex] ?? lowerFence) < lowerFence) {
    startIndex += 1;
  }

  let endIndex = sortedValues.length - 1;
  while (
    endIndex >= startIndex &&
    (sortedValues[endIndex] ?? upperFence) > upperFence
  ) {
    endIndex -= 1;
  }

  const inlierCount = endIndex - startIndex + 1;
  if (inlierCount <= 0 || inlierCount === sortedValues.length) {
    return {
      maximum: sortedValues.at(-1) ?? null,
      minimum: sortedValues[0] ?? null,
      outlierCount: 0,
      values: sortedValues,
    };
  }

  const values = sortedValues.slice(startIndex, endIndex + 1);
  return {
    maximum: values.at(-1) ?? null,
    minimum: values[0] ?? null,
    outlierCount: sortedValues.length - values.length,
    values,
  };
}

/**
 * The spread of the region's luminance, in cd/m2.
 *
 * Divided by n rather than n - 1: every pixel in the region is present, so this
 * describes the region itself rather than estimating a wider population it was
 * drawn from. A single sample then has a spread of zero rather than an
 * undefined one.
 *
 * A second pass rather than the one-pass sqrt(E[x^2] - E[x]^2) form. That form
 * subtracts two large, nearly equal numbers whenever the mean is large relative
 * to the spread, which is the ordinary case for luminance: a facade at 4000
 * cd/m2 varying by 5 loses most of its significant digits at float precision.
 */
function computeStandardDeviation(values: Float32Array, mean: number): number {
  if (values.length === 0) {
    return 0;
  }

  // reduce rather than an index loop, which trips useForOf. Walks the samples
  // in place, without the Array.from copy elsewhere in this file.
  const sumOfSquaredDeviations = values.reduce((total, value) => {
    const deviation = value - mean;
    return total + deviation * deviation;
  }, 0);

  return Math.sqrt(sumOfSquaredDeviations / values.length);
}

export function computeLuminanceSummary(
  matrix: FalsecolorLuminanceMatrix | null,
  selection: ImageRectSelection | null,
  mask: CircularMask | null = null
): LuminanceSummary {
  const samples = collectRegionLuminanceSamples(matrix, selection, mask);
  if (!samples) {
    // A selection entirely outside the lens circle lands here, and that is the
    // reading most in need of the explanation, so the flag outlives the
    // statistics rather than being reset with them.
    return { ...EMPTY_SUMMARY, maskApplied: mask !== null };
  }

  const { values, sum, minimum, maximum } = samples;
  const sampleCount = values.length;
  const average = sum / sampleCount;
  values.sort();
  const midpoint = Math.floor(sampleCount / 2);
  const median =
    sampleCount % 2 === 0
      ? ((values[midpoint - 1] ?? 0) + (values[midpoint] ?? 0)) / 2
      : (values[midpoint] ?? 0);
  const filteredHistogram = filterHistogramOutliers(values);
  const histogram =
    filteredHistogram.minimum === null || filteredHistogram.maximum === null
      ? []
      : buildHistogram(
          filteredHistogram.values,
          filteredHistogram.minimum,
          filteredHistogram.maximum
        );

  return {
    average,
    histogram,
    histogramMaximum: filteredHistogram.maximum,
    histogramMinimum: filteredHistogram.minimum,
    maskApplied: mask !== null,
    maximum,
    median,
    minimum,
    outlierCount: filteredHistogram.outlierCount,
    sampleCount,
    // Over every sample, including the ones the histogram fences off: the
    // outlier filter shapes the chart, not the statistics.
    standardDeviation: computeStandardDeviation(values, average),
  };
}
