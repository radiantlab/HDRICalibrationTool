/**
 * The shared RAW conversion cache.
 *
 * What matters here is not that `dcraw_emu` works -- `raw-convert.test.ts`
 * covers the tool, and the reference bracket covers it in a real browser --
 * but that the *sharing* holds: that a frame is converted once no matter how
 * many callers want it, that a file replaced on disk is not served from a
 * stale entry, and that a long session does not grow without bound.
 */

import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  clearRawPreviewCache,
  type RawSourceIo,
  rawCacheBytes,
  rawToTiff,
} from "./raw-preview";

/** Counts conversions, which is the whole point of the cache. */
function countingIo(
  outputBytes = 1024,
  fingerprint?: RawSourceIo["fingerprint"]
): RawSourceIo & { converted: string[] } {
  const converted: string[] = [];
  return {
    converted,
    fingerprint,
    readFile: () => Promise.resolve(new Uint8Array(64)),
    tiffFor: (path: string) => {
      converted.push(path);
      return Promise.resolve(new Uint8Array(outputBytes));
    },
  };
}

describe("shared RAW conversion", () => {
  beforeEach(() => {
    clearRawPreviewCache();
  });

  it("converts a frame once however many callers ask for it", async () => {
    const source = countingIo();

    const [a, b, c] = await Promise.all([
      rawToTiff("/in/capt01.CR2", source),
      rawToTiff("/in/capt01.CR2", source),
      rawToTiff("/in/capt01.CR2", source),
    ]);

    expect(source.converted).toHaveLength(1);
    // The same buffer, not an equal copy: that is what makes the cache share
    // one conversion across every caller asking for the same frame, rather
    // than each caller paying for its own.
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("reconverts when the file behind the path has changed", async () => {
    let stamp = "100:1";
    const source = countingIo(1024, () => Promise.resolve(stamp));

    await rawToTiff("/in/capt01.CR2", source);
    await rawToTiff("/in/capt01.CR2", source);
    expect(source.converted).toHaveLength(1);

    stamp = "200:2";
    await rawToTiff("/in/capt01.CR2", source);
    expect(source.converted).toHaveLength(2);
  });

  it("still converts when the host cannot fingerprint", async () => {
    const source = countingIo(1024, () => Promise.reject(new Error("no stat")));

    await rawToTiff("/in/capt01.CR2", source);
    await rawToTiff("/in/capt01.CR2", source);

    // Falls back to keying on the path, which is what it would have done with
    // no fingerprint at all -- a failed stat must not disable the cache.
    expect(source.converted).toHaveLength(1);
  });

  it("does not remember a failure", async () => {
    // Typed so the mutation below is visible to the analyser, which would
    // otherwise narrow `fail` to the literal `true` it was initialised with.
    const state: { fail: boolean } = { fail: true };
    const source: RawSourceIo = {
      readFile: () => Promise.resolve(new Uint8Array(64)),
      tiffFor: () =>
        state.fail
          ? Promise.reject(new Error("conversion failed"))
          : Promise.resolve(new Uint8Array(1024)),
    };

    await expect(rawToTiff("/in/a.CR2", source)).rejects.toThrow(
      "conversion failed"
    );
    state.fail = false;
    await expect(rawToTiff("/in/a.CR2", source)).resolves.toBeInstanceOf(
      Uint8Array
    );
  });

  it("does not carry a failed conversion's cost against frames it still holds", async () => {
    // A structurally trivial version of this test injects only a converter
    // that always fails, so `held` starts and stays at zero regardless of
    // whether the rollback in `rawToTiff` actually runs -- the assertion
    // cannot distinguish "rolled back correctly" from "never charged in the
    // first place". Converting one frame successfully first gives `held` a
    // nonzero value that a bug in the rollback would corrupt.
    const good = countingIo(4096);
    await rawToTiff("/in/a.CR2", good);
    expect(rawCacheBytes()).toBe(4096);

    const bad: RawSourceIo = {
      readFile: () => Promise.resolve(new Uint8Array(4)),
      tiffFor: () => Promise.reject(new Error("conversion failed")),
    };
    await expect(rawToTiff("/in/b.CR2", bad)).rejects.toThrow(
      "conversion failed"
    );

    // A failure that still counted against the budget would evict live frames
    // to make room for something that was never stored.
    expect(rawCacheBytes()).toBe(4096);
  });

  it("accounts for what it holds and releases it on clear", async () => {
    const source = countingIo(4096);

    await rawToTiff("/in/a.CR2", source);
    await rawToTiff("/in/b.CR2", source);
    expect(rawCacheBytes()).toBe(8192);

    clearRawPreviewCache();
    expect(rawCacheBytes()).toBe(0);
  });
});
