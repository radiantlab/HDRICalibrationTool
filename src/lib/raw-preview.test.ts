/**
 * The shared RAW conversion cache.
 *
 * What matters here is not that `dcraw_emu` works -- that is verified against
 * the reference bracket in a real browser -- but that the *sharing* holds:
 * that a frame is converted once no matter how many callers want it, that a
 * file replaced on disk is not served from a stale entry, and that a long
 * session does not grow without bound.
 */

import { beforeEach, describe, expect, it } from "@jest/globals";
import type { EmscriptenModule, ModuleFactory } from "./pipeline/wasm-runner";
import {
  clearRawPreviewCache,
  type RawSourceIo,
  rawCacheBytes,
  rawToTiff,
} from "./raw-preview";

/** Counts conversions, which is the whole point of the cache. */
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

function io(
  load: RawSourceIo["load"],
  fingerprint?: RawSourceIo["fingerprint"]
): RawSourceIo {
  return {
    fingerprint,
    load,
    readFile: () => Promise.resolve(new Uint8Array(64)),
  };
}

describe("shared RAW conversion", () => {
  beforeEach(() => {
    clearRawPreviewCache();
  });

  it("converts a frame once however many callers ask for it", async () => {
    const { load, runs } = fakeLoader();
    const source = io(load);

    const [a, b, c] = await Promise.all([
      rawToTiff("/in/capt01.CR2", source),
      rawToTiff("/in/capt01.CR2", source),
      rawToTiff("/in/capt01.CR2", source),
    ]);

    expect(runs).toHaveLength(1);
    // The same buffer, not an equal copy: that is what makes staging a cached
    // frame into the pipeline cost no extra memory.
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("reconverts when the file behind the path has changed", async () => {
    const { load, runs } = fakeLoader();
    let stamp = "100:1";
    const source = io(load, () => Promise.resolve(stamp));

    await rawToTiff("/in/capt01.CR2", source);
    await rawToTiff("/in/capt01.CR2", source);
    expect(runs).toHaveLength(1);

    stamp = "200:2";
    await rawToTiff("/in/capt01.CR2", source);
    expect(runs).toHaveLength(2);
  });

  it("still converts when the host cannot fingerprint", async () => {
    const { load, runs } = fakeLoader();
    const source = io(load, () => Promise.reject(new Error("no stat")));

    await rawToTiff("/in/capt01.CR2", source);
    await rawToTiff("/in/capt01.CR2", source);

    // Falls back to keying on the path, which is what it would have done with
    // no fingerprint at all -- a failed stat must not disable the cache.
    expect(runs).toHaveLength(1);
  });

  it("does not remember a failure", async () => {
    // Typed so the mutation below is visible to the analyser, which would
    // otherwise narrow `fail` to the literal `true` it was initialised with.
    const state: { fail: boolean } = { fail: true };
    const source: RawSourceIo = {
      load: (tool) =>
        state.fail
          ? Promise.reject(new Error("module missing"))
          : fakeLoader().load(tool),
      readFile: () => Promise.resolve(new Uint8Array(64)),
    };

    await expect(rawToTiff("/in/a.CR2", source)).rejects.toThrow(
      "module missing"
    );
    state.fail = false;
    await expect(rawToTiff("/in/a.CR2", source)).resolves.toBeInstanceOf(
      Uint8Array
    );
  });

  it("does not account for a conversion that failed", async () => {
    const source: RawSourceIo = {
      load: () => Promise.reject(new Error("module missing")),
      readFile: () => Promise.resolve(new Uint8Array(4)),
    };

    await expect(rawToTiff("/in/a.CR2", source)).rejects.toThrow(
      "module missing"
    );
    // A failure that still counted against the budget would evict live frames
    // to make room for something that was never stored.
    expect(rawCacheBytes()).toBe(0);
  });

  it("accounts for what it holds and releases it on clear", async () => {
    const { load } = fakeLoader(4096);
    const source = io(load);

    await rawToTiff("/in/a.CR2", source);
    await rawToTiff("/in/b.CR2", source);
    expect(rawCacheBytes()).toBe(8192);

    clearRawPreviewCache();
    expect(rawCacheBytes()).toBe(0);
  });
});
