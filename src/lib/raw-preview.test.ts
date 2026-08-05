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
  dropRawConversions,
  type RawSourceIo,
  rawCacheBytes,
  rawToTiff,
} from "./raw-preview";

// Hoisted per `useTopLevelRegex`: a regex literal in a test body fails lint.
const ABORT_MESSAGE = /abort/i;

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

/**
 * An IO whose conversions finish only when the test says so.
 *
 * `countingIo` resolves on the spot, which cannot model the state that
 * matters most here: a frame that has left the queue and is still converting.
 * `start()` stands in for the queue handing the frame to the worker, so a
 * test can place an entry in any of its three states deliberately.
 */
function deferredIo(): RawSourceIo & {
  converted: string[];
  finish: (path: string, bytes?: number) => void;
  start: (path: string) => void;
} {
  const converted: string[] = [];
  const starts = new Map<string, () => void>();
  const finishes = new Map<string, (tiff: Uint8Array) => void>();
  return {
    converted,
    finish: (path, bytes = 1024) => finishes.get(path)?.(new Uint8Array(bytes)),
    readFile: () => Promise.resolve(new Uint8Array(64)),
    start: (path) => starts.get(path)?.(),
    tiffFor: (path, _bytes, options) => {
      converted.push(path);
      starts.set(path, () => options?.onStart?.());
      return new Promise<Uint8Array>((resolve, reject) => {
        finishes.set(path, resolve);
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError"))
        );
      });
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

  it("converts a frame once even if it is dropped in flight and re-added", async () => {
    const io = deferredIo();

    const first = rawToTiff("/in/capt01.CR2", io);
    // Two turns, not one: `rawToTiff` awaits the cache key, then `convert`
    // awaits `readFile`, before it ever reaches `tiffFor`. One turn observes
    // the frame still queued and calls a no-op `io.start`.
    await Promise.resolve();
    await Promise.resolve();
    io.start("/in/capt01.CR2");

    // The user removes the set, then adds it back -- the wrong folder, or a
    // re-drag. The frame is already converting, so dropping it must not
    // forget it: a forgotten entry is a miss, and a miss here means a second
    // conversion of bytes already being converted.
    dropRawConversions(["/in/capt01.CR2"]);
    const second = rawToTiff("/in/capt01.CR2", io);

    io.finish("/in/capt01.CR2");
    await expect(first).resolves.toHaveLength(1024);
    await expect(second).resolves.toHaveLength(1024);
    expect(io.converted).toEqual(["/in/capt01.CR2"]);
  });

  it("forgets a frame dropped before it started, so a re-add converts it", async () => {
    const io = deferredIo();

    const dropped = rawToTiff("/in/capt01.CR2", io);
    // Two turns so `tiffFor` has actually run and registered its abort
    // listener; deliberately no `io.start(...)`, so the frame is still in
    // the queue when it is dropped.
    await Promise.resolve();
    await Promise.resolve();
    dropRawConversions(["/in/capt01.CR2"]);
    await expect(dropped).rejects.toThrow(ABORT_MESSAGE);

    const again = rawToTiff("/in/capt01.CR2", io);
    await Promise.resolve();
    await Promise.resolve();
    io.start("/in/capt01.CR2");
    io.finish("/in/capt01.CR2");

    // A re-added file must convert, not inherit the rejection of the entry
    // the user threw away.
    await expect(again).resolves.toHaveLength(1024);
    expect(io.converted).toHaveLength(2);
  });

  it("keeps a finished frame, so re-adding it is free", async () => {
    const source = countingIo();

    await rawToTiff("/in/capt01.CR2", source);
    dropRawConversions(["/in/capt01.CR2"]);
    await rawToTiff("/in/capt01.CR2", source);

    // Removing a file is not a reason to throw away work already done: the
    // LRU budget already governs how long it lives.
    expect(source.converted).toHaveLength(1);
  });

  it("does not let a frame dropped and instantly re-added inherit the dropped entry's rejection or lose its own cache slot", async () => {
    const io = deferredIo();
    const path = "/in/capt01.CR2";

    const dropped = rawToTiff(path, io);
    // Two turns so `tiffFor` has run and the abort listener is attached
    // before the drop, exactly as in the "forgets a frame dropped before it
    // started" case above.
    await Promise.resolve();
    await Promise.resolve();
    dropRawConversions([path]);
    // No await between the drop and the re-add: that gap is what the earlier
    // "forgets a frame dropped..." test could not exercise, because it
    // awaited `dropped`'s rejection first, giving `rawToTiff`'s own
    // `catch -> forget` time to clear the entry before the re-add ever ran.
    const again = rawToTiff(path, io);
    await expect(dropped).rejects.toThrow(ABORT_MESSAGE);

    await Promise.resolve();
    await Promise.resolve();
    io.start(path);
    io.finish(path);
    await expect(again).resolves.toHaveLength(1024);
    expect(io.converted).toHaveLength(2);

    // The replacement entry `again` created must still be the live cache
    // entry for this key. Deliberately not awaited: if it were lost -- the
    // dropped entry's late `forget` deleting it regardless of identity --
    // this call starts a third, real conversion that nothing here ever
    // finishes, and awaiting it would hang for 5 s instead of failing
    // cleanly on `io.converted`'s length.
    rawToTiff(path, io);
    await Promise.resolve();
    await Promise.resolve();
    expect(io.converted).toHaveLength(2);
  });

  it("does not count a conversion that finished after its entry was gone", async () => {
    const io = deferredIo();

    const conversion = rawToTiff("/in/capt01.CR2", io);
    await Promise.resolve();
    await Promise.resolve();
    io.start("/in/capt01.CR2");
    clearRawPreviewCache();
    io.finish("/in/capt01.CR2");
    await conversion;

    // `forget` and `evictDownToBudget` both subtract `entry.bytes`, which is
    // 0 while a conversion is pending. Accounting for the bytes afterwards
    // would leave `held` permanently ahead of what is actually cached, and a
    // budget that thinks it is fuller than it is evicts frames it should
    // have kept. Reached here through `clearRawPreviewCache` because the
    // eviction path needs 768 MB of real allocation to trigger honestly.
    expect(rawCacheBytes()).toBe(0);
  });
});
