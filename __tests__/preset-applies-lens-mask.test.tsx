import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";

// jest.mock must be hoisted above the imports below, which the SWC transform
// only does for the global binding, not one imported from @jest/globals.
declare const jest: typeof import("@jest/globals").jest;

const PRESET_MASK = { radius: 1800, x: 2808, y: 1935 };

jest.mock("@/lib/presets", () => ({
  changedSources: () => Promise.resolve([]),
  deletePreset: () => Promise.resolve(),
  presetFilePath: () => null,
  presetId: (name: string) => name,
  readPresets: () =>
    Promise.resolve([
      {
        files: {},
        fisheyeView: {
          horizontalViewDegrees: 180,
          projection: "vta",
          verticalViewDegrees: 180,
        },
        id: "sigma-8mm",
        lensMask: PRESET_MASK,
        lensMaskImageSize: [5616, 3744],
        name: "Sigma 8mm",
        outputSettings: { filterIrrelevantSrcImages: false, targetRes: 1000 },
      },
    ]),
  renamePreset: () => Promise.resolve(),
  savePreset: () => Promise.resolve(),
}));

jest.mock("@/lib/generic-image-metadata", () => ({
  useGenericImageMetadata: () => undefined,
}));

import type { pipelineConfig } from "../src/app/pipeline/(pipeline-configuration)/config-provider";
import { PresetBar } from "../src/app/pipeline/preset-bar";

// Radix Select drives its trigger with pointer capture and scrolls the active
// item into view; jsdom implements neither.
function stubPointerApis() {
  Element.prototype.hasPointerCapture ||= () => false;
  Element.prototype.setPointerCapture ||= () => undefined;
  Element.prototype.releasePointerCapture ||= () => undefined;
  Element.prototype.scrollIntoView ||= () => undefined;
}

function Harness({
  onApplyLensMask,
}: {
  onApplyLensMask: (
    mask: pipelineConfig["lensMask"],
    drawnAgainst: [number, number] | null
  ) => void;
}) {
  const form = useForm<pipelineConfig>({
    defaultValues: { lensMask: { radius: 0, x: 0, y: 0 } },
  });

  return (
    <PresetBar
      form={form}
      maskImagePath={undefined}
      onApplyLensMask={onApplyLensMask}
    />
  );
}

describe("applying a preset", () => {
  it("hands the lens mask and its origin to the caller", async () => {
    stubPointerApis();
    const applied: {
      drawnAgainst: [number, number] | null;
      mask: pipelineConfig["lensMask"];
    }[] = [];

    render(
      <Harness
        onApplyLensMask={(mask, drawnAgainst) => {
          applied.push({ drawnAgainst, mask });
        }}
      />
    );

    // The listbox opens on a key rather than a click: Radix opens it from
    // pointerdown, which jsdom has no pointer events to deliver.
    fireEvent.keyDown(screen.getByRole("combobox"), { key: " " });
    const item = await screen.findByText("Sigma 8mm");
    fireEvent.click(item);

    await waitFor(() =>
      expect(applied).toEqual([
        { drawnAgainst: [5616, 3744], mask: PRESET_MASK },
      ])
    );
  });
});
