/**
 * The orchestrator is tested against a fake runner rather than real tools.
 *
 * What matters here is the **sequence of tool invocations and their argv**.
 * That is the thing a refactor can silently change, and the thing that has to
 * keep matching `pipeline.rs`. Running real wasm would test Emscripten, not
 * the port.
 */

import { describe, expect, it } from "@jest/globals";
import { isRawImage, runPipeline } from "./orchestrator";
import {
  PipelineError,
  type PipelineParams,
  type PipelineStatusPayload,
  type ToolIo,
  type ToolResult,
  type ToolRunner,
} from "./types";

interface Invocation {
  args: string[];
  io?: ToolIo;
  tool: string;
}

/** The exact key set serde emits, which the frontend's zod schema expects. */
const SNAKE_CASE_KEYS = /^(kind|message|progress|step|set_index|set_total)$/;

const KEPT_COUNT = /kept \d+ of 2/;

const PICTURE = new TextEncoder().encode(
  "#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 3870 +X 5796\nPIXELS"
);

/**
 * Paths a call produces rather than consumes.
 *
 * Three tools name their own output instead of writing to stdout, and each
 * does it differently: `hdrgen ... -o <out>`, `dcraw_emu -Z <out> <in>`, and
 * `ra_xyze -r -o <in> <out>` where `-o` is a flag and the output is last.
 */
function outputsOf(tool: string, args: string[], io?: ToolIo): Set<string> {
  const outputs = new Set<string>();
  if (io?.stdout) {
    outputs.add(io.stdout);
  }
  const namedOutput = { dcraw_emu: "-Z", hdrgen: "-o" }[tool];
  if (namedOutput) {
    const value = args[args.indexOf(namedOutput) + 1];
    if (value) {
      outputs.add(value);
    }
  }
  if (tool === "ra_xyze") {
    const last = args.at(-1);
    if (last) {
      outputs.add(last);
    }
  }
  return outputs;
}

/** Indexing a filtered array is `T | undefined` under noUncheckedIndexedAccess. */
function call(invocations: Invocation[], index: number): Invocation {
  const found = invocations[index];
  if (!found) {
    throw new Error(
      `expected at least ${index + 1} invocation(s), saw ${invocations.length}`
    );
  }
  return found;
}

function defaultStdout(tool: string): string {
  if (tool === "evalglare") {
    return "1234.5\n";
  }
  if (tool === "pextrem") {
    // falsecolor parses these two lines to label the extrema.
    return "193 207 3.070068e-02 3.118896e-02 1.995850e-02\n211 202 1.292969e+00 1.308594e+00 1.300781e+00\n";
  }
  return "";
}

class FakeRunner implements ToolRunner {
  readonly calls: Invocation[] = [];
  readonly files = new Map<string, Uint8Array>();
  /** Per-tool overrides, so a single stage can be made to fail. */
  results: Record<string, Partial<ToolResult>> = {};

  constructor(inputs: string[] = []) {
    // Seed the caller-supplied inputs; every /work/ file must be produced by
    // a stage, which is what makes the dependency check meaningful.
    for (const input of inputs) {
      this.files.set(input, PICTURE);
    }
  }

  run(tool: string, args: string[], io?: ToolIo): Promise<ToolResult> {
    this.calls.push({ args, io, tool });

    // Model the data flow, not just the calls. Without this a mistyped
    // intermediate filename passes every ordering assertion while producing a
    // pipeline where one stage reads a file no stage ever wrote -- which is the
    // most likely defect in a port like this, and only shows up at runtime.
    const outputs = outputsOf(tool, args, io);
    const consumed = [
      io?.stdin,
      ...args.filter((arg) => arg.startsWith("/work/")),
    ];
    for (const path of consumed) {
      if (path && !outputs.has(path) && !this.files.has(path)) {
        throw new Error(
          `${tool} reads ${path}, which no earlier stage produced. ` +
            `Files so far: ${Array.from(this.files.keys()).join(", ")}`
        );
      }
    }

    const override = this.results[tool] ?? {};
    // Record what this stage produced, so the next one can consume it.
    for (const produced of Array.from(outputs)) {
      this.files.set(produced, PICTURE);
    }

    return Promise.resolve({
      code: override.code ?? 0,
      stderr: override.stderr ?? "",
      stdout: override.stdout ?? defaultStdout(tool),
    });
  }

  writeFile(path: string, data: Uint8Array | string): Promise<void> {
    this.files.set(
      path,
      typeof data === "string" ? new TextEncoder().encode(data) : data
    );
    return Promise.resolve();
  }

  readFile(path: string): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) {
      return Promise.reject(new Error(`no such file ${path}`));
    }
    return Promise.resolve(file);
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }

  toolsInOrder(): string[] {
    return this.calls.map((invocation) => invocation.tool);
  }

  callsTo(tool: string): Invocation[] {
    return this.calls.filter((invocation) => invocation.tool === tool);
  }
}

function params(overrides: Partial<PipelineParams> = {}): PipelineParams {
  return {
    diameter: 3612,
    fisheyeCorrectionCal: "",
    horizontalAngle: 180,
    inputImages: ["/in/a.jpg", "/in/b.jpg"],
    legendHeight: "",
    legendWidth: "",
    measuredVerticalIlluminance: null,
    neutralDensityCal: "",
    photometricAdjustmentCal: "",
    projection: "vta",
    responseFunction: "",
    scaleLabel: "",
    scaleLevels: "",
    scaleLimit: "",
    setName: "set",
    verticalAngle: 180,
    vignettingCorrectionCal: "",
    xdim: 1000,
    xleft: 1019,
    ydim: 1000,
    ytop: 66,
    ...overrides,
  };
}

describe("stage ordering", () => {
  it("runs the twelve stages in the order pipeline.rs does", async () => {
    const runner = new FakeRunner();
    await runPipeline({ params: params(), runner });

    // falsecolor is not a tool -- it is a TypeScript reimplementation that
    // drives pcomb/pcompos/psign/pextrem -- so the stage sequence is the
    // prefix up to it, and its own calls follow.
    const stages = runner.toolsInOrder();
    expect(stages.slice(0, 7)).toEqual([
      "hdrgen",
      "ra_xyze",
      "pcompos",
      "pfilt", // diameter 3612 > 1000, so the resize runs
      "getinfo", // view angles
      "evalglare",
      "getinfo", // results
    ]);
    expect(stages.slice(7)).toContain("pextrem");
  });

  it("writes the view header BEFORE evalglare reads it", async () => {
    // evalglare takes its view geometry from the header, so this ordering is a
    // correctness requirement, not a preference.
    const runner = new FakeRunner();
    await runPipeline({ params: params(), runner });

    const order = runner.toolsInOrder();
    expect(order.indexOf("getinfo")).toBeLessThan(order.indexOf("evalglare"));
    expect(call(runner.callsTo("evalglare"), 0).args).toContain(
      "/work/header_editing_view.hdr"
    );
  });

  it("skips the resize when the mask is not larger than the target", async () => {
    const runner = new FakeRunner();
    await runPipeline({ params: params({ diameter: 800 }), runner });
    expect(runner.toolsInOrder()).not.toContain("pfilt");
  });

  it("applies only the corrections that were supplied, in order", async () => {
    const runner = new FakeRunner();
    await runPipeline({
      params: params({
        fisheyeCorrectionCal: "/cal/fisheye.cal",
        photometricAdjustmentCal: "/cal/cf.cal",
      }),
      runner,
    });

    // falsecolor drives pcomb too, so count only the correction stages --
    // the ones writing a correction output.
    const pcomb = runner
      .callsTo("pcomb")
      .filter((invocation) => !invocation.io?.stdout?.includes("/fc_"));
    expect(pcomb).toHaveLength(2);
    expect(call(pcomb, 0).args).toEqual([
      "-f",
      "/cal/fisheye.cal",
      "/work/resize.hdr",
    ]);
    // the photometric adjustment is last and suppresses the header
    expect(call(pcomb, 1).args).toEqual([
      "-h",
      "-f",
      "/cal/cf.cal",
      "/work/projection_adjustment.hdr",
    ]);
  });

  it("chains each stage onto the previous stage's output", async () => {
    const runner = new FakeRunner();
    await runPipeline({
      params: params({
        neutralDensityCal: "/cal/nd.cal",
        vignettingCorrectionCal: "/cal/v.cal",
      }),
      runner,
    });

    expect(call(runner.callsTo("pcomb"), 0).args.at(-1)).toBe(
      "/work/resize.hdr"
    );
    expect(call(runner.callsTo("pcomb"), 1).args.at(-1)).toBe(
      "/work/vignetting_correction.hdr"
    );
    expect(call(runner.callsTo("getinfo"), 0).io?.stdin).toBe(
      "/work/neutral_density.hdr"
    );
  });
});

describe("RAW input", () => {
  it("converts each RAW frame and merges with a square response", async () => {
    const runner = new FakeRunner();
    await runPipeline({
      params: params({ inputImages: ["/in/capt01.CR2", "/in/capt02.CR2"] }),
      runner,
    });

    const dcraw = runner.callsTo("dcraw_emu");
    expect(dcraw).toHaveLength(2);
    expect(call(dcraw, 0).args.at(-1)).toBe("/in/capt01.CR2");
    expect(call(dcraw, 0).args).toContain("/work/input1.tiff");

    const hdrgen = call(runner.callsTo("hdrgen"), 0).args;
    expect(hdrgen).toContain("/work/input1.tiff");
    expect(hdrgen).toContain("/work/input2.tiff");
    expect(hdrgen[hdrgen.indexOf("-r") + 1]).toBe("/work/sqr.rsp");
    expect(new TextDecoder().decode(runner.files.get("/work/sqr.rsp"))).toBe(
      "2 1 0 0\n2 1 0 0\n2 1 0 0\n"
    );
  });

  it("leaves JPEG input alone and lets hdrgen recover the response", async () => {
    const runner = new FakeRunner();
    await runPipeline({ params: params(), runner });

    expect(runner.callsTo("dcraw_emu")).toHaveLength(0);
    expect(call(runner.callsTo("hdrgen"), 0).args).not.toContain("-r");
  });

  it("recognises RAW extensions case-insensitively", () => {
    expect(isRawImage("a.CR2")).toBe(true);
    expect(isRawImage("a.cr2")).toBe(true);
    expect(isRawImage("a.nef")).toBe(true);
    expect(isRawImage("a.jpg")).toBe(false);
    expect(isRawImage("noextension")).toBe(false);
  });
});

describe("evalglare", () => {
  it("accepts the nonzero exit -V returns on success", async () => {
    // evalglare -V prints the value and exits 1. Treating that as a failure
    // would break every run.
    const runner = new FakeRunner();
    runner.results.evalglare = { code: 1, stdout: "851.695895\n" };

    const result = await runPipeline({ params: params(), runner });
    expect(result.computedVerticalIlluminance).toBe("851.695895");
  });

  it("fails when evalglare produces no value at all", async () => {
    const runner = new FakeRunner();
    runner.results.evalglare = { code: 1, stderr: "fatal", stdout: "" };

    await expect(runPipeline({ params: params(), runner })).rejects.toThrow(
      PipelineError
    );
  });

  it("writes the reported value into the header", async () => {
    const runner = new FakeRunner();
    runner.results.evalglare = { code: 1, stdout: "42.5\n" };
    await runPipeline({
      params: params({ measuredVerticalIlluminance: 40 }),
      runner,
    });

    expect(call(runner.callsTo("getinfo"), 1).args).toEqual([
      "-a",
      "COMPUTED_VERTICAL_ILLUMINANCE=42.5",
      "MEASURED_VERTICAL_ILLUMINANCE=40",
    ]);
  });
});

describe("validation", () => {
  it("rejects an empty image set", async () => {
    await expect(
      runPipeline({
        params: params({ inputImages: [] }),
        runner: new FakeRunner(),
      })
    ).rejects.toMatchObject({
      detail: { field: "inputImages", kind: "invalid_input" },
    });
  });

  it("rejects an unsupported projection", async () => {
    await expect(
      runPipeline({
        params: params({ projection: "vtq" }),
        runner: new FakeRunner(),
      })
    ).rejects.toMatchObject({
      detail: { field: "projection", kind: "invalid_input" },
    });
  });

  it("reports which tool failed and with what arguments", async () => {
    const runner = new FakeRunner();
    runner.results.pfilt = { code: 2, stderr: "pfilt: bad resolution" };

    await expect(
      runPipeline({ params: params(), runner })
    ).rejects.toMatchObject({
      detail: { code: 2, kind: "command", tool: "pfilt" },
    });
  });
});

describe("status events", () => {
  it("emits snake_case keys the existing zod schema accepts", async () => {
    // pipeline-status-context.tsx validates against serde's output. camelCase
    // here would be silently rejected.
    const events: PipelineStatusPayload[] = [];
    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params(),
      runner: new FakeRunner(),
    });

    for (const event of events) {
      for (const key of Object.keys(event)) {
        expect(key).toMatch(SNAKE_CASE_KEYS);
      }
    }
  });

  it("advances progress to exactly 100", async () => {
    const events: PipelineStatusPayload[] = [];
    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params(),
      runner: new FakeRunner(),
    });

    const progresses = events
      .filter((event) => event.kind === "progress")
      .map((event) => event.progress);
    expect(progresses.at(-1)).toBe(100);
    // monotonic
    expect([...progresses].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
      progresses
    );
  });

  it("finishes with a done event", async () => {
    const events: PipelineStatusPayload[] = [];
    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params(),
      runner: new FakeRunner(),
    });
    expect(events.at(-1)).toMatchObject({ kind: "done", progress: 100 });
  });
});

describe("cancellation", () => {
  it("stops between stages rather than mid-stage", async () => {
    const runner = new FakeRunner();
    let calls = 0;
    await expect(
      runPipeline({
        params: params(),
        runner,
        shouldStop: () => {
          calls += 1;
          return calls > 1;
        },
      })
    ).rejects.toThrow(PipelineError);

    // hdrgen and ra_xyze ran; nothing was left half-written
    expect(runner.toolsInOrder()).toEqual(["hdrgen", "ra_xyze"]);
  });
});

describe("calibration file resolution warnings", () => {
  const HARDCODED = "r=sqrt(sq(x-500)+sq(y-500))/500;\nro=sf*ri(1);\n";
  const ADAPTIVE = "xc : xres/2;\nyc : yres/2;\n";

  const warnings = (events: PipelineStatusPayload[]) =>
    events.filter((event) => event.kind === "warning");

  it("warns when a geometric .cal cannot adapt to the resolution", async () => {
    const runner = new FakeRunner();
    await runner.writeFile("/cal/vignetting.cal", HARDCODED);
    const events: PipelineStatusPayload[] = [];

    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params({ vignettingCorrectionCal: "/cal/vignetting.cal" }),
      runner,
    });

    const warning = warnings(events).find(
      (event) => event.step === "cal_check"
    );
    expect(warning?.message).toContain("vignetting.cal");
    expect(warning?.message).toContain("500");
  });

  it("stays quiet when the .cal derives its geometry from the picture", async () => {
    const runner = new FakeRunner();
    await runner.writeFile("/cal/fisheye.cal", ADAPTIVE);
    const events: PipelineStatusPayload[] = [];

    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params({ fisheyeCorrectionCal: "/cal/fisheye.cal" }),
      runner,
    });

    expect(warnings(events)).toHaveLength(0);
  });

  it("reports the resolution AFTER the resize, not the mask diameter", async () => {
    // The correction is applied to the resized picture, so 1000x1000 is the
    // resolution the constants have to match -- not the 3612 mask.
    const runner = new FakeRunner();
    await runner.writeFile("/cal/vignetting.cal", HARDCODED);
    const events: PipelineStatusPayload[] = [];

    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params({ vignettingCorrectionCal: "/cal/vignetting.cal" }),
      runner,
    });

    expect(
      warnings(events).find((event) => event.step === "cal_check")?.message
    ).toContain("1000x1000");
  });

  it("does not check the non-geometric corrections", async () => {
    // A photometric factor has no pixel coordinates to get wrong.
    const runner = new FakeRunner();
    await runner.writeFile("/cal/cf.cal", HARDCODED);
    const events: PipelineStatusPayload[] = [];

    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params({
        neutralDensityCal: "/cal/cf.cal",
        photometricAdjustmentCal: "/cal/cf.cal",
      }),
      runner,
    });

    expect(warnings(events)).toHaveLength(0);
  });

  it("warns but does not fail when the .cal cannot be read", async () => {
    const runner = new FakeRunner();
    const events: PipelineStatusPayload[] = [];

    // never written, so readFile rejects
    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params({ fisheyeCorrectionCal: "/cal/missing.cal" }),
      runner,
    });

    expect(
      warnings(events).find((event) => event.step === "cal_check")?.message
    ).toContain("Could not read the fisheye calibration file");
    // the run still completed
    expect(events.at(-1)).toMatchObject({ kind: "done" });
  });
});

describe("validity check", () => {
  const validityEvent = (events: PipelineStatusPayload[]) =>
    events.find((event) => event.step === "validity_check");

  const runWith = async (
    evalglareValue: string,
    measured: number | null
  ): Promise<PipelineStatusPayload[]> => {
    const runner = new FakeRunner();
    runner.results.evalglare = { code: 1, stdout: evalglareValue };
    const events: PipelineStatusPayload[] = [];
    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params({ measuredVerticalIlluminance: measured }),
      runner,
    });
    return events;
  };

  it("reports a pass as a step, not a warning", async () => {
    // A good result should not be shown to the operator as a problem.
    const event = validityEvent(await runWith("1050\n", 1000));
    expect(event).toMatchObject({ kind: "step" });
    expect(event?.message).toContain("Validity check passed");
  });

  it("reports a failure as a warning", async () => {
    const event = validityEvent(await runWith("1300\n", 1000));
    expect(event).toMatchObject({ kind: "warning" });
    expect(event?.message).toContain("FAILED");
  });

  it("reports the middle band as a warning too", async () => {
    const event = validityEvent(await runWith("1150\n", 1000));
    expect(event).toMatchObject({ kind: "warning" });
    expect(event?.message).toContain("above the 10% typically expected");
  });

  it("says nothing when no measurement was supplied", async () => {
    expect(validityEvent(await runWith("1050\n", null))).toBeUndefined();
  });

  it("warns when evalglare output is not a number", async () => {
    const event = validityEvent(await runWith("not a number\n", 1000));
    expect(event).toMatchObject({ kind: "warning" });
    expect(event?.message).toContain("the validity check was skipped");
  });
});

describe("image filtering", () => {
  const flat = (level: number) => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i += 1) {
      rgba.set([level, level, level, 255], i * 4);
    }
    return { height: 4, rgba, width: 4 };
  };

  it("merges only the frames the filter kept", async () => {
    const runner = new FakeRunner();
    const levels: Record<string, number> = {
      "/in/blown.jpg": 250,
      "/in/crushed.jpg": 5,
      "/in/mid.jpg": 128,
    };
    await runPipeline({
      decodeImage: (path) => Promise.resolve(flat(levels[path] ?? 0)),
      params: params({
        diameter: 4,
        filterImages: true,
        inputImages: ["/in/blown.jpg", "/in/mid.jpg", "/in/crushed.jpg"],
        xleft: 0,
        ytop: 0,
      }),
      runner,
    });

    const hdrgen = call(runner.callsTo("hdrgen"), 0).args;
    expect(hdrgen).toContain("/in/mid.jpg");
    expect(hdrgen).not.toContain("/in/blown.jpg");
  });

  it("merges every frame when filtering is off", async () => {
    const runner = new FakeRunner();
    await runPipeline({
      decodeImage: () => Promise.resolve(flat(128)),
      params: params({ filterImages: false }),
      runner,
    });
    expect(call(runner.callsTo("hdrgen"), 0).args).toContain("/in/a.jpg");
    expect(call(runner.callsTo("hdrgen"), 0).args).toContain("/in/b.jpg");
  });

  it("merges every frame when no decoder was supplied", async () => {
    // Filtering is an optimisation. A run without a decoder is correct, only
    // slower -- so it must not fail.
    const runner = new FakeRunner();
    await runPipeline({ params: params({ filterImages: true }), runner });
    expect(call(runner.callsTo("hdrgen"), 0).args).toContain("/in/b.jpg");
  });

  it("reports how many frames it kept", async () => {
    const events: PipelineStatusPayload[] = [];
    await runPipeline({
      decodeImage: () => Promise.resolve(flat(128)),
      emit: (payload) => events.push(payload),
      params: params({ diameter: 4, filterImages: true, xleft: 0, ytop: 0 }),
      runner: new FakeRunner(),
    });
    expect(
      events.find((event) => event.step === "filter_images")?.message
    ).toMatch(KEPT_COUNT);
  });
});
