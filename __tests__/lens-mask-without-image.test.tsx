import { describe, expect, it } from "@jest/globals";
import { act, render, screen } from "@testing-library/react";
import { motionValue } from "framer-motion";
import { useForm } from "react-hook-form";

// jest.mock must be hoisted above the imports below, which the SWC transform
// only does for the global binding, not one imported from @jest/globals.
declare const jest: typeof import("@jest/globals").jest;

// The hook returns nothing when there is no path, which is the state under
// test: no preview image has been clicked.
jest.mock("@/lib/generic-image-metadata", () => ({
  useGenericImageMetadata: (path?: string) =>
    path ? Promise.resolve({ size: [5616, 3744] }) : undefined,
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import type { pipelineConfig } from "../src/app/pipeline/(pipeline-configuration)/config-provider";
import { LensMaskInput } from "../src/app/pipeline/lens-mask-input";

/** The mask a preset applies, in image pixels. */
const PRESET_MASK = { radius: 1800, x: 2808, y: 1935 };

/** The image the mocked metadata hook describes. */
const PREVIEW_SIZE: [number, number] = [5616, 3744];

const DRAWN_AGAINST = /Drawn against a 5796×3870 image/;
const MISMATCH =
  /drawn against a 5796×3870 image and the selected one is 5616×3744/;
const ANY_ORIGIN = /drawn against/;

function Harness({
  maskPreviewImage,
  maskSourceSize,
}: {
  maskPreviewImage?: string;
  maskSourceSize?: [number, number] | null;
}) {
  const form = useForm<pipelineConfig>({
    defaultValues: { lensMask: PRESET_MASK },
  });

  return (
    <TooltipProvider>
      <LensMaskInput
        centerX={motionValue(PRESET_MASK.x)}
        centerY={motionValue(PRESET_MASK.y)}
        maskPreviewImage={maskPreviewImage}
        maskSourceSize={maskSourceSize}
        radius={motionValue(PRESET_MASK.radius)}
        register={form.register}
      />
    </TooltipProvider>
  );
}

async function renderMask(props: Parameters<typeof Harness>[0] = {}) {
  await act(() => {
    render(<Harness {...props} />);
    return Promise.resolve();
  });
}

describe("LensMaskInput with no preview image selected", () => {
  it("still shows the mask, so a preset's values do not read as absent", async () => {
    await renderMask();

    expect(screen.getByText("No image selected")).toBeInTheDocument();

    const radius = screen.getByPlaceholderText("Radius") as HTMLInputElement;
    const x = screen.getByPlaceholderText("X") as HTMLInputElement;
    const y = screen.getByPlaceholderText("Y") as HTMLInputElement;

    expect(radius.value).toBe(String(PRESET_MASK.radius));
    expect(x.value).toBe(String(PRESET_MASK.x));
    expect(y.value).toBe(String(PRESET_MASK.y));
  });

  it("names the image size a preset's mask was drawn against", async () => {
    await renderMask({ maskSourceSize: [5796, 3870] });

    expect(screen.getByText(DRAWN_AGAINST)).toBeInTheDocument();
  });
});

describe("LensMaskInput with a preview image selected", () => {
  it("warns for as long as the mask does not fit the image", async () => {
    await renderMask({
      maskPreviewImage: "/fake/image.jpg",
      maskSourceSize: [5796, 3870],
    });

    // The toast raised when the preset was applied cannot cover this: the
    // image may well have been selected after the preset, and it is gone by
    // the time the mask is looked at either way.
    expect(screen.getByText(MISMATCH)).toBeInTheDocument();
  });

  it("stays quiet when the mask was drawn against this same size", async () => {
    await renderMask({
      maskPreviewImage: "/fake/image.jpg",
      maskSourceSize: PREVIEW_SIZE,
    });

    expect(screen.queryByText(ANY_ORIGIN)).not.toBeInTheDocument();
  });

  it("stays quiet when the mask has no recorded origin", async () => {
    await renderMask({ maskPreviewImage: "/fake/image.jpg" });

    expect(screen.queryByText(ANY_ORIGIN)).not.toBeInTheDocument();
  });
});
