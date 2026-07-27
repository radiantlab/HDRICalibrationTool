import { afterAll, describe, expect, it } from "@jest/globals";
import { act, render } from "@testing-library/react";
import { motionValue } from "framer-motion";

jest.mock("@/lib/generic-image-metadata", () => {
  const metadata = Promise.resolve({ size: [5616, 3744] });
  return { useGenericImageMetadata: () => metadata };
});

declare const jest: typeof import("@jest/globals").jest;

import { LensMaskEditor } from "../src/app/home-page/lens-mask-editor";

// Width the mask container reports. Starts at 0, as it does while a dialog is
// still being laid out, then becomes the fitted width.
let containerWidth = 0;
const observers: (() => void)[] = [];

const realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const realResizeObserver = globalThis.ResizeObserver;

afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = realGetBoundingClientRect;
  globalThis.ResizeObserver = realResizeObserver;
});

function installMeasurementStubs() {
  HTMLElement.prototype.getBoundingClientRect = function mockRect() {
    return {
      bottom: 0,
      height: containerWidth * (3744 / 5616),
      left: 0,
      right: containerWidth,
      toJSON: () => ({}),
      top: 0,
      width: containerWidth,
      x: 0,
      y: 0,
    } as DOMRect;
  };
  class RecordingResizeObserver {
    callback: () => void;
    constructor(callback: () => void) {
      this.callback = callback;
    }
    observe() {
      observers.push(this.callback);
    }
    unobserve() {
      // no-op
    }
    disconnect() {
      // no-op
    }
  }
  globalThis.ResizeObserver =
    RecordingResizeObserver as unknown as typeof ResizeObserver;
}

function ringDiameter(container: HTMLElement): number {
  const circle = container.ownerDocument.querySelector<HTMLElement>(
    "[role='dialog'] .rounded-full"
  );
  if (!circle) {
    throw new Error("expected the mask circle to render");
  }
  return Number.parseFloat(circle.style.height || "0");
}

describe("lens mask ring in the editor", () => {
  it("draws the ring once the container has been measured", async () => {
    installMeasurementStubs();
    containerWidth = 0;

    const centerX = motionValue(2808);
    const centerY = motionValue(1872);
    const radiusAjusterCenterX = motionValue(2808 + 936);
    const radiusAjusterCenterY = motionValue(1872);

    let root!: HTMLElement;
    await act(() => {
      const { container } = render(
        <LensMaskEditor
          centerX={centerX}
          centerY={centerY}
          imagePath="/fake/image.jpg"
          onOpenChange={() => undefined}
          open
          radiusAjusterCenterX={radiusAjusterCenterX}
          radiusAjusterCenterY={radiusAjusterCenterY}
        />
      );
      root = container;
      return Promise.resolve();
    });

    // The dialog has now been laid out, which is what the ResizeObserver
    // reports in the real app.
    containerWidth = 1000;
    act(() => {
      for (const notify of observers) {
        notify();
      }
    });

    // 936 image px radius at 1000/5616 scale is a 333px diameter on screen.
    // framer-motion writes motion values to the DOM on an animation frame, so
    // let one run before reading the style back.
    await act(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        })
    );

    expect(ringDiameter(root)).toBeGreaterThan(1);
  });

  it("re-measures itself after mount without waiting for a resize", async () => {
    installMeasurementStubs();
    observers.length = 0;
    containerWidth = 0;

    let root!: HTMLElement;
    await act(() => {
      const { container } = render(
        <LensMaskEditor
          centerX={motionValue(2808)}
          centerY={motionValue(1872)}
          imagePath="/fake/image.jpg"
          onOpenChange={() => undefined}
          open
          radiusAjusterCenterX={motionValue(2808 + 936)}
          radiusAjusterCenterY={motionValue(1872)}
        />
      );
      root = container;
      return Promise.resolve();
    });

    // The dialog animates in, so the first measurement can be taken while the
    // element is still transformed or unlaid-out. Nothing resizes afterwards:
    // the border box never changes, so the ResizeObserver stays silent and the
    // component must correct itself.
    containerWidth = 1000;
    await act(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );

    expect(ringDiameter(root)).toBeGreaterThan(1);
  });
});
