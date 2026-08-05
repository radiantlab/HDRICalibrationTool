import { describe, expect, it } from "@jest/globals";
import { describeMaskOverflow } from "@/app/pipeline/lens-mask-fit";

// The dimensions dcraw_emu produces for the example Canon 5D Mark III CR2s,
// and therefore the dimensions of the merged picture crop is handed.
const CR2: [number, number] = [5796, 3870];

describe("describeMaskOverflow", () => {
  // The reported failure: "-17 with diameter 3900 does not fit in an image
  // 3870 px tall", which Radiance raised only after every exposure had been
  // merged.
  it("catches the mask that crop rejected, before the run starts", () => {
    const message = describeMaskOverflow(
      { diameter: 3900, xleft: 948, ytop: -17 },
      CR2
    );

    expect(message).not.toBeNull();
    expect(message).toContain("3900");
    expect(message).toContain("5796x3870");
  });

  // A circle wider than the picture cannot be moved into place, so the advice
  // has to be to shrink it rather than to reposition it.
  it("tells the user to shrink a mask that cannot fit at any position", () => {
    const message = describeMaskOverflow(
      { diameter: 3900, xleft: 948, ytop: -17 },
      CR2
    );

    expect(message).toContain("Reduce the radius to 1935 or less");
  });

  it("accepts the mask the example rig actually calls for", () => {
    // ImageLensInformation.txt for these CR2s: diameter 3728, xleft 1024,
    // ydown 88, so ytop is 3870 - (88 + 3728) = 54.
    expect(
      describeMaskOverflow({ diameter: 3728, xleft: 1024, ytop: 54 }, CR2)
    ).toBeNull();
  });

  it("accepts a mask flush with every edge", () => {
    expect(
      describeMaskOverflow({ diameter: 3870, xleft: 0, ytop: 0 }, CR2)
    ).toBeNull();
  });

  // crop.rs checks the y axis only; pcompos pads a horizontal overhang with
  // black instead of failing, so nothing would ever have reported this.
  it("catches a horizontal overhang, which Radiance would silently pad", () => {
    const message = describeMaskOverflow(
      { diameter: 3000, xleft: 3000, ytop: 400 },
      CR2
    );

    expect(message).toContain("reaches outside the image");
  });

  it("catches a mask starting left of the image", () => {
    expect(
      describeMaskOverflow({ diameter: 3000, xleft: -1, ytop: 400 }, CR2)
    ).not.toBeNull();
  });

  it("catches a mask running past the bottom edge", () => {
    expect(
      describeMaskOverflow({ diameter: 3000, xleft: 100, ytop: 871 }, CR2)
    ).not.toBeNull();
  });

  // Nothing is known about the image yet, so there is nothing to check
  // against; the pipeline's own validation remains the backstop.
  it("says nothing when the image size is unknown", () => {
    expect(
      describeMaskOverflow({ diameter: 100, xleft: 0, ytop: 0 }, [0, 0])
    ).toBeNull();
  });
});
