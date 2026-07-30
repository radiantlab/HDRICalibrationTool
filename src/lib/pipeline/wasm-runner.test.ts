/**
 * The WASM runner is tested against a fake Emscripten module.
 *
 * Real wasm is exercised elsewhere: #234 ran hdrgen and the Radiance tools in
 * Chromium and WebKit against the reference brackets. What is worth testing
 * here is the *plumbing this class does around* a module -- which files it
 * stages, how it redirects stdio, what it copies back, and that it never
 * reuses an instance. Those are the parts that can silently drift.
 */

import { describe, expect, it } from "@jest/globals";
import {
  type EmscriptenModule,
  type ModuleFactory,
  WasmToolRunner,
} from "./wasm-runner";

interface FakeInstance extends EmscriptenModule {
  readonly closedFds: number[];
  readonly memfs: Map<string, Uint8Array>;
  readonly opened: { path: string; flags: string }[];
  readonly ranWith: string[][];
}

interface FakeToolBehaviour {
  exitCode?: number;
  heapBytes?: number;
  stderr?: string[];
  /** Files the tool writes, given its argv. */
  writes?: (args: string[]) => Record<string, string>;
}

/** Records every instance so tests can assert one-instance-per-invocation. */
class FakeToolchain {
  readonly instances: FakeInstance[] = [];
  readonly factoryCalls: string[] = [];

  private readonly behaviour: Record<string, FakeToolBehaviour>;

  constructor(behaviour: Record<string, FakeToolBehaviour> = {}) {
    this.behaviour = behaviour;
  }

  loader = (tool: string): Promise<ModuleFactory> => {
    this.factoryCalls.push(tool);
    const behaviour = this.behaviour[tool] ?? {};

    const factory: ModuleFactory = (options?: Record<string, unknown>) => {
      const memfs = new Map<string, Uint8Array>();
      const opened: { path: string; flags: string }[] = [];
      const closedFds: number[] = [];
      const ranWith: string[][] = [];
      const printErr = options?.printErr as
        | ((line: string) => void)
        | undefined;

      const instance: FakeInstance = {
        callMain: (args: string[]) => {
          ranWith.push(args);
          for (const line of behaviour.stderr ?? []) {
            printErr?.(line);
          }
          for (const [path, body] of Object.entries(
            behaviour.writes?.(args) ?? {}
          )) {
            memfs.set(path, new TextEncoder().encode(body));
          }
          return behaviour.exitCode ?? 0;
        },
        closedFds,
        FS: {
          chdir: () => undefined,
          close: (stream: unknown) => closedFds.push(stream as number),
          mkdir: () => undefined,
          open: (path: string, flags: string) => {
            opened.push({ flags, path });
            return opened.length;
          },
          readdir: () => [".", "..", ...Array.from(memfs.keys()).map(base)],
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
            memfs.set(path, data);
          },
        },
        HEAPU8: new Uint8Array(behaviour.heapBytes ?? 16 * 1024 * 1024),
        memfs,
        opened,
        ranWith,
      };
      this.instances.push(instance);
      return Promise.resolve(instance);
    };

    return Promise.resolve(factory);
  };
}

function base(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

const decode = (data: Uint8Array) => new TextDecoder().decode(data);

/** Indexing is `T | undefined` under noUncheckedIndexedAccess. */
function instanceAt(toolchain: FakeToolchain, index: number): FakeInstance {
  const instance = toolchain.instances[index];
  if (!instance) {
    throw new Error(
      `expected at least ${index + 1} instance(s), saw ${toolchain.instances.length}`
    );
  }
  return instance;
}

describe("instance lifecycle", () => {
  it("creates a fresh instance for every invocation", async () => {
    // EXIT_RUNTIME=1 means one main() per instance, and discarding the
    // instance is what reclaims its heap.
    const toolchain = new FakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });

    await runner.run("getinfo", ["-a", "x"]);
    await runner.run("getinfo", ["-a", "y"]);

    expect(toolchain.instances).toHaveLength(2);
    expect(toolchain.instances[0]).not.toBe(toolchain.instances[1]);
  });

  it("loads each tool's factory only once", async () => {
    const toolchain = new FakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });

    await runner.run("getinfo", []);
    await runner.run("getinfo", []);
    await runner.run("pcomb", []);

    expect(toolchain.factoryCalls).toEqual(["getinfo", "pcomb"]);
  });

  it("reports the peak heap for each run", async () => {
    const toolchain = new FakeToolchain({
      hdrgen: { heapBytes: 2 * 1024 * 1024 },
    });
    const peaks: [string, number][] = [];
    const runner = new WasmToolRunner({
      load: toolchain.loader,
      onHeapPeak: (tool, bytes) => peaks.push([tool, bytes]),
    });

    await runner.run("hdrgen", []);
    expect(peaks).toEqual([["hdrgen", 2 * 1024 * 1024]]);
  });
});

describe("staging inputs", () => {
  it("stages only the files this invocation names", async () => {
    // Staging everything would re-copy every intermediate on every stage.
    const toolchain = new FakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/work/wanted.hdr", "A");
    await runner.writeFile("/work/unrelated.hdr", "B");

    await runner.run("pcomb", ["-f", "/work/wanted.hdr"]);

    const staged = instanceAt(toolchain, 0).memfs;
    expect(staged.has("/work/wanted.hdr")).toBe(true);
    expect(staged.has("/work/unrelated.hdr")).toBe(false);
  });

  it("stages the stdin file even though it is not in argv", async () => {
    const toolchain = new FakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/work/in.hdr", "A");

    await runner.run("getinfo", ["-a", "VIEW= -vta"], {
      stdin: "/work/in.hdr",
      stdout: "/work/out.hdr",
    });

    expect(instanceAt(toolchain, 0).memfs.has("/work/in.hdr")).toBe(true);
  });

  it("ignores argv entries that are not files", async () => {
    const toolchain = new FakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });

    await runner.run("pfilt", ["-1", "-x", "1000"]);
    expect(instanceAt(toolchain, 0).memfs.size).toBe(0);
  });
});

describe("stdio redirection", () => {
  it("closes fd 1 and reopens so the new file lands on it", async () => {
    // There is no shell, so `> out` is done by hand. Emscripten hands out the
    // lowest free descriptor, which is what makes this work.
    const toolchain = new FakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });

    await runner.run("pcompos", ["-x", "10"], { stdout: "/work/out.hdr" });

    const instance = instanceAt(toolchain, 0);
    expect(instance.closedFds).toEqual([1]);
    expect(instance.opened).toEqual([{ flags: "w", path: "/work/out.hdr" }]);
  });

  it("redirects stdin and stdout together, stdin first", async () => {
    const toolchain = new FakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/work/in.hdr", "A");

    await runner.run("getinfo", ["-a"], {
      stdin: "/work/in.hdr",
      stdout: "/work/out.hdr",
    });

    const instance = instanceAt(toolchain, 0);
    expect(instance.closedFds).toEqual([0, 1]);
    expect(instance.opened.map((entry) => entry.flags)).toEqual(["r", "w"]);
  });

  it("touches no descriptors when neither is redirected", async () => {
    const toolchain = new FakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });

    await runner.run("ra_xyze", ["-r", "-o", "a", "b"]);
    expect(instanceAt(toolchain, 0).closedFds).toEqual([]);
  });
});

describe("collecting output", () => {
  it("copies produced files back out of the instance", async () => {
    const toolchain = new FakeToolchain({
      pcomb: { writes: () => ({ "/work/out.hdr": "RESULT" }) },
    });
    const runner = new WasmToolRunner({ load: toolchain.loader });

    await runner.run("pcomb", ["-f", "x.cal"], { stdout: "/work/out.hdr" });

    expect(decode(await runner.readFile("/work/out.hdr"))).toBe("RESULT");
  });

  it("collects files the tool named itself rather than via stdout", async () => {
    // hdrgen -o and dcraw_emu -Z write their own outputs; the runner should
    // not need to know each tool's argument conventions.
    const toolchain = new FakeToolchain({
      hdrgen: { writes: () => ({ "/work/merge.hdr": "MERGED" }) },
    });
    const runner = new WasmToolRunner({ load: toolchain.loader });

    await runner.run("hdrgen", ["-o", "/work/merge.hdr"]);

    expect(decode(await runner.readFile("/work/merge.hdr"))).toBe("MERGED");
  });

  it("carries an intermediate from one instance to the next", async () => {
    // MEMFS is per-instance, so this copy is the whole handoff mechanism.
    const toolchain = new FakeToolchain({
      first: { writes: () => ({ "/work/mid.hdr": "MID" }) },
      second: {
        writes: (args) => ({ "/work/final.hdr": `saw ${args.join(" ")}` }),
      },
    });
    const runner = new WasmToolRunner({ load: toolchain.loader });

    await runner.run("first", []);
    await runner.run("second", ["/work/mid.hdr"]);

    expect(instanceAt(toolchain, 1).memfs.get("/work/mid.hdr")).toBeDefined();
    expect(decode(await runner.readFile("/work/final.hdr"))).toBe(
      "saw /work/mid.hdr"
    );
  });
});

describe("captured stdout", () => {
  it("returns stdout as text without leaving the capture file behind", async () => {
    const toolchain = new FakeToolchain({
      evalglare: {
        exitCode: 1,
        writes: () => ({ "/work/.stdout": "851.7\n" }),
      },
    });
    const runner = new WasmToolRunner({ load: toolchain.loader });

    const result = await runner.run("evalglare", ["-V", "x.hdr"], {
      captureStdout: true,
    });

    expect(result.stdout).toBe("851.7\n");
    // the capture file is an implementation detail and must not become an
    // intermediate the orchestrator can trip over
    expect(await runner.exists("/work/.stdout")).toBe(false);
  });

  it("returns the exit code rather than throwing on nonzero", async () => {
    // evalglare -V exits 1 on success; the orchestrator depends on seeing it.
    const toolchain = new FakeToolchain({ evalglare: { exitCode: 1 } });
    const runner = new WasmToolRunner({ load: toolchain.loader });

    const result = await runner.run("evalglare", [], { captureStdout: true });
    expect(result.code).toBe(1);
  });
});

describe("stderr", () => {
  it("collects what the tool printed to stderr", async () => {
    const toolchain = new FakeToolchain({
      pcomb: { exitCode: 1, stderr: ["pcomb: cannot find file", "aborting"] },
    });
    const runner = new WasmToolRunner({ load: toolchain.loader });

    const result = await runner.run("pcomb", ["-f", "missing.cal"]);
    expect(result.stderr).toBe("pcomb: cannot find file\naborting");
  });
});

describe("clear", () => {
  it("drops staged files so a set does not leak into the next", async () => {
    const runner = new WasmToolRunner({ load: new FakeToolchain().loader });
    await runner.writeFile("/work/big.tiff", "X");

    runner.clear();

    expect(await runner.exists("/work/big.tiff")).toBe(false);
  });
});

describe("directories", () => {
  it("creates parent directories for inputs outside /work", async () => {
    // Source images keep the caller's paths. MEMFS creates nothing
    // implicitly, so FS.writeFile("/in/a.jpg") fails unless /in exists.
    const made: string[] = [];
    const toolchain = new FakeToolchain();
    const loader = async (tool: string) => {
      const factory = await toolchain.loader(tool);
      return (options?: Record<string, unknown>) =>
        factory(options).then((instance) => {
          const inner = instance.FS.mkdir;
          instance.FS.mkdir = (path: string) => {
            made.push(path);
            inner(path);
          };
          return instance;
        });
    };
    const runner = new WasmToolRunner({ load: loader });
    await runner.writeFile("/in/nested/a.jpg", "A");

    await runner.run("hdrgen", ["/in/nested/a.jpg"]);

    expect(made).toContain("/in");
    expect(made).toContain("/in/nested");
    expect(instanceAt(toolchain, 0).memfs.has("/in/nested/a.jpg")).toBe(true);
  });

  it("survives a directory that already exists", async () => {
    const toolchain = new FakeToolchain();
    const runner = new WasmToolRunner({ load: toolchain.loader });
    await runner.writeFile("/work/a.hdr", "A");
    await runner.writeFile("/work/b.hdr", "B");

    await expect(
      runner.run("pcomb", ["/work/a.hdr", "/work/b.hdr"])
    ).resolves.toBeDefined();
  });
});
