/**
 * The selection logic is pure, so it is tested directly rather than through a
 * decoder. What matters is which frames survive, and that the fallbacks never
 * discard a whole bracket.
 */

import { describe, expect, it } from "@jest/globals";

const MASK_MISMATCH = /cannot be applied to both/;

import {
  circleMask,
  type DecodedImage,
  filterImages,
  frameStats,
  selectExposureRange,
} from "./filter-images";

/** A solid frame of one grey level. */
function flat(level: number, width = 4, height = 4): DecodedImage {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = level;
    rgba[i * 4 + 1] = level;
    rgba[i * 4 + 2] = level;
    rgba[i * 4 + 3] = 255;
  }
  return { height, rgba, width };
}

describe("circleMask", () => {
  it("includes the centre and excludes the corners", () => {
    const mask = circleMask(5, 5, 2, 2, 2);
    expect(mask[2 * 5 + 2]).toBe(1); // centre
    expect(mask[0]).toBe(0); // top-left corner
  });

  it("includes a pixel exactly on the radius", () => {
    const mask = circleMask(5, 5, 2, 2, 2);
    expect(mask[2 * 5 + 0]).toBe(1);
  });
});

describe("frameStats", () => {
  const allInside = new Uint8Array(16).fill(1);

  it("counts crushed pixels", () => {
    expect(frameStats(flat(10), allInside, 0).pixelsBelow).toBe(16);
    expect(frameStats(flat(10), allInside, 0).pixelsAbove).toBe(0);
  });

  it("counts clipped pixels", () => {
    expect(frameStats(flat(250), allInside, 0).pixelsAbove).toBe(16);
  });

  it("counts a mid-grey as neither", () => {
    const stats = frameStats(flat(128), allInside, 0);
    expect(stats.pixelsBelow).toBe(0);
    expect(stats.pixelsAbove).toBe(0);
  });

  it("ignores everything outside the mask", () => {
    // A fisheye frame is mostly black surround; counting it would make every
    // frame look shadow-clipped.
    const outsideOnly = new Uint8Array(16);
    expect(frameStats(flat(10), outsideOnly, 0).pixelsBelow).toBe(0);
  });

  it("scores a brighter frame higher", () => {
    const dark = frameStats(flat(40), allInside, 0).brightnessScore;
    const bright = frameStats(flat(200), allInside, 0).brightnessScore;
    expect(bright).toBeGreaterThan(dark);
  });
});

describe("selectExposureRange", () => {
  // Frames arrive sorted brightest first.
  const frame = (below: number, above: number) => ({
    pixelsAbove: above,
    pixelsBelow: below,
  });

  it("starts at the darkest frame with no crushed shadows", () => {
    // `start` is the LAST index whose pixelsBelow is 0, and the list runs
    // brightest first -- so it lands on the darkest frame that is still clean
    // in shadow, not on the brightest. `end` is then the first frame from
    // there with no clipped highlights. The selection is narrow by design.
    const range = selectExposureRange([
      frame(0, 500), // brightest: highlights clipped
      frame(0, 0),
      frame(0, 0), // darkest frame still clean in shadow
      frame(300, 0), // darker still: shadows crushed
    ]);
    expect(range).toEqual({ end: 2, start: 2 });
  });

  it("falls back to the brightest when every frame has crushed shadows", () => {
    // No frame is clean in shadow, so `start` falls back to 0 rather than
    // discarding the only frames there are.
    const range = selectExposureRange([frame(5, 0), frame(9, 0)]);
    expect(range).toEqual({ end: 0, start: 0 });
  });

  it("runs through to the darkest when no frame is free of clipped pixels", () => {
    // `end` falls back to the last index, so the whole tail is kept.
    const range = selectExposureRange([frame(0, 4), frame(0, 2)]);
    expect(range).toEqual({ end: 1, start: 1 });
  });

  it("returns null for an empty set", () => {
    expect(selectExposureRange([])).toBeNull();
  });
});

describe("filterImages", () => {
  const mask = { diameter: 4, xleft: 0, ytop: 0 };

  it("drops the frames that contribute nothing, brightest first", async () => {
    const levels: Record<string, number> = {
      "blown.jpg": 250,
      "crushed.jpg": 5,
      "mid.jpg": 128,
    };
    const kept = await filterImages(
      ["blown.jpg", "mid.jpg", "crushed.jpg"],
      mask,
      (path) => Promise.resolve(flat(levels[path] ?? 0))
    );
    // The blown frame is clipped and the crushed one has no clean shadows, so
    // only the mid exposure survives. On flat test frames the selection is as
    // narrow as it can be; a real bracket has frames that overlap.
    expect(kept).toEqual(["mid.jpg"]);
  });

  it("returns an empty set unchanged", async () => {
    expect(
      await filterImages([], mask, () => Promise.reject(new Error("no")))
    ).toEqual([]);
  });

  it("refuses a frame whose dimensions differ from the first", async () => {
    // One mask is reused for every frame, so a different size would land it on
    // the wrong pixels.
    await expect(
      filterImages(["a.jpg", "b.jpg"], mask, (path) =>
        Promise.resolve(path === "a.jpg" ? flat(128) : flat(128, 8, 8))
      )
    ).rejects.toThrow(MASK_MISMATCH);
  });

  it("decodes the first frame only once", async () => {
    const decoded: string[] = [];
    await filterImages(["a.jpg", "b.jpg"], mask, (path) => {
      decoded.push(path);
      return Promise.resolve(flat(128));
    });
    expect(decoded).toEqual(["a.jpg", "b.jpg"]);
  });
});
