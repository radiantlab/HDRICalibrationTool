import { describe, expect, it } from "@jest/globals";
import type { pipelineConfig } from "@/app/home-page/(pipeline-configuration)/config-provider";
import { unsuppliedCalibrationFiles } from "@/app/home-page/calibration-files";

/** The form's own defaults: every calibration field starts empty. */
function makeConfig(overrides: Partial<pipelineConfig> = {}): pipelineConfig {
  return {
    cameraResponseLocation: null,
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
    lensMask: { radius: 100, x: 200, y: 200 },
    outputSettings: { filterIrrelevantSrcImages: true, targetRes: 1000 },
    validityCheck: { measuredVerticalIlluminanceLux: null },
    ...overrides,
  };
}

describe("unsuppliedCalibrationFiles", () => {
  // The state a fresh form is in. It used to validate clean and run.
  it("names all five when nothing has been uploaded", () => {
    expect(unsuppliedCalibrationFiles(makeConfig())).toEqual([
      "Camera response",
      "Fisheye correction",
      "Vignetting correction",
      "Neutral density correction",
      "Calibration factor",
    ]);
  });

  it("names nothing when every file has been uploaded", () => {
    const config = makeConfig({
      cameraResponseLocation: "/calib/camera.rsp",
      correctionFiles: {
        calibrationFactor: "/calib/factor.cal",
        fisheye: "/calib/fisheye.cal",
        neutralDensity: "/calib/nd.cal",
        vignetting: "/calib/vignetting.cal",
      },
    });

    expect(unsuppliedCalibrationFiles(config)).toEqual([]);
  });

  it("names only the ones left out", () => {
    const config = makeConfig({
      cameraResponseLocation: "/calib/camera.rsp",
      correctionFiles: {
        calibrationFactor: null,
        fisheye: "/calib/fisheye.cal",
        neutralDensity: null,
        vignetting: "/calib/vignetting.cal",
      },
    });

    expect(unsuppliedCalibrationFiles(config)).toEqual([
      "Neutral density correction",
      "Calibration factor",
    ]);
  });

  // The field accepts pasted text, so whitespace is reachable. Letting it
  // through here moves the failure to somewhere much harder to diagnose.
  it("treats a whitespace-only path as unsupplied", () => {
    const config = makeConfig({ cameraResponseLocation: "   " });

    expect(unsuppliedCalibrationFiles(config)).toContain("Camera response");
  });

  it("reports in the order the form asks for the files", () => {
    const config = makeConfig({
      correctionFiles: {
        calibrationFactor: null,
        fisheye: null,
        neutralDensity: "/calib/nd.cal",
        vignetting: "/calib/vignetting.cal",
      },
    });

    expect(unsuppliedCalibrationFiles(config)).toEqual([
      "Camera response",
      "Fisheye correction",
      "Calibration factor",
    ]);
  });
});
