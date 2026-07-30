/**
 * The adapter is tested with a fake host, so no Tauri and no wasm are needed.
 *
 * What matters here is the contract with the rest of the app: which files get
 * staged, what the outputs are called, and the order in which writes and
 * announcements happen -- the run history attributes outputs to a set by that
 * ordering.
 */

import { describe, expect, it } from "@jest/globals";
import type { PipelineStatusPayload } from "@/lib/pipeline/types";
import type { ExecuteOptions } from "./pipeline-worker-client";

/**
 * Stands in for the worker, which jsdom cannot provide and which has the
 * orchestrator's own tests behind it anyway.
 *
 * It still performs the staging reads, because the order of those is one of
 * the things these tests are about.
 */
function fakeExecute(): (options: ExecuteOptions) => Promise<{
  computedVerticalIlluminance: string | null;
  outputs: { bytes: Uint8Array; kind: "falsecolor" | "main" }[];
}> {
  return async (options: ExecuteOptions) => {
    const referenced = [
      ...options.params.inputImages,
      options.params.responseFunction,
      options.params.fisheyeCorrectionCal,
      options.params.vignettingCorrectionCal,
      options.params.neutralDensityCal,
      options.params.photometricAdjustmentCal,
    ].filter((path) => path !== "");
    for (const path of referenced) {
      // biome-ignore lint/performance/noAwaitInLoops: the order of these reads is precisely what the staging tests assert
      await options.read(path);
    }

    options.onStatus({
      kind: "step",
      message: "Merging exposures",
      progress: null,
      step: "merge_exposures",
    });

    return {
      computedVerticalIlluminance: "1234.5",
      outputs: [
        { bytes: new TextEncoder().encode("main"), kind: "main" as const },
        { bytes: new TextEncoder().encode("fc"), kind: "falsecolor" as const },
      ],
    };
  };
}

import {
  type BuiltPipelineParams,
  type HostFilesystem,
  joinOutputPath,
  runWasmPipeline,
} from "./run-wasm-pipeline";

function fakeHost(): HostFilesystem & {
  reads: string[];
  writes: string[];
  statuses: PipelineStatusPayload[];
  outputs: string[];
} {
  const reads: string[] = [];
  const writes: string[] = [];
  const statuses: PipelineStatusPayload[] = [];
  const outputs: string[] = [];
  return {
    emitOutput: (path) => {
      outputs.push(path);
      return Promise.resolve();
    },
    emitStatus: (payload) => {
      statuses.push(payload);
      return Promise.resolve();
    },
    outputs,
    read: (path) => {
      reads.push(path);
      return Promise.resolve(new TextEncoder().encode(`bytes:${path}`));
    },
    reads,
    // The host decides where an output lands: a real path on the desktop, a
    // filename in a browser where the download folder is not the app's to
    // choose. The fake mirrors the desktop, since that is what the assertions
    // about announced paths are about.
    save: (directory: string, name: string) => {
      const location = `${directory}/${name}`;
      writes.push(location);
      return Promise.resolve({ downloaded: false, location, name });
    },
    statuses,
    writes,
  };
}

function params(
  overrides: Partial<BuiltPipelineParams> = {}
): BuiltPipelineParams {
  return {
    diameter: 3612,
    fisheyeCorrectionCal: "",
    horizontalAngle: 180,
    inputImages: ["/in/a.jpg", "/in/b.jpg"],
    legendHeight: "",
    legendWidth: "",
    measuredVerticalIlluminance: null,
    neutralDensityCal: "",
    outputPath: "/out",
    photometricAdjustmentCal: "",
    projection: "vta",
    responseFunction: "",
    scaleLabel: "",
    scaleLevels: "",
    scaleLimit: "",
    setName: "JPEG",
    verticalAngle: 180,
    vignettingCorrectionCal: "",
    xdim: 1000,
    xleft: 1019,
    ydim: 1000,
    ytop: 66,
    ...overrides,
  };
}

const FIXED_NOW = () => new Date(2026, 6, 29, 11, 41, 49);

describe("staging", () => {
  it("reads every referenced file before running", async () => {
    const host = fakeHost();
    await runWasmPipeline({
      execute: fakeExecute(),
      host,
      now: FIXED_NOW,
      params: params({
        fisheyeCorrectionCal: "/cal/f.cal",
        responseFunction: "/rsp/r.rsp",
        vignettingCorrectionCal: "/cal/v.cal",
      }),
    });

    expect(host.reads).toEqual([
      "/in/a.jpg",
      "/in/b.jpg",
      "/rsp/r.rsp",
      "/cal/f.cal",
      "/cal/v.cal",
    ]);
  });

  it("skips the correction files that were not supplied", async () => {
    const host = fakeHost();
    await runWasmPipeline({
      execute: fakeExecute(),
      host,
      now: FIXED_NOW,
      params: params(),
    });
    expect(host.reads).toEqual(["/in/a.jpg", "/in/b.jpg"]);
  });
});

describe("outputs", () => {
  it("names them the way the Rust pipeline does", async () => {
    const host = fakeHost();
    const written = await runWasmPipeline({
      execute: fakeExecute(),
      host,
      now: FIXED_NOW,
      params: params(),
    });

    expect(written).toEqual([
      "/out/JPEG_2026-07-29_11-41-49.hdr",
      "/out/JPEG_2026-07-29_11-41-49_fc.hdr",
    ]);
  });

  it("announces each output only after it is written", async () => {
    // Run history attributes outputs to a set by this ordering: a set that
    // failed must have announced none.
    const order: string[] = [];
    const host = fakeHost();
    const wrappedHost: HostFilesystem = {
      ...host,
      emitOutput: (path) => {
        order.push(`announce:${path}`);
        return Promise.resolve();
      },
      save: (directory, name, data) => {
        order.push(`write:${directory}/${name}`);
        return host.save(directory, name, data);
      },
    };

    await runWasmPipeline({
      execute: fakeExecute(),
      host: wrappedHost,
      now: FIXED_NOW,
      params: params(),
    });

    // Both files are written, but only the HDR picture is announced -- Rust
    // does the same, and the viewer opens the most recently announced output,
    // so announcing the false-colour image opened that instead.
    expect(order).toEqual([
      "write:/out/JPEG_2026-07-29_11-41-49.hdr",
      "announce:/out/JPEG_2026-07-29_11-41-49.hdr",
      "write:/out/JPEG_2026-07-29_11-41-49_fc.hdr",
    ]);
  });

  it("falls back to the timestamp when the set is unnamed", async () => {
    const host = fakeHost();
    const written = await runWasmPipeline({
      execute: fakeExecute(),
      host,
      now: FIXED_NOW,
      params: params({ setName: "" }),
    });
    expect(written[0]).toBe("/out/2026-07-29_11-41-49.hdr");
  });
});

describe("status", () => {
  it("forwards the pipeline's events unchanged", async () => {
    const host = fakeHost();
    await runWasmPipeline({
      execute: fakeExecute(),
      host,
      now: FIXED_NOW,
      params: params(),
    });

    expect(host.statuses[0]).toMatchObject({
      kind: "step",
      step: "merge_exposures",
    });
  });

  it("finishes with the same completion message as Rust", async () => {
    const host = fakeHost();
    await runWasmPipeline({
      execute: fakeExecute(),
      host,
      now: FIXED_NOW,
      params: params(),
    });

    expect(host.statuses.at(-1)).toMatchObject({
      kind: "done",
      message: "Finished JPEG.",
    });
  });
});

describe("joinOutputPath", () => {
  it("keeps the separator the host already used", () => {
    expect(joinOutputPath("/out", "a.hdr")).toBe("/out/a.hdr");
    expect(joinOutputPath("C:\\out", "a.hdr")).toBe("C:\\out\\a.hdr");
  });

  it("does not double the separator", () => {
    expect(joinOutputPath("/out/", "a.hdr")).toBe("/out/a.hdr");
    expect(joinOutputPath("C:\\out\\", "a.hdr")).toBe("C:\\out\\a.hdr");
  });
});

describe("required numeric fields", () => {
  it("names the field the user has to fill in", async () => {
    // The form's numeric inputs are nullable until filled. Failing here with
    // the field name beats surfacing as a NaN in an argument list later.
    const host = fakeHost();
    await expect(
      runWasmPipeline({
        execute: fakeExecute(),
        host,
        now: FIXED_NOW,
        params: params({ verticalAngle: null }),
      })
    ).rejects.toMatchObject({
      detail: { field: "verticalAngle", kind: "invalid_input" },
    });
  });

  it("rejects a NaN as firmly as a null", async () => {
    const host = fakeHost();
    await expect(
      runWasmPipeline({
        execute: fakeExecute(),
        host,
        now: FIXED_NOW,
        params: params({ xdim: Number.NaN }),
      })
    ).rejects.toMatchObject({ detail: { field: "xdim" } });
  });

  it("fails before staging anything", async () => {
    const host = fakeHost();
    await expect(
      runWasmPipeline({
        execute: fakeExecute(),
        host,
        now: FIXED_NOW,
        params: params({ diameter: null }),
      })
    ).rejects.toThrow();
    expect(host.reads).toEqual([]);
  });
});

describe("which output the viewer opens", () => {
  it("announces the HDR picture and not the false-colour one", async () => {
    // The viewer opens the most recently announced output. Rust announces only
    // the picture, so announcing both here opened the false-colour image.
    const host = fakeHost();
    await runWasmPipeline({
      execute: fakeExecute(),
      host,
      now: FIXED_NOW,
      params: params(),
    });

    expect(host.outputs).toEqual(["/out/JPEG_2026-07-29_11-41-49.hdr"]);
    // still written, just not announced
    expect(host.writes).toContain("/out/JPEG_2026-07-29_11-41-49_fc.hdr");
  });
});
