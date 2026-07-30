/**
 * What the pipeline holds in JS memory while it runs.
 *
 * This is the constraint that actually binds a browser build, and it is not the
 * one #232 originally named. MEMFS keeps file bytes *outside* wasm linear
 * memory (#234, and a `dcraw_emu` instance measured at 16.0 MiB before and
 * after staging a 26 MB CR2), so intermediates never count against the wasm32
 * ceiling. They accumulate in `WasmToolRunner`'s own Map instead, and that Map
 * is only emptied by `clear()` at the end of a set.
 *
 * The RAW path is where it bites. A 10-frame CR2 bracket produces ten 67 MB
 * TIFFs on the way to the merge, and after `hdrgen` has run neither they nor
 * the ten source frames are named by any later stage: roughly 900 MB of a
 * ~1.1 GB peak, held for nothing.
 *
 * Sizes here are scaled down so the suite stays fast. What is asserted is the
 * shape -- which paths survive the merge and which do not -- which is
 * size-independent, plus the proportion, which is not.
 */

import { describe, expect, it } from "@jest/globals";
import { runPipeline } from "./orchestrator";
import type { PipelineParams } from "./types";
import {
  type EmscriptenModule,
  type ModuleFactory,
  WasmToolRunner,
} from "./wasm-runner";

/** Stand-in for a 67 MB TIFF, three orders of magnitude smaller. */
const LARGE = 64 * 1024;
/** Stand-in for a 23 MB source frame. */
const SOURCE = 22 * 1024;
const FRAMES = 10;

const header = "#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 3870 +X 5796\n";

function sized(bytes: number): Uint8Array {
  const body = new TextEncoder().encode(header);
  const out = new Uint8Array(Math.max(bytes, body.length));
  out.set(body);
  return out;
}

/**
 * Records what the runner is holding at the moment each tool runs.
 *
 * Sampling from inside `callMain` is what makes the peak observable: it is
 * reached during the merge, before the release that follows it.
 */
function fakeToolchain(runnerRef: { current?: WasmToolRunner }): {
  loader: (tool: string) => Promise<ModuleFactory>;
  samples: { retained: number; tool: string }[];
} {
  const samples: { retained: number; tool: string }[] = [];

  const loader = (tool: string): Promise<ModuleFactory> => {
    const factory: ModuleFactory = (options?: Record<string, unknown>) => {
      const memfs = new Map<string, Uint8Array>();
      const dirs = new Set<string>(["/"]);
      let stdoutPath: string | null = null;
      const printErr = options?.printErr as
        | ((line: string) => void)
        | undefined;

      const instance: EmscriptenModule = {
        callMain: (args: string[]) => {
          samples.push({
            retained: runnerRef.current?.retainedBytes() ?? 0,
            tool,
          });

          if (tool === "pextrem") {
            if (stdoutPath) {
              memfs.set(
                stdoutPath,
                new TextEncoder().encode(
                  "193 207 3.0e-02 3.1e-02 1.9e-02\n211 202 1.2e+00 1.3e+00 1.3e+00\n"
                )
              );
            }
            return 0;
          }
          if (tool === "evalglare") {
            printErr?.("warning");
            if (stdoutPath) {
              memfs.set(stdoutPath, new TextEncoder().encode("1234.5\n"));
            }
            return 1;
          }

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
            // dcraw_emu's TIFFs and the merged picture are the big ones; the
            // rest are cropped or resized and comparatively tiny.
            const big = tool === "dcraw_emu" || tool === "hdrgen";
            memfs.set(target, sized(big ? LARGE : 512));
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
        HEAPU8: new Uint8Array(1024),
      };
      return Promise.resolve(instance);
    };
    return Promise.resolve(factory);
  };

  return { loader, samples };
}

function rawParams(): PipelineParams {
  const inputImages = Array.from(
    { length: FRAMES },
    (_, index) => `/in/capt${String(index + 1).padStart(2, "0")}.CR2`
  );
  return {
    diameter: 3728,
    fisheyeCorrectionCal: "",
    horizontalAngle: 180,
    inputImages,
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
    setName: "CR2",
    verticalAngle: 180,
    vignettingCorrectionCal: "",
    xdim: 1000,
    xleft: 1024,
    ydim: 1000,
    ytop: 54,
  };
}

describe("memory held across a run", () => {
  it("releases the source frames and the converted TIFFs once the merge is done", async () => {
    const runnerRef: { current?: WasmToolRunner } = {};
    const toolchain = fakeToolchain(runnerRef);
    const runner = new WasmToolRunner({ load: toolchain.loader });
    runnerRef.current = runner;

    const params = rawParams();
    await Promise.all(
      params.inputImages.map((image) => runner.writeFile(image, sized(SOURCE)))
    );

    const staged = runner.retainedBytes();
    expect(staged).toBe(FRAMES * SOURCE);

    await runPipeline({ params, runner });

    // Nothing the merge consumed survives it.
    const converted = Array.from(
      { length: FRAMES },
      (_, index) => `/work/input${index + 1}.tiff`
    );
    const consumed = [...params.inputImages, ...converted];
    const present = await Promise.all(
      consumed.map((path) => runner.exists(path))
    );
    // Named rather than counted, so a failure says which files leaked.
    expect(consumed.filter((_, index) => present[index])).toEqual([]);

    // The peak is reached at the merge, with every source frame and every
    // converted TIFF resident at once. That is the number worth knowing.
    const peak = Math.max(...toolchain.samples.map((s) => s.retained));
    const atMerge = toolchain.samples.find((s) => s.tool === "hdrgen");
    expect(atMerge?.retained).toBe(peak);
    expect(peak).toBeGreaterThan(FRAMES * (SOURCE + LARGE) * 0.9);

    // And afterwards the run holds a small fraction of it, which is the whole
    // point: without the release this would stay at the peak to the end.
    expect(runner.retainedBytes()).toBeLessThan(peak * 0.1);
  });

  it("releases source images on the JPEG path too, including filtered-out frames", async () => {
    const runnerRef: { current?: WasmToolRunner } = {};
    const toolchain = fakeToolchain(runnerRef);
    const runner = new WasmToolRunner({ load: toolchain.loader });
    runnerRef.current = runner;

    const inputImages = ["/in/a.jpg", "/in/b.jpg", "/in/c.jpg"];
    await Promise.all(
      inputImages.map((image) => runner.writeFile(image, sized(SOURCE)))
    );

    await runPipeline({
      params: { ...rawParams(), inputImages, setName: "JPEG" },
      runner,
    });

    const present = await Promise.all(
      inputImages.map((image) => runner.exists(image))
    );
    expect(inputImages.filter((_, index) => present[index])).toEqual([]);
  });

  it("counts only what it still holds", async () => {
    const runner = new WasmToolRunner({
      load: () => Promise.reject(new Error("unused")),
    });
    await runner.writeFile("/a", new Uint8Array(100));
    await runner.writeFile("/b", new Uint8Array(250));
    expect(runner.retainedBytes()).toBe(350);

    runner.release(["/a", "/does-not-exist"]);
    expect(runner.retainedBytes()).toBe(250);

    runner.clear();
    expect(runner.retainedBytes()).toBe(0);
  });
});
