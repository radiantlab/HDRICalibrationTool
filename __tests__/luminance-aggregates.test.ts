import { describe, expect, it } from "@jest/globals";
import type { FalsecolorLuminanceMatrix } from "@/app/viewer/view/falsecolor-luminance-webgpu";
import {
  computeLuminanceSummary,
  inferFisheyeMask,
} from "@/app/viewer/view/luminance-aggregates";

const CORNER_LUMINANCE = 1000;
const INSIDE_LUMINANCE = 10;

/**
 * A 4x4 picture whose inscribed circle (radius 2, centred at 2,2) covers every
 * pixel except the four corners, so masked and unmasked results differ by a
 * known amount: 16 samples unmasked, 12 masked.
 */
function makeSquareMatrix(): FalsecolorLuminanceMatrix {
  const width = 4;
  const height = 4;
  const values = new Float32Array(width * height).fill(INSIDE_LUMINANCE);
  for (const index of [0, 3, 12, 15]) {
    values[index] = CORNER_LUMINANCE;
  }
  return { exposure: 1, height, multiplier: 179, values, width };
}

describe("inferFisheyeMask", () => {
  it("derives the inscribed circle for an angular fisheye view", () => {
    const mask = inferFisheyeMask(makeSquareMatrix(), {
      VIEW: "-vta -vv 180 -vh 180",
    });

    expect(mask).toEqual({ centerX: 2, centerY: 2, radius: 2 });
  });

  it("derives the inscribed circle for a hemispherical fisheye view", () => {
    const mask = inferFisheyeMask(makeSquareMatrix(), {
      VIEW: "-vth -vv 186 -vh 186",
    });

    expect(mask).not.toBeNull();
  });

  it("returns no mask for a perspective view", () => {
    const mask = inferFisheyeMask(makeSquareMatrix(), {
      VIEW: "-vtv -vv 60 -vh 60",
    });

    expect(mask).toBeNull();
  });

  it("returns no mask when the header carries no view", () => {
    expect(
      inferFisheyeMask(makeSquareMatrix(), { FORMAT: "32-bit_rle_rgbe" })
    ).toBeNull();
  });

  it("does not mistake -vta inside another token for a view type", () => {
    const mask = inferFisheyeMask(makeSquareMatrix(), {
      VIEW: "-vtv -vf my-vta-preset.vf",
    });

    expect(mask).toBeNull();
  });

  // The crop is square by construction, so a non-square picture is something
  // else: a falsecolor output with its legend strip, or a run whose resize
  // stretched the circle into an ellipse. Guessing a circle there would
  // discard valid pixels, so nothing is excluded.
  it("returns no mask for a non-square picture", () => {
    const matrix = makeSquareMatrix();
    const mask = inferFisheyeMask(
      { ...matrix, height: 2, width: 8 },
      { VIEW: "-vta" }
    );

    expect(mask).toBeNull();
  });
});

describe("computeLuminanceSummary with a fisheye mask", () => {
  it("excludes pixels outside the circle from every statistic", () => {
    const summary = computeLuminanceSummary(makeSquareMatrix(), null, {
      centerX: 2,
      centerY: 2,
      radius: 2,
    });

    expect(summary.sampleCount).toBe(12);
    expect(summary.average).toBe(INSIDE_LUMINANCE);
    expect(summary.maximum).toBe(INSIDE_LUMINANCE);
    expect(summary.median).toBe(INSIDE_LUMINANCE);
    // Every kept pixel holds the same value, so the spread is exactly zero.
    expect(summary.standardDeviation).toBe(0);
  });

  it("keeps every pixel when no mask is supplied", () => {
    const summary = computeLuminanceSummary(makeSquareMatrix(), null, null);

    expect(summary.sampleCount).toBe(16);
    expect(summary.maximum).toBe(CORNER_LUMINANCE);
  });

  it("reports that the mask was applied so the reading can be labelled", () => {
    const masked = computeLuminanceSummary(makeSquareMatrix(), null, {
      centerX: 2,
      centerY: 2,
      radius: 2,
    });
    const unmasked = computeLuminanceSummary(makeSquareMatrix(), null, null);

    expect(masked.maskApplied).toBe(true);
    expect(unmasked.maskApplied).toBe(false);
  });

  it("intersects the mask with an explicit selection", () => {
    // The top-left 2x2 quadrant holds one corner pixel and three inside ones.
    const summary = computeLuminanceSummary(
      makeSquareMatrix(),
      { height: 2, width: 2, x: 0, y: 0 },
      { centerX: 2, centerY: 2, radius: 2 }
    );

    expect(summary.sampleCount).toBe(3);
    expect(summary.maximum).toBe(INSIDE_LUMINANCE);
  });

  // Zero samples is exactly when the reading needs explaining, so the flag has
  // to survive the empty case rather than being dropped with the statistics.
  it("still reports the mask when it left no samples at all", () => {
    const summary = computeLuminanceSummary(
      makeSquareMatrix(),
      { height: 1, width: 1, x: 0, y: 0 },
      { centerX: 2, centerY: 2, radius: 2 }
    );

    expect(summary.sampleCount).toBe(0);
    expect(summary.average).toBeNull();
    expect(summary.standardDeviation).toBeNull();
    expect(summary.maskApplied).toBe(true);
  });
});

describe("computeLuminanceSummary spread", () => {
  it("divides by n, describing the region rather than estimating a population", () => {
    // Two samples either side of a mean of 5. Dividing by n gives exactly 5;
    // the n - 1 sample estimate would give 5*sqrt(2), about 7.07.
    const summary = computeLuminanceSummary(
      {
        exposure: 1,
        height: 1,
        multiplier: 179,
        values: new Float32Array([0, 10]),
        width: 2,
      },
      null
    );

    expect(summary.standardDeviation).toBe(5);
  });

  // n - 1 would divide by zero here.
  it("reports no spread for a single sample", () => {
    const summary = computeLuminanceSummary(makeSquareMatrix(), {
      height: 1,
      width: 1,
      x: 1,
      y: 1,
    });

    expect(summary.sampleCount).toBe(1);
    expect(summary.standardDeviation).toBe(0);
  });

  // The 1.5xIQR filter shapes the histogram only. A bright window in an
  // otherwise dim room is the whole point of the reading, so dropping it from
  // the spread would understate the variation the user can see.
  it("counts the samples the histogram fences off", () => {
    // Twelve pixels at 10 and four at 1000: mean 257.5, variance 183768.75.
    const summary = computeLuminanceSummary(makeSquareMatrix(), null);

    expect(summary.sampleCount).toBe(16);
    expect(summary.standardDeviation).toBeCloseTo(Math.sqrt(183_768.75), 3);
  });
});
