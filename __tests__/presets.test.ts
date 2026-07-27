import { describe, expect, it } from "@jest/globals";
import type { pipelineConfig } from "../src/app/home-page/(pipeline-configuration)/config-provider";
import { presetFields, sha256Hex } from "../src/lib/presets";

describe("sha256Hex", () => {
  it("hashes deterministically", async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3]));
    const b = await sha256Hex(new Uint8Array([1, 2, 3]));
    const c = await sha256Hex(new Uint8Array([1, 2, 4]));

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

describe("presetFields", () => {
  const config: pipelineConfig = {
    cameraResponseLocation: "/cal/response.rsp",
    correctionFiles: {
      calibrationFactor: "/cal/cf.cal",
      fisheye: "/cal/fisheye.cal",
      neutralDensity: null,
      vignetting: "/cal/vig.cal",
    },
    fisheyeView: {
      horizontalViewDegrees: 186,
      projection: "vta",
      verticalViewDegrees: 186,
    },
    inputSets: [],
    lensMask: { radius: 1806, x: 2825, y: 1864 },
    outputSettings: { filterIrrelevantSrcImages: true, targetRes: 1000 },
    validityCheck: { measuredVerticalIlluminanceLux: 1240 },
  };

  it("keeps the one-time setup material", () => {
    const fields = presetFields(config);

    expect(fields.fisheyeView.verticalViewDegrees).toBe(186);
    expect(fields.outputSettings.targetRes).toBe(1000);
    expect(fields.lensMask).toEqual({ radius: 1806, x: 2825, y: 1864 });
  });

  it("excludes per-capture material", () => {
    const fields = presetFields(config) as Record<string, unknown>;

    expect(fields.inputSets).toBeUndefined();
    expect(fields.validityCheck).toBeUndefined();
  });
});
