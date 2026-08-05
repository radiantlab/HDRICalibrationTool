import { describe, expect, it } from "@jest/globals";

// jest.mock must be hoisted above the imports below, which the SWC transform
// only does for the global binding, not one imported from @jest/globals.
declare const jest: typeof import("@jest/globals").jest;

import { act, render } from "@testing-library/react";
import { motionValue } from "framer-motion";

// The component resolves image dimensions asynchronously; the test only cares
// about the placement maths, so the metadata is supplied directly.
const IMAGE_WIDTH = 5616;
const IMAGE_HEIGHT = 3744;
// The preview is rendered at a sixth of the real width, which is what makes the
// scaling factor something other than 1 and exposes the sync direction bug.
const PREVIEW_WIDTH = IMAGE_WIDTH / 6;

// Self-contained factory: jest.mock is hoisted above the consts above, and the
// static import below triggers it while they are still in the temporal dead
// zone. The promise is created once inside the factory because the component
// passes it to use(), and a fresh promise per render would suspend forever.
jest.mock("@/lib/generic-image-metadata", () => {
  const metadata = Promise.resolve({ size: [5616, 3744] });
  return { useGenericImageMetadata: () => metadata };
});

import { ScaledCircularMaskSelection } from "../src/app/pipeline/fs-circular-mas-selection";

describe("lens mask default placement", () => {
  it("centres the mask and starts the radius at a quarter of the image height", async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function mockRect() {
      return {
        bottom: 0,
        height: PREVIEW_WIDTH * (IMAGE_HEIGHT / IMAGE_WIDTH),
        left: 0,
        right: PREVIEW_WIDTH,
        toJSON: () => ({}),
        top: 0,
        width: PREVIEW_WIDTH,
        x: 0,
        y: 0,
      } as DOMRect;
    };

    // Unplaced mask, exactly as the form defaults it.
    const centerX = motionValue(0);
    const centerY = motionValue(0);
    const radius = motionValue(0);

    try {
      // The component suspends on image metadata; without act the resolved
      // render is never flushed and the placement effect never runs.
      await act(() => {
        render(
          <ScaledCircularMaskSelection
            centerX={centerX}
            centerY={centerY}
            imagePath="/fake/image.jpg"
            radius={radius}
          >
            <div />
          </ScaledCircularMaskSelection>
        );
        return Promise.resolve();
      });

      // Centred on the image, in image pixels rather than screen pixels.
      expect(centerX.get()).toBe(IMAGE_WIDTH / 2);
      expect(centerY.get()).toBe(IMAGE_HEIGHT / 2);

      expect(radius.get()).toBe(IMAGE_HEIGHT / 4);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });
});
