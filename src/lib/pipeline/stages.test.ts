/**
 * Ported from the `mod tests` blocks in `src-tauri/src/pipeline/*.rs`.
 *
 * The cases are kept as they were rather than rewritten, because each one
 * records a specific bug. Porting them is most of the value of #231: the
 * argument lists are the part of the pipeline that encodes hard-won knowledge,
 * and nothing else checks that the TypeScript port reproduces them exactly.
 */

import { describe, expect, it } from "@jest/globals";
import {
  basename,
  cropArgs,
  dcrawArgs,
  evalglareArgs,
  falsecolorArgs,
  hdrgenArgs,
  headerEditingArgs,
  type LuminanceArgs,
  nullifyExposureArgs,
  pcombCalArgs,
  photometricArgs,
  provenanceEntries,
  readResolution,
  resizeArgs,
  SQUARE_RESPONSE,
} from "./stages";
import { PipelineError } from "./types";

describe("hdrgenArgs", () => {
  it("puts the cache size ahead of the filenames", () => {
    const args = hdrgenArgs(["a.jpg", "b.jpg"], "", "/work/out.hdr");
    expect(args.slice(0, 2)).toEqual(["-m", "1000"]);
    expect(args.indexOf("-m")).toBeLessThan(args.indexOf("a.jpg"));
  });

  it("appends the alignment and flare flags last", () => {
    const args = hdrgenArgs(["a.jpg"], "", "/work/out.hdr");
    expect(args.slice(-5)).toEqual(["-a", "-e", "-f", "-g", "-F"]);
  });

  it("passes a response function when one is supplied", () => {
    const args = hdrgenArgs(["a.jpg"], "/work/sqr.rsp", "/work/out.hdr");
    expect(args).toContain("-r");
    expect(args[args.indexOf("-r") + 1]).toBe("/work/sqr.rsp");
  });

  it("omits -r entirely when no response function is supplied", () => {
    // hdrgen recovers the curve itself in this case, which is the JPEG
    // workflow real users rely on.
    expect(hdrgenArgs(["a.jpg"], "", "/work/out.hdr")).not.toContain("-r");
  });
});

describe("SQUARE_RESPONSE", () => {
  it("is an order-2 polynomial per channel", () => {
    expect(SQUARE_RESPONSE).toBe("2 1 0 0\n2 1 0 0\n2 1 0 0\n");
    expect(SQUARE_RESPONSE.trimEnd().split("\n")).toHaveLength(3);
  });
});

describe("dcrawArgs", () => {
  it("keeps the flag order the pipeline has always used", () => {
    expect(dcrawArgs("in.CR2", "/work/input1.tiff")).toEqual([
      "-T",
      "-o",
      "1",
      "-W",
      "-j",
      "-q",
      "3",
      "-g",
      "2",
      "0",
      "-t",
      "0",
      "-b",
      "1.1",
      "-Z",
      "/work/input1.tiff",
      "in.CR2",
    ]);
  });
});

describe("cropArgs", () => {
  it("converts a top offset to the bottom offset Radiance wants", () => {
    // 4x8 picture, 4px circle flush with the top: pcompos must be told 4,
    // which is the offset that selects the top half.
    expect(cropArgs("in.hdr", 4, 0, 0, 8)).toEqual([
      "-x",
      "4",
      "-y",
      "4",
      "in.hdr",
      "-0",
      "-4",
    ]);
  });

  it("leaves a centred mask unchanged", () => {
    // 3744 tall, 3612 circle, centred: 66 from the top is also 66 from the
    // bottom, so existing centred setups produce identical output.
    const args = cropArgs("in.hdr", 3612, 1019, 66, 3744);
    expect(args.at(-1)).toBe("-66");
  });

  it("rejects a mask past the bottom edge", () => {
    expect(() => cropArgs("in.hdr", 4, 0, 5, 8)).toThrow(PipelineError);
    try {
      cropArgs("in.hdr", 4, 0, 5, 8);
    } catch (error) {
      expect((error as PipelineError).detail).toMatchObject({
        field: "ytop",
        kind: "invalid_input",
      });
    }
  });

  it("rejects a negative top offset", () => {
    expect(() => cropArgs("in.hdr", 4, 0, -1, 8)).toThrow(PipelineError);
  });
});

describe("falsecolorArgs", () => {
  const withLegend = (width: string, height: string): LuminanceArgs => ({
    legendHeight: height,
    legendWidth: width,
    scaleLabel: "cd/m2",
    scaleLevels: "8",
    scaleLimit: "1000",
  });

  it("passes the legend dimensions as two options", () => {
    const joined = falsecolorArgs(withLegend("100", "200"), "in.hdr").join(" ");
    expect(joined).toContain("-lw 100 -lh 200");
    expect(joined).not.toContain("-lw/-lh");
  });

  it("omits the legend when a dimension is missing", () => {
    const args = falsecolorArgs(withLegend("", "200"), "in.hdr");
    expect(args).not.toContain("-lw");
    expect(args).not.toContain("-lh");
  });

  it("omits the legend when a dimension is not numeric", () => {
    // "100 200" is the exact string that used to arrive when -lw and -lh were
    // passed as one argument.
    expect(falsecolorArgs(withLegend("100 200", ""), "in.hdr")).not.toContain(
      "-lw"
    );
  });

  it("falls back to a plain conversion when there is no scale label", () => {
    expect(
      falsecolorArgs({ ...withLegend("100", "200"), scaleLabel: "" }, "in.hdr")
    ).toEqual(["-e", "-i", "in.hdr"]);
  });
});

describe("headerEditingArgs", () => {
  it("writes exactly one VIEW entry", () => {
    const args = headerEditingArgs({
      view: { horizontalAngle: 180, projection: "vta", verticalAngle: 180 },
    });
    expect(args).toEqual(["-a", "VIEW= -vta -vv 180 -vh 180"]);
  });

  it("trims the trailing newline evalglare prints", () => {
    const args = headerEditingArgs({ evalglareValue: "1234.5\n" });
    expect(args).toEqual(["-a", "COMPUTED_VERTICAL_ILLUMINANCE=1234.5"]);
  });

  it("carries the measured value through when supplied", () => {
    const args = headerEditingArgs({
      evalglareValue: "12",
      measuredIlluminance: "34",
    });
    expect(args).toEqual([
      "-a",
      "COMPUTED_VERTICAL_ILLUMINANCE=12",
      "MEASURED_VERTICAL_ILLUMINANCE=34",
    ]);
  });
});

describe("the remaining stage arguments", () => {
  it("nullify exposure writes to a named output rather than stdout", () => {
    expect(nullifyExposureArgs("in.hdr", "out.hdr")).toEqual([
      "-r",
      "-o",
      "in.hdr",
      "out.hdr",
    ]);
  });

  it("resize asks pfilt for a single pass", () => {
    expect(resizeArgs("in.hdr", 1000, 1000)).toEqual([
      "-1",
      "-x",
      "1000",
      "-y",
      "1000",
      "in.hdr",
    ]);
  });

  it("the three geometric corrections differ only in the file they pass", () => {
    expect(pcombCalArgs("fisheye.cal", "in.hdr")).toEqual([
      "-f",
      "fisheye.cal",
      "in.hdr",
    ]);
    expect(pcombCalArgs("vignetting.cal", "in.hdr")).toEqual([
      "-f",
      "vignetting.cal",
      "in.hdr",
    ]);
  });

  // Not tidiness, and not the parity with a deleted Rust file it was once
  // justified by. Without `-h` every correction nests the `EXPOSURE=` line
  // that `pcompos` wrote one tab deeper, and evalglare exits rather than read
  // a picture whose header has `EXPOSURE=` and a tab on the same line
  // (`pictool.c:214`). Removing this flag stopped the pipeline producing
  // anything at all. See #241.
  it("the photometric adjustment suppresses the inherited header", () => {
    expect(photometricArgs("cf.cal", "in.hdr")).toEqual([
      "-h",
      "-f",
      "cf.cal",
      "in.hdr",
    ]);
  });

  it("evalglare runs in vertical-illuminance mode", () => {
    expect(evalglareArgs("in.hdr", "vta", 180, 180)).toEqual([
      "-vta",
      "-vv",
      "180",
      "-vh",
      "180",
      "-V",
      "in.hdr",
    ]);
  });
});

describe("readResolution", () => {
  const picture = (resolution: string) =>
    new TextEncoder().encode(
      `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n${resolution}\nPIXELS`
    );

  it("reads the dimensions that follow the header", () => {
    expect(readResolution(picture("-Y 3870 +X 5796"))).toEqual({
      height: 3870,
      width: 5796,
    });
  });

  it("tolerates the padded spacing getinfo emits", () => {
    expect(readResolution(picture("-Y     3744 +X     5616"))).toEqual({
      height: 3744,
      width: 5616,
    });
  });

  it("rejects a picture with no header terminator", () => {
    expect(() =>
      readResolution(new TextEncoder().encode("#?RADIANCE\n"))
    ).toThrow(PipelineError);
  });

  it("rejects an orientation the pipeline does not produce", () => {
    // +Y/-X would mean a flipped scanline order, which nothing upstream emits.
    // Better to fail than to crop the wrong half of the picture.
    expect(() => readResolution(picture("+Y 100 -X 100"))).toThrow(
      PipelineError
    );
  });
});

describe("basename", () => {
  it("keeps the last segment of a POSIX path", () => {
    expect(basename("/Users/someone/Drive/cal files/CF_f5d6.cal")).toBe(
      "CF_f5d6.cal"
    );
  });

  // Tauri hands back native paths, so a Windows run carries backslashes.
  // Splitting on "/" alone would return the whole string and leak exactly what
  // this helper exists to remove.
  it("keeps the last segment of a Windows path", () => {
    expect(basename("C:\\Users\\someone\\Pictures\\DSC_0001.JPG")).toBe(
      "DSC_0001.JPG"
    );
  });

  it("leaves a bare filename alone", () => {
    expect(basename("CF_f5d6.cal")).toBe("CF_f5d6.cal");
  });

  // A path ending in a separator has no segment to keep, and an empty string
  // would produce a staged path ending in "-", which reads as a truncation.
  it("falls back to a placeholder when there is no segment", () => {
    expect(basename("/some/directory/")).toBe("file");
  });
});

describe("provenanceEntries", () => {
  // What hdrgen actually writes, taken from a real merge of the reference
  // bracket rather than invented, including the argv[0] placeholder the
  // WebAssembly build reports.
  const MERGE_HEADER = [
    "#?RADIANCE",
    "CAMERA= Canon Canon EOS 5D Mark II version v.0",
    "./this.program created HDR image from '2-IMG_6956.JPG' '1-IMG_6955.JPG'",
    "Removed lens flare",
    "CAPDATE= 2017:07:13 15:45:30",
    "EXPOSURE=1.6402e-01",
    "PRIMARIES= 0.6400 0.3300 0.2900 0.6000 0.1500 0.0600 0.3333 0.3333",
    "FORMAT=32-bit_rle_rgbe",
  ].join("\n");

  it("restates the capture, without hdrgen's argv[0]", () => {
    const entries = provenanceEntries({
      calibration: [],
      mergeHeader: MERGE_HEADER,
    });

    expect(entries).toContain("CAMERA= Canon Canon EOS 5D Mark II version v.0");
    expect(entries).toContain("CAPDATE= 2017:07:13 15:45:30");
    expect(entries).toContain("MERGED_FROM= '2-IMG_6956.JPG' '1-IMG_6955.JPG'");
    expect(entries).toContain("LENS_FLARE= removed");
    // `./this.program` is Emscripten's placeholder and says nothing true.
    expect(entries.join("\n")).not.toContain("this.program");
  });

  // The whole reason provenance is re-stated rather than inherited: a tab
  // beside EXPOSURE= is what makes evalglare refuse a picture, and someone
  // will run evalglare on the finished output.
  it("never emits an exposure entry or a tab", () => {
    const entries = provenanceEntries({
      calibration: ["photometric-CF_f8.cal"],
      mergeHeader: `${MERGE_HEADER}\n\tEXPOSURE=1.0000e+00`,
    });

    expect(entries.join("\n")).not.toContain("EXPOSURE=");
    expect(entries.join("\n")).not.toContain("\t");
  });

  it("names the calibration files by basename", () => {
    const entries = provenanceEntries({
      calibration: ["fisheye-fisheye_corr.cal", "photometric-CF_f8.cal"],
      mergeHeader: MERGE_HEADER,
    });

    expect(entries).toContain(
      "CALIBRATION_FILES= fisheye-fisheye_corr.cal photometric-CF_f8.cal"
    );
  });

  it("says nothing it was not told", () => {
    const entries = provenanceEntries({
      calibration: [],
      mergeHeader: "#?RADIANCE\nFORMAT=32-bit_rle_rgbe",
    });

    expect(entries).toEqual([]);
  });

  it("appends its entries after the values the pipeline computed", () => {
    const args = headerEditingArgs({
      evalglareValue: "900.9",
      provenance: ["CAMERA= Canon", "CAPDATE= 2017:07:13 15:45:30"],
    });

    expect(args).toEqual([
      "-a",
      "COMPUTED_VERTICAL_ILLUMINANCE=900.9",
      "CAMERA= Canon",
      "CAPDATE= 2017:07:13 15:45:30",
    ]);
  });
});
