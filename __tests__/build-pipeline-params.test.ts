import { describe, expect, it } from "@jest/globals";
import type { pipelineConfig } from "../src/app/home-page/(pipeline-configuration)/config-provider";
import { buildPipelineParams } from "../src/app/home-page/build-pipeline-params";

const settings = {
  dcrawEmuPath: "/tools/dcraw",
  hdrgenPath: "/tools/hdrgen",
  outputPath: "/out",
  radiancePath: "/radiance/bin",
};

const config: pipelineConfig = {
  cameraResponseLocation: "/cal/response.rsp",
  correctionFiles: {
    calibrationFactor: null,
    fisheye: null,
    neutralDensity: null,
    vignetting: null,
  },
  fisheyeView: {
    horizontalViewDegrees: 180,
    projection: "vta",
    verticalViewDegrees: 180,
  },
  inputSets: [],
  lensMask: { radius: 100, x: 300, y: 164 },
  outputSettings: { filterIrrelevantSrcImages: false, targetRes: 1000 },
  validityCheck: { measuredVerticalIlluminanceLux: null },
};

describe("buildPipelineParams", () => {
  it("sends the mask offset from the top as ytop", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"], "");

    expect(params.ytop).toBe(64);
    expect(params.xleft).toBe(200);
    expect(params.diameter).toBe(200);
  });

  it("forwards the selected projection", () => {
    const params = buildPipelineParams(
      { ...config, fisheyeView: { ...config.fisheyeView, projection: "vth" } },
      settings,
      ["a.jpg"],
      ""
    );

    expect(params.projection).toBe("vth");
  });

  it("forwards a measured vertical illuminance", () => {
    const params = buildPipelineParams(
      { ...config, validityCheck: { measuredVerticalIlluminanceLux: 1240 } },
      settings,
      ["a.jpg"],
      ""
    );

    expect(params.measuredVerticalIlluminance).toBe(1240);
  });

  it("sends null when no measurement was entered", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"], "");

    expect(params.measuredVerticalIlluminance).toBeNull();
  });

  it("no longer sends a ydown key", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"], "");

    expect(params).not.toHaveProperty("ydown");
  });

  it("forwards the set name so the output can be named after it", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"], "kitchen");

    expect(params.setName).toBe("kitchen");
  });

  // A single scene has no set to name, and Rust falls back to the plain
  // timestamp, which is what the app produced before batches existed.
  it("forwards an empty name unchanged", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"], "");

    expect(params.setName).toBe("");
  });
});
