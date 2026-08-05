import { describe, expect, it } from "@jest/globals";
import { act, render, screen } from "@testing-library/react";
import { motionValue } from "framer-motion";

// Self-contained factory, and the global jest binding: the SWC transform only
// hoists jest.mock above the imports for the global form.
jest.mock("@/lib/generic-image-metadata", () => {
  const metadata = Promise.resolve({ size: [5616, 3744] });
  return { useGenericImageMetadata: () => metadata };
});

declare const jest: typeof import("@jest/globals").jest;

const DIALOG_TITLE = /Configure lens mask/;

import { LensMaskEditor } from "../src/app/pipeline/lens-mask-editor";

describe("LensMaskEditor", () => {
  it("edits the same motion values as the inline preview", async () => {
    const centerX = motionValue(2808);
    const centerY = motionValue(1872);
    const radius = motionValue(936);

    await act(() => {
      render(
        <LensMaskEditor
          centerX={centerX}
          centerY={centerY}
          imagePath="/fake/image.jpg"
          onOpenChange={() => undefined}
          open
          radius={radius}
        />
      );
      return Promise.resolve();
    });

    expect(
      screen.getByRole("dialog", { name: DIALOG_TITLE })
    ).toBeInTheDocument();

    // The editor did not clone or reset the caller's values.
    expect(centerX.get()).toBe(2808);
    expect(centerY.get()).toBe(1872);
  });

  it("sizes the mask box to the image aspect ratio so it fits the dialog", async () => {
    await act(() => {
      render(
        <LensMaskEditor
          centerX={motionValue(2808)}
          centerY={motionValue(1872)}
          imagePath="/fake/image.jpg"
          onOpenChange={() => undefined}
          open
          radius={motionValue(936)}
        />
      );
      return Promise.resolve();
    });

    // GenericImage is size-full with object-contain, so the parent decides the
    // box. Without the ratio the mask container takes the natural image size:
    // the image overflows and the circle is drawn off screen.
    const viewport = screen.getByTestId("mask-viewport");
    const box = viewport.firstElementChild as HTMLElement;

    expect(box.style.aspectRatio).toBe("5616 / 3744");
    expect(viewport.className).toContain("overflow-hidden");
  });

  it("renders nothing while closed", async () => {
    await act(() => {
      render(
        <LensMaskEditor
          centerX={motionValue(0)}
          centerY={motionValue(0)}
          imagePath="/fake/image.jpg"
          onOpenChange={() => undefined}
          open={false}
          radius={motionValue(0)}
        />
      );
      return Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
