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

import { LensMaskEditor } from "../src/app/home-page/lens-mask-editor";

describe("LensMaskEditor", () => {
  it("edits the same motion values as the inline preview", async () => {
    const centerX = motionValue(2808);
    const centerY = motionValue(1872);
    const radiusAjusterCenterX = motionValue(2808 + 936);
    const radiusAjusterCenterY = motionValue(1872);

    await act(() => {
      render(
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
      return Promise.resolve();
    });

    expect(
      screen.getByRole("dialog", { name: DIALOG_TITLE })
    ).toBeInTheDocument();

    // The editor did not clone or reset the caller's values.
    expect(centerX.get()).toBe(2808);
    expect(centerY.get()).toBe(1872);
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
          radiusAjusterCenterX={motionValue(0)}
          radiusAjusterCenterY={motionValue(0)}
        />
      );
      return Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
