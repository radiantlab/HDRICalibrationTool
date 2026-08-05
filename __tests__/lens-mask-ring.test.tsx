import { describe, expect, it } from "@jest/globals";
import { act, render } from "@testing-library/react";
import { motionValue } from "framer-motion";

jest.mock("@/lib/generic-image-metadata", () => {
  const metadata = Promise.resolve({ size: [5616, 3744] });
  return { useGenericImageMetadata: () => metadata };
});

declare const jest: typeof import("@jest/globals").jest;

import { LensMaskEditor } from "../src/app/pipeline/lens-mask-editor";

const IMAGE_WIDTH = 5616;
const IMAGE_HEIGHT = 3744;

function maskCircle(root: HTMLElement): HTMLElement {
  const circle = root.ownerDocument.querySelector<HTMLElement>(
    "[role='dialog'] .rounded-full"
  );
  if (!circle) {
    throw new Error("expected the mask circle to render");
  }
  return circle;
}

async function renderEditor(values: {
  centerX: number;
  centerY: number;
  radius: number;
}) {
  const centerX = motionValue(values.centerX);
  const centerY = motionValue(values.centerY);
  const radius = motionValue(values.radius);
  let root!: HTMLElement;

  await act(() => {
    const { container } = render(
      <LensMaskEditor
        centerX={centerX}
        centerY={centerY}
        imagePath="/fake/image.jpg"
        onOpenChange={() => undefined}
        open
        radius={radius}
      />
    );
    root = container;
    return Promise.resolve();
  });

  // framer-motion writes motion values to the DOM on an animation frame.
  await act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      })
  );

  return { centerX, centerY, radius, root };
}

describe("lens mask in the editor", () => {
  it("sizes the circle as a percentage of the image, not of a measured container", async () => {
    const { root } = await renderEditor({
      centerX: 2808,
      centerY: 1872,
      radius: 936,
    });

    // A 936px radius on a 5616px wide image is a third of the width. Expressing
    // it this way is what makes the mask independent of when, or whether, the
    // container was measured. An earlier version collapsed the whole mask to
    // the origin whenever that measurement was taken too early.
    const { style } = maskCircle(root);

    expect(style.width).toBe(`${((936 * 2) / IMAGE_WIDTH) * 100}%`);
    expect(style.left).toBe(`${((2808 - 936) / IMAGE_WIDTH) * 100}%`);
    expect(style.top).toBe(`${((1872 - 936) / IMAGE_HEIGHT) * 100}%`);
  });

  it("stays square so the circle is round at any container shape", async () => {
    const { root } = await renderEditor({
      centerX: 2808,
      centerY: 1872,
      radius: 936,
    });

    expect(maskCircle(root).style.aspectRatio).toBe("1");
  });

  it("places an unplaced mask at the image centre with a quarter-height radius", async () => {
    const { centerX, centerY, radius } = await renderEditor({
      centerX: 0,
      centerY: 0,
      radius: 0,
    });

    expect(centerX.get()).toBe(IMAGE_WIDTH / 2);
    expect(centerY.get()).toBe(IMAGE_HEIGHT / 2);
    expect(radius.get()).toBe(IMAGE_HEIGHT / 4);
  });

  it("leaves an already placed mask alone", async () => {
    const { centerX, radius } = await renderEditor({
      centerX: 1000,
      centerY: 900,
      radius: 400,
    });

    expect(centerX.get()).toBe(1000);
    expect(radius.get()).toBe(400);
  });
});
