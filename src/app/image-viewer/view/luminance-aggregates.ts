import { quantileSorted } from "simple-statistics";
import type { FalsecolorLuminanceMatrix } from "./falsecolor-luminance-webgpu";
import type { ImageRectSelection } from "./image-selection-context";

const HISTOGRAM_BIN_COUNT = 24;

export type LuminanceHistogramBin = {
  start: number;
  end: number;
  count: number;
};

export type LuminanceSummary = {
  sampleCount: number;
  average: number | null;
  median: number | null;
  minimum: number | null;
  maximum: number | null;
  outlierCount: number;
  histogramMinimum: number | null;
  histogramMaximum: number | null;
  histogram: LuminanceHistogramBin[];
};

const EMPTY_SUMMARY: LuminanceSummary = {
  average: null,
  histogram: [],
  histogramMaximum: null,
  histogramMinimum: null,
  maximum: null,
  median: null,
  minimum: null,
  outlierCount: 0,
  sampleCount: 0,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

type RegionBounds = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type RegionLuminanceSamples = {
  values: Float32Array;
  sum: number;
  minimum: number;
  maximum: number;
};

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
  selection: ImageRectSelection | null
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
  let sampleIndex = 0;
  let sum = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (let y = bounds.startY; y < bounds.endY; y += 1) {
    const rowOffset = y * matrix.width;
    for (let x = bounds.startX; x < bounds.endX; x += 1) {
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
    values,
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

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? minimum;
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
      maximum: sortedValues[sortedValues.length - 1] ?? null,
      minimum: sortedValues[0] ?? null,
      outlierCount: 0,
      values: sortedValues,
    };
  }

  const values = sortedValues.slice(startIndex, endIndex + 1);
  return {
    maximum: values[values.length - 1] ?? null,
    minimum: values[0] ?? null,
    outlierCount: sortedValues.length - values.length,
    values,
  };
}

export function computeLuminanceSummary(
  matrix: FalsecolorLuminanceMatrix | null,
  selection: ImageRectSelection | null
): LuminanceSummary {
  const samples = collectRegionLuminanceSamples(matrix, selection);
  if (!samples) {
    return EMPTY_SUMMARY;
  }

  const { values, sum, minimum, maximum } = samples;
  const sampleCount = values.length;
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
    average: sum / sampleCount,
    histogram,
    histogramMaximum: filteredHistogram.maximum,
    histogramMinimum: filteredHistogram.minimum,
    maximum,
    median,
    minimum,
    outlierCount: filteredHistogram.outlierCount,
    sampleCount,
  };
}
