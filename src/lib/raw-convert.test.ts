/**
 * Converting one frame, with no cache in the way.
 *
 * These two assertions used to live in `raw-preview.test.ts`, where the cache
 * tests paid for the converter's Emscripten fake. They belong to the module
 * that runs the tool, which is now this one.
 */

import { describe, expect, it } from "@jest/globals";
import type { EmscriptenModule, ModuleFactory } from "./pipeline/wasm-runner";
import { WasmToolRunner } from "./pipeline/wasm-runner";
import { convertRaw } from "./raw-convert";

/** Records the argv every `callMain` was given. */
function fakeLoader(outputBytes = 1024) {
  const runs: string[][] = [];
  const load = (_tool: string): Promise<ModuleFactory> => {
    const factory: ModuleFactory = () => {
      const memfs = new Map<string, Uint8Array>();
      const dirs = new Set<string>(["/"]);
      const instance: EmscriptenModule = {
        callMain: (args: string[]) => {
          runs.push(args);
          const target = args[args.indexOf("-Z") + 1];
          if (target) {
            memfs.set(target, new Uint8Array(outputBytes));
          }
          return 0;
        },
        FS: {
          chdir: () => undefined,
          close: () => undefined,
          mkdir: (dir: string) => {
            if (dirs.has(dir)) {
              throw new Error("EEXIST");
            }
            dirs.add(dir);
          },
          open: () => ({}),
          readdir: (dir: string) =>
            Array.from(memfs.keys())
              .filter((p) => p.startsWith(`${dir}/`))
              .map((p) => p.slice(dir.length + 1)),
          readFile: (p: string) => {
            const file = memfs.get(p);
            if (!file) {
              throw new Error(`ENOENT ${p}`);
            }
            return file;
          },
          streams: [0, 1, 2],
          unlink: (p: string) => {
            memfs.delete(p);
          },
          writeFile: (p: string, data: Uint8Array) => {
            memfs.set(p, data);
          },
        },
        HEAPU8: new Uint8Array(1024),
      };
      return Promise.resolve(instance);
    };
    return Promise.resolve(factory);
  };
  return { load, runs };
}

describe("converting one RAW frame", () => {
  it("uses the same argv the pipeline does", async () => {
    const { load, runs } = fakeLoader();
    const runner = new WasmToolRunner({ load });

    await convertRaw(runner, "/in/capt01.CR2", new Uint8Array(64));

    // The frame is staged under its own basename, because dcraw_emu reports
    // errors against the name it was given and a path outside /work would
    // need its parent directories created.
    expect(runs[0]).toEqual([
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
      "/work/preview.tiff",
      "/work/capt01.CR2",
    ]);
  });

  it("reports a nonzero exit rather than returning an empty result", async () => {
    const load = (_tool: string): Promise<ModuleFactory> => {
      const factory: ModuleFactory = (options?: Record<string, unknown>) => {
        (options?.printErr as ((line: string) => void) | undefined)?.(
          "Cannot open /work/a.CR2: Unsupported file format or not RAW file"
        );
        return Promise.resolve({
          callMain: () => 2,
          FS: {
            chdir: () => undefined,
            close: () => undefined,
            mkdir: () => undefined,
            open: () => ({}),
            readdir: () => [],
            readFile: () => {
              throw new Error("ENOENT");
            },
            streams: [0, 1, 2],
            unlink: () => undefined,
            writeFile: () => undefined,
          },
          HEAPU8: new Uint8Array(8),
        } as EmscriptenModule);
      };
      return Promise.resolve(factory);
    };

    const failure = await convertRaw(
      new WasmToolRunner({ load }),
      "/in/a.CR2",
      new Uint8Array(4)
    ).catch((error: unknown) => error as Error);

    expect(failure).toBeInstanceOf(Error);
    // Both halves matter: the exit code says it failed, the stderr says why.
    expect((failure as Error).message).toContain("exit 2");
    expect((failure as Error).message).toContain("Unsupported file format");
  });
});
