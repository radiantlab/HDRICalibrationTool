import { describe, expect, it } from "@jest/globals";
import type { pipelineConfig } from "@/app/pipeline/(pipeline-configuration)/config-provider";
import {
  describeRunBlocker,
  describeRunProblem,
} from "@/app/pipeline/preflight";

/** The example Canon 5D Mark III CR2s, as dcraw_emu renders them. */
const CR2: [number, number] = [5796, 3870];

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
    // The values ImageLensInformation.txt gives for this rig: diameter 3728
    // centred, which is xleft 1024 and ytop 54.
    lensMask: { radius: 1864, x: 2888, y: 1918 },
    outputSettings: { filterIrrelevantSrcImages: true, targetRes: 1000 },
    validityCheck: { measuredVerticalIlluminanceLux: null },
    ...overrides,
  };
}

describe("describeRunBlocker", () => {
  it("passes a configuration the example rig would actually use", () => {
    expect(describeRunBlocker(makeConfig(), CR2)).toBeNull();
  });

  it("rejects a zero radius", () => {
    const config = makeConfig({ lensMask: { radius: 0, x: 100, y: 100 } });

    expect(describeRunBlocker(config, CR2)).toContain("Lens mask radius");
  });

  it("rejects a non-positive target resolution", () => {
    const config = makeConfig({
      outputSettings: { filterIrrelevantSrcImages: true, targetRes: 0 },
    });

    expect(describeRunBlocker(config, CR2)).toContain("Target resolution");
  });

  it("rejects a non-positive view angle", () => {
    const config = makeConfig({
      fisheyeView: {
        horizontalViewDegrees: 180,
        projection: "vta",
        verticalViewDegrees: 0,
      },
    });

    expect(describeRunBlocker(config, CR2)).toContain("Fisheye view angles");
  });

  // The reported failure. Radius 1950 gives diameter 3900, taller than the
  // 3870 px image, and crop only said so after merging every exposure.
  it("rejects the oversized mask that crop rejected mid-run", () => {
    const config = makeConfig({ lensMask: { radius: 1950, x: 2898, y: 1933 } });
    const blocker = describeRunBlocker(config, CR2);

    expect(blocker).toContain("3900");
    expect(blocker).toContain("Reduce the radius to 1935 or less");
  });

  // The mask is checked against the picture, so with no picture measured yet
  // there is nothing to check; the pipeline's own guard still applies.
  it("does not block on mask fit before the image has been measured", () => {
    const config = makeConfig({ lensMask: { radius: 1950, x: 2898, y: 1933 } });

    expect(describeRunBlocker(config, null)).toBeNull();
  });

  // Order matters: a radius of 0 is also a mask that cannot fit, and the
  // clearer message is the one about the radius.
  it("reports the radius before the fit when both are wrong", () => {
    const config = makeConfig({ lensMask: { radius: 0, x: 0, y: 0 } });

    expect(describeRunBlocker(config, CR2)).toContain("Lens mask radius");
  });
});

const MENTIONS_SETTINGS = /Settings/;
const MENTIONS_RADIUS = /radius/i;

describe("describeRunProblem", () => {
  // The suite injects `__TAURI_INTERNALS__`, so the host reads as desktop
  // unless a case removes it. That is the half where an output folder exists
  // to be wrong about.
  it("reports an output folder that is not there", async () => {
    const problem = await describeRunProblem(
      makeConfig(),
      CR2,
      "/gone/missing"
    );
    expect(problem).toContain("/gone/missing");
    expect(problem).toMatch(MENTIONS_SETTINGS);
  });

  // The app fills this in at startup, so an empty value means "not resolved
  // yet" rather than "wrong". Refusing to run on it would block a first run.
  it("says nothing when no folder has been chosen yet", async () => {
    await expect(describeRunProblem(makeConfig(), CR2, "")).resolves.toBeNull();
  });

  // A browser has no output folder to be wrong about: the download lands
  // wherever the browser decides, so there is nothing here to check.
  it("finds no problem in a browser, whatever the path says", async () => {
    // `isTauri` tests for the key's presence, so it has to leave rather than
    // be set to undefined. Reflect.deleteProperty says that without tripping
    // the lint rule against `delete`.
    const host = globalThis as Record<string, unknown>;
    const internals = host.__TAURI_INTERNALS__;
    Reflect.deleteProperty(host, "__TAURI_INTERNALS__");
    try {
      await expect(
        describeRunProblem(makeConfig(), CR2, "/gone/missing")
      ).resolves.toBeNull();
    } finally {
      host.__TAURI_INTERNALS__ = internals;
    }
  });

  // Answered from the configuration alone, so it is reported without the
  // filesystem being consulted at all.
  it("reports a configuration blocker ahead of the folder", async () => {
    const problem = await describeRunProblem(
      makeConfig({ lensMask: { radius: 0, x: 100, y: 100 } }),
      CR2,
      "/gone/missing"
    );
    expect(problem).toMatch(MENTIONS_RADIUS);
  });
});
