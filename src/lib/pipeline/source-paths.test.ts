/**
 * The naming contract that keeps host paths out of picture headers.
 *
 * Every Radiance tool appends its own command line to the header of what it
 * writes, so any path handed to a tool is a path published in the output. The
 * observed case (#241) was a calibration file whose absolute path contained a
 * university email address, in every calibrated picture the tool produced.
 */

import { describe, expect, it } from "@jest/globals";
import { sanitizeSources } from "./source-paths";
import type { PipelineParams } from "./types";

function params(overrides: Partial<PipelineParams> = {}): PipelineParams {
  return {
    diameter: 3612,
    fisheyeCorrectionCal: "",
    horizontalAngle: 180,
    inputImages: [],
    legendHeight: "",
    legendWidth: "",
    neutralDensityCal: "",
    photometricAdjustmentCal: "",
    projection: "vta",
    responseFunction: "",
    scaleLabel: "",
    scaleLevels: "",
    scaleLimit: "",
    setName: "Images",
    verticalAngle: 180,
    vignettingCorrectionCal: "",
    xdim: 1000,
    xleft: 1019,
    ydim: 1000,
    ytop: 66,
    ...overrides,
  };
}

describe("sanitizeSources", () => {
  it("names frames by position and basename", () => {
    const { params: staged } = sanitizeSources(
      params({
        inputImages: [
          "/Users/someone/Pictures/bracket/DSC_0001.JPG",
          "/Users/someone/Pictures/bracket/DSC_0002.JPG",
        ],
      })
    );

    expect(staged.inputImages).toEqual([
      "/work/src/1-DSC_0001.JPG",
      "/work/src/2-DSC_0002.JPG",
    ]);
  });

  // Two directories can each hold a DSC_0001.JPG. Without the index they would
  // collide onto one staged file, and the merge would read the same frame
  // twice while reporting the right count.
  it("keeps same-named frames from different directories apart", () => {
    const { params: staged, sources } = sanitizeSources(
      params({
        inputImages: ["/a/DSC_0001.JPG", "/b/DSC_0001.JPG"],
      })
    );

    expect(new Set(staged.inputImages).size).toBe(2);
    expect(sources.get("/work/src/1-DSC_0001.JPG")).toBe("/a/DSC_0001.JPG");
    expect(sources.get("/work/src/2-DSC_0001.JPG")).toBe("/b/DSC_0001.JPG");
  });

  it("names each .cal after the correction it belongs to", () => {
    const { params: staged } = sanitizeSources(
      params({
        fisheyeCorrectionCal: "/cal/fisheye_corr.cal",
        neutralDensityCal: "/cal/NDfilter.cal",
        photometricAdjustmentCal: "/cal/CF_f5d6.cal",
        vignettingCorrectionCal: "/cal/vignetting.cal",
      })
    );

    expect(staged.fisheyeCorrectionCal).toBe(
      "/work/cal/fisheye-fisheye_corr.cal"
    );
    expect(staged.vignettingCorrectionCal).toBe(
      "/work/cal/vignetting-vignetting.cal"
    );
    expect(staged.neutralDensityCal).toBe("/work/cal/neutral-NDfilter.cal");
    expect(staged.photometricAdjustmentCal).toBe(
      "/work/cal/photometric-CF_f5d6.cal"
    );
  });

  // One file can legitimately serve two corrections. The slot prefix is what
  // stops the second staging overwriting the first under one key.
  it("keeps one file supplied to two slots apart", () => {
    const { params: staged, sources } = sanitizeSources(
      params({
        neutralDensityCal: "/cal/same.cal",
        photometricAdjustmentCal: "/cal/same.cal",
      })
    );

    expect(staged.neutralDensityCal).not.toBe(staged.photometricAdjustmentCal);
    expect(sources.get("/work/cal/neutral-same.cal")).toBe("/cal/same.cal");
    expect(sources.get("/work/cal/photometric-same.cal")).toBe("/cal/same.cal");
  });

  it("names the response function", () => {
    const { params: staged } = sanitizeSources(
      params({ responseFunction: "/Users/someone/resp/response_function.rsp" })
    );

    expect(staged.responseFunction).toBe(
      "/work/src/response-response_function.rsp"
    );
  });

  // An unsupplied slot is an empty string, which the orchestrator tests for to
  // decide whether the stage runs at all. Naming it would turn every run into
  // a fully calibrated one against files that do not exist.
  it("leaves unsupplied slots empty", () => {
    const { params: staged, sources } = sanitizeSources(params());

    expect(staged.fisheyeCorrectionCal).toBe("");
    expect(staged.responseFunction).toBe("");
    expect(sources.size).toBe(0);
  });

  // Run history records the executed inputs for display, and the form holds
  // the same strings. A user must keep seeing the file they picked.
  it("does not mutate the params it was given", () => {
    const original = params({
      inputImages: ["/a/DSC_0001.JPG"],
      photometricAdjustmentCal: "/cal/CF_f5d6.cal",
    });

    sanitizeSources(original);

    expect(original.inputImages).toEqual(["/a/DSC_0001.JPG"]);
    expect(original.photometricAdjustmentCal).toBe("/cal/CF_f5d6.cal");
  });

  // The staging loop fails on the first file it cannot read, and the comment
  // there says a missing *input* should fail before any wasm module loads.
  // That only holds while frames are staged first.
  it("orders the map inputs first, then response, then corrections", () => {
    const { sources } = sanitizeSources(
      params({
        fisheyeCorrectionCal: "/cal/f.cal",
        inputImages: ["/a/1.jpg"],
        responseFunction: "/r/resp.rsp",
      })
    );

    expect([...sources.keys()]).toEqual([
      "/work/src/1-1.jpg",
      "/work/src/response-resp.rsp",
      "/work/cal/fisheye-f.cal",
    ]);
  });

  it("carries every non-path field through untouched", () => {
    const { params: staged } = sanitizeSources(
      params({ inputImages: ["/a/1.jpg"], setName: "North facade" })
    );

    expect(staged.setName).toBe("North facade");
    expect(staged.diameter).toBe(3612);
    expect(staged.projection).toBe("vta");
  });
});
