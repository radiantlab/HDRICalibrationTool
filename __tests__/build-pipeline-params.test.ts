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
  fisheyeView: { horizontalViewDegrees: 180, verticalViewDegrees: 180 },
  inputSets: [],
  lensMask: { radius: 100, x: 300, y: 164 },
  outputSettings: { filterIrrelevantSrcImages: false, targetRes: 1000 },
};

describe("buildPipelineParams", () => {
  it("sends the mask offset from the top as ytop", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"]);

    expect(params.ytop).toBe(64);
    expect(params.xleft).toBe(200);
    expect(params.diameter).toBe(200);
  });

  it("no longer sends a ydown key", () => {
    const params = buildPipelineParams(config, settings, ["a.jpg"]);

    expect(params).not.toHaveProperty("ydown");
  });
});
