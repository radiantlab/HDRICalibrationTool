import { DataTexture, FloatType, LinearFilter, RGBAFormat } from "three";
import type { FalsecolorLuminanceMatrix } from "./falsecolor-luminance-webgpu";

interface FalsecolorStop {
  b: number;
  g: number;
  position: number;
  r: number;
}

const FALSECOLOR_GRADIENT: FalsecolorStop[] = [
  { b: 0.2, g: 0.0, position: 0.0, r: 0.0 },
  { b: 0.8, g: 0.0, position: 0.1, r: 0.0 },
  { b: 1.0, g: 0.6, position: 0.25, r: 0.0 },
  { b: 0.4, g: 0.9, position: 0.4, r: 0.0 },
  { b: 0.0, g: 1.0, position: 0.5, r: 0.4 },
  { b: 0.0, g: 0.9, position: 0.6, r: 0.8 },
  { b: 0.0, g: 0.6, position: 0.75, r: 1.0 },
  { b: 0.0, g: 0.2, position: 0.9, r: 1.0 },
  { b: 0.0, g: 0.0, position: 1.0, r: 0.8 },
];

function interpolateGradient(
  normalizedValue: number
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, normalizedValue));

  for (let i = 0; i < FALSECOLOR_GRADIENT.length - 1; i += 1) {
    const current = FALSECOLOR_GRADIENT[i];
    const next = FALSECOLOR_GRADIENT[i + 1];
    if (!(current && next)) {
      continue;
    }

    if (clamped >= current.position && clamped <= next.position) {
      const range = next.position - current.position;
      const t = range > 0 ? (clamped - current.position) / range : 0;
      return [
        current.r + t * (next.r - current.r),
        current.g + t * (next.g - current.g),
        current.b + t * (next.b - current.b),
      ];
    }
  }

  const last = FALSECOLOR_GRADIENT.at(-1);
  return last ? [last.r, last.g, last.b] : [0, 0, 0];
}

export interface HeatmapScaleRange {
  maximum: number;
  minimum: number;
}

export function computeAutoScaleRange(
  matrix: FalsecolorLuminanceMatrix
): HeatmapScaleRange {
  const { values } = matrix;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (const rawValue of Array.from(values)) {
    const value = rawValue ?? 0;
    if (value > 0) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }

  if (!Number.isFinite(minimum)) {
    minimum = 0;
  }
  if (!Number.isFinite(maximum)) {
    maximum = 1;
  }
  if (minimum >= maximum) {
    maximum = minimum + 1;
  }

  return { maximum, minimum };
}

export function buildHeatmapTexture(
  matrix: FalsecolorLuminanceMatrix,
  scaleRange: HeatmapScaleRange
): DataTexture {
  const pixelCount = matrix.width * matrix.height;
  const rgbaData = new Float32Array(pixelCount * 4);
  const logMin = Math.log10(Math.max(scaleRange.minimum, 1e-6));
  const logMax = Math.log10(Math.max(scaleRange.maximum, 1e-6));
  const logRange = logMax - logMin;

  for (let i = 0; i < pixelCount; i += 1) {
    const luminance = matrix.values[i] ?? 0;
    const rgbaOffset = i * 4;

    if (luminance <= 0) {
      rgbaData[rgbaOffset] = 0;
      rgbaData[rgbaOffset + 1] = 0;
      rgbaData[rgbaOffset + 2] = 0;
      rgbaData[rgbaOffset + 3] = 1;
      continue;
    }

    const logValue = Math.log10(luminance);
    const normalized = logRange > 0 ? (logValue - logMin) / logRange : 0.5;
    const [r, g, b] = interpolateGradient(normalized);

    rgbaData[rgbaOffset] = r;
    rgbaData[rgbaOffset + 1] = g;
    rgbaData[rgbaOffset + 2] = b;
    rgbaData[rgbaOffset + 3] = 1;
  }

  const texture = new DataTexture(
    rgbaData,
    matrix.width,
    matrix.height,
    RGBAFormat,
    FloatType
  );
  texture.generateMipmaps = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  texture.flipY = true;

  return texture;
}

export { FALSECOLOR_GRADIENT };
