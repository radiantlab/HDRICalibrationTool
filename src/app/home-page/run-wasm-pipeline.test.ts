/**
 * The adapter is tested with a fake host, so no Tauri and no wasm are needed.
 *
 * What matters here is the contract with the rest of the app: which files get
 * staged, what the outputs are called, and the order in which writes and
 * announcements happen -- the run history attributes outputs to a set by that
 * ordering.
 */

import { describe, expect, it } from "@jest/globals";
import type { PipelineStatusPayload, ToolRunner } from "@/lib/pipeline/types";

/** Stands in for WasmToolRunner: a Map, with no wasm anywhere near it. */
function fakeRunner(): ToolRunner & { clear: () => void } {
  const files = new Map<string, Uint8Array>();
  return {
    clear: () => files.clear(),
    exists: (path) => Promise.resolve(files.has(path)),
    readFile: (path) =>
      Promise.resolve(
        files.get(path) ?? new TextEncoder().encode(`stub:${path}`)
      ),
    run: () => Promise.resolve({ code: 0, stderr: "", stdout: "" }),
    writeFile: (path, data) => {
      files.set(
        path,
        typeof data === "string" ? new TextEncoder().encode(data) : data
      );
      return Promise.resolve();
    },
  };
}

/** Stands in for the orchestrator, which has its own tests. */
const fakeRun = ({ emit }: { emit?: (p: PipelineStatusPayload) => void }) => {
  emit?.({
    kind: "step",
    message: "Merging exposures",
    progress: null,
    step: "merge_exposures",
  });
  return Promise.resolve({
    computedVerticalIlluminance: "1234.5",
    falsecolorPath: "/work/falsecolor.hdr",
    outputPath: "/work/header_editing.hdr",
  });
};

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
    statuses,
    write: (path) => {
      writes.push(path);
      return Promise.resolve();
    },
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
      host,
      makeRunner: fakeRunner,
      now: FIXED_NOW,
      params: params({
        fisheyeCorrectionCal: "/cal/f.cal",
        responseFunction: "/rsp/r.rsp",
        vignettingCorrectionCal: "/cal/v.cal",
      }),
      run: fakeRun,
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
      host,
      makeRunner: fakeRunner,
      now: FIXED_NOW,
      params: params(),
      run: fakeRun,
    });
    expect(host.reads).toEqual(["/in/a.jpg", "/in/b.jpg"]);
  });
});

describe("outputs", () => {
  it("names them the way the Rust pipeline does", async () => {
    const host = fakeHost();
    const written = await runWasmPipeline({
      host,
      makeRunner: fakeRunner,
      now: FIXED_NOW,
      params: params(),
      run: fakeRun,
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
      write: (path, data) => {
        order.push(`write:${path}`);
        return host.write(path, data);
      },
    };

    await runWasmPipeline({
      host: wrappedHost,
      makeRunner: fakeRunner,
      now: FIXED_NOW,
      params: params(),
      run: fakeRun,
    });

    expect(order).toEqual([
      "write:/out/JPEG_2026-07-29_11-41-49.hdr",
      "announce:/out/JPEG_2026-07-29_11-41-49.hdr",
      "write:/out/JPEG_2026-07-29_11-41-49_fc.hdr",
      "announce:/out/JPEG_2026-07-29_11-41-49_fc.hdr",
    ]);
  });

  it("falls back to the timestamp when the set is unnamed", async () => {
    const host = fakeHost();
    const written = await runWasmPipeline({
      host,
      makeRunner: fakeRunner,
      now: FIXED_NOW,
      params: params({ setName: "" }),
      run: fakeRun,
    });
    expect(written[0]).toBe("/out/2026-07-29_11-41-49.hdr");
  });
});

describe("status", () => {
  it("forwards the pipeline's events unchanged", async () => {
    const host = fakeHost();
    await runWasmPipeline({
      host,
      makeRunner: fakeRunner,
      now: FIXED_NOW,
      params: params(),
      run: fakeRun,
    });

    expect(host.statuses[0]).toMatchObject({
      kind: "step",
      step: "merge_exposures",
    });
  });

  it("finishes with the same completion message as Rust", async () => {
    const host = fakeHost();
    await runWasmPipeline({
      host,
      makeRunner: fakeRunner,
      now: FIXED_NOW,
      params: params(),
      run: fakeRun,
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
        host,
        makeRunner: fakeRunner,
        now: FIXED_NOW,
        params: params({ verticalAngle: null }),
        run: fakeRun,
      })
    ).rejects.toMatchObject({
      detail: { field: "verticalAngle", kind: "invalid_input" },
    });
  });

  it("rejects a NaN as firmly as a null", async () => {
    const host = fakeHost();
    await expect(
      runWasmPipeline({
        host,
        makeRunner: fakeRunner,
        now: FIXED_NOW,
        params: params({ xdim: Number.NaN }),
        run: fakeRun,
      })
    ).rejects.toMatchObject({ detail: { field: "xdim" } });
  });

  it("fails before staging anything", async () => {
    const host = fakeHost();
    await expect(
      runWasmPipeline({
        host,
        makeRunner: fakeRunner,
        now: FIXED_NOW,
        params: params({ diameter: null }),
        run: fakeRun,
      })
    ).rejects.toThrow();
    expect(host.reads).toEqual([]);
  });
});
