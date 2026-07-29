/**
 * The orchestrator driving the real `WasmToolRunner`, with only Emscripten
 * faked.
 *
 * The unit tests either fake the runner (orchestrator.test.ts) or drive the
 * runner directly (wasm-runner.test.ts). Neither checks that the two fit
 * together -- that the paths the orchestrator asks for are the paths the runner
 * produces, and that a twelve-stage chain survives being copied between
 * instances. That seam is what this covers.
 *
 * The fake tools do the minimum to be believable: they emit a Radiance header
 * with a resolution, because the crop stage parses one out of the merged
 * picture and the whole run stops if it cannot.
 */

import { describe, expect, it } from "@jest/globals";
import { runPipeline } from "./orchestrator";
import type { PipelineParams, PipelineStatusPayload } from "./types";
import {
  type EmscriptenModule,
  type ModuleFactory,
  WasmToolRunner,
} from "./wasm-runner";

const picture = (width: number, height: number, body = "PIXELS") =>
  `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n${body}`;

/**
 * A MEMFS-alike backed by a Map, plus argv conventions for the handful of
 * tools that name their own output.
 */
function fakeToolchain(): {
  loader: (tool: string) => Promise<ModuleFactory>;
  instanceCount: () => number;
  ran: { tool: string; args: string[] }[];
} {
  const ran: { tool: string; args: string[] }[] = [];
  let instances = 0;

  const loader = (tool: string): Promise<ModuleFactory> => {
    const factory: ModuleFactory = (options?: Record<string, unknown>) => {
      instances += 1;
      const memfs = new Map<string, Uint8Array>();
      const dirs = new Set<string>(["/"]);
      let stdoutPath: string | null = null;
      const printErr = options?.printErr as
        | ((line: string) => void)
        | undefined;

      const write = (path: string, text: string) =>
        memfs.set(path, new TextEncoder().encode(text));

      const instance: EmscriptenModule = {
        callMain: (args: string[]) => {
          ran.push({ args, tool });

          if (tool === "pextrem") {
            // falsecolor parses these two lines to label the extrema.
            if (stdoutPath) {
              write(
                stdoutPath,
                "193 207 3.070068e-02 3.118896e-02 1.995850e-02\n211 202 1.292969e+00 1.308594e+00 1.300781e+00\n"
              );
            }
            return 0;
          }

          if (tool === "evalglare") {
            printErr?.("warning: search radius less than 3 pixels");
            if (stdoutPath) {
              write(stdoutPath, "1234.5\n");
            }
            // -V prints the value and exits 1, which is success for this mode
            return 1;
          }

          // The three tools that name their own output instead of writing to
          // stdout, and the flag each uses to do it.
          const outputFlag: Record<string, string> = {
            dcraw_emu: "-Z",
            hdrgen: "-o",
          };
          const flag = outputFlag[tool];
          let named: string | undefined;
          if (flag) {
            named = args[args.indexOf(flag) + 1];
          } else if (tool === "ra_xyze") {
            named = args.at(-1);
          }

          const target = named ?? stdoutPath;
          if (target) {
            write(target, picture(5796, 3870, `${tool}-OUT`));
          }
          return 0;
        },
        FS: {
          chdir: () => undefined,
          close: () => undefined,
          mkdir: (path: string) => {
            if (dirs.has(path)) {
              throw new Error("EEXIST");
            }
            dirs.add(path);
          },
          open: (path: string, flags: string) => {
            if (flags === "w") {
              stdoutPath = path;
            }
            return {};
          },
          readdir: (dir: string) =>
            Array.from(memfs.keys())
              .filter((path) => path.startsWith(`${dir}/`))
              .map((path) => path.slice(dir.length + 1))
              .filter((name) => !name.includes("/")),
          readFile: (path: string) => {
            const file = memfs.get(path);
            if (!file) {
              throw new Error(`ENOENT ${path}`);
            }
            return file;
          },
          streams: [0, 1, 2],
          unlink: (path: string) => {
            memfs.delete(path);
          },
          writeFile: (path: string, data: Uint8Array) => {
            const parent = path.slice(0, path.lastIndexOf("/"));
            if (parent && !dirs.has(parent)) {
              throw new Error(`ENOENT: no parent directory ${parent}`);
            }
            memfs.set(path, data);
          },
        },
        HEAPU8: new Uint8Array(16 * 1024 * 1024),
      };
      return Promise.resolve(instance);
    };
    return Promise.resolve(factory);
  };

  return { instanceCount: () => instances, loader, ran };
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

describe("orchestrator over the wasm runner", () => {
  it("runs a JPEG set end to end", async () => {
    const toolchain = fakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/in/a.jpg", "A");
    await runner.writeFile("/in/b.jpg", "B");

    const events: PipelineStatusPayload[] = [];
    const result = await runPipeline({
      emit: (payload) => events.push(payload),
      params: params(),
      runner,
    });

    const tools = toolchain.ran.map((call) => call.tool);
    expect(tools.slice(0, 7)).toEqual([
      "hdrgen",
      "ra_xyze",
      "pcompos",
      "pfilt",
      "getinfo",
      "evalglare",
      "getinfo",
    ]);
    // falsecolor follows as its own tool calls, not as a "falsecolor" tool
    expect(tools).toContain("pextrem");
    expect(tools).not.toContain("falsecolor");
    expect(result.computedVerticalIlluminance).toBe("1234.5");
    expect(events.at(-1)).toMatchObject({ kind: "done", progress: 100 });
  });

  it("leaves the finished picture readable from the runner", async () => {
    const toolchain = fakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/in/a.jpg", "A");

    const result = await runPipeline({
      params: params({ inputImages: ["/in/a.jpg"] }),
      runner,
    });

    const output = new TextDecoder().decode(
      await runner.readFile(result.outputPath)
    );
    expect(output).toContain("#?RADIANCE");
    expect(await runner.exists(result.falsecolorPath ?? "")).toBe(true);
  });

  it("uses one module instance per stage", async () => {
    // Eight stages here, so eight instances -- one main() each.
    const toolchain = fakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/in/a.jpg", "A");

    await runPipeline({
      params: params({ inputImages: ["/in/a.jpg"] }),
      runner,
    });

    expect(toolchain.instanceCount()).toBe(toolchain.ran.length);
  });

  it("carries every intermediate across the instance boundary", async () => {
    // Each stage reads what the previous one wrote, through a copy out of one
    // MEMFS and into the next. If that broke, a stage would fail on ENOENT.
    const toolchain = fakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/in/a.jpg", "A");

    await runPipeline({
      params: params({ inputImages: ["/in/a.jpg"] }),
      runner,
    });

    const intermediates = [
      "merge_exposures.hdr",
      "nullify_exposure_value.hdr",
      "crop.hdr",
      "resize.hdr",
      "header_editing_view.hdr",
      "header_editing.hdr",
      "falsecolor.hdr",
    ];
    const present = await Promise.all(
      intermediates.map((name) => runner.exists(`/work/${name}`))
    );
    expect(present).toEqual(intermediates.map(() => true));
  });

  it("converts RAW input and merges against a square response", async () => {
    const toolchain = fakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/in/capt01.CR2", "RAW1");
    await runner.writeFile("/in/capt02.CR2", "RAW2");

    await runPipeline({
      params: params({ inputImages: ["/in/capt01.CR2", "/in/capt02.CR2"] }),
      runner,
    });

    const dcraw = toolchain.ran.filter((call) => call.tool === "dcraw_emu");
    expect(dcraw).toHaveLength(2);

    const hdrgen = toolchain.ran.find((call) => call.tool === "hdrgen");
    expect(hdrgen?.args).toContain("/work/input1.tiff");
    expect(hdrgen?.args[hdrgen.args.indexOf("-r") + 1]).toBe("/work/sqr.rsp");
  });

  it("surfaces a tool failure as a PipelineError naming the tool", async () => {
    const toolchain = fakeToolchain();
    // a runner whose pfilt writes nothing and exits nonzero
    const failing = {
      load: async (tool: string) => {
        const factory = await toolchain.loader(tool);
        if (tool !== "pfilt") {
          return factory;
        }
        return async (options?: Record<string, unknown>) => {
          const instance = await factory(options);
          instance.callMain = () => 2;
          return instance;
        };
      },
    };
    const runner = new WasmToolRunner(failing);
    await runner.writeFile("/in/a.jpg", "A");

    await expect(
      runPipeline({ params: params({ inputImages: ["/in/a.jpg"] }), runner })
    ).rejects.toMatchObject({
      detail: { code: 2, kind: "command", tool: "pfilt" },
    });
  });

  it("reads the .cal file through the runner for the resolution warning", async () => {
    const toolchain = fakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/in/a.jpg", "A");
    await runner.writeFile("/cal/v.cal", "r=sqrt(sq(x-500)+sq(y-500))/500;");

    const events: PipelineStatusPayload[] = [];
    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params({
        inputImages: ["/in/a.jpg"],
        vignettingCorrectionCal: "/cal/v.cal",
      }),
      runner,
    });

    expect(
      events.find((event) => event.step === "cal_check")?.message
    ).toContain("1000x1000");
  });
});
