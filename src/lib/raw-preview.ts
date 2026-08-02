/**
 * Caches RAW-to-TIFF conversions and shares the result across callers.
 *
 * This is the only place a RAW file is demosaiced. Both consumers go through
 * it: the viewer's thumbnails and the pipeline's merge stage. The cache lives
 * here, on the page; the conversion itself runs off the page, in a worker.
 * This file reaches it by default through `workerTiffFor`, which drives the
 * worker via `convertRawInWorker` (`raw-worker-client.ts`); the worker in turn
 * calls `convertRaw` and the single `dcrawArgs` that drive it, both defined in
 * `raw-convert.ts`. Restating neither here is what keeps the TIFF the preview
 * shows and the TIFF hdrgen merges byte-identical (verified: sha256
 * 8137c98a... from the browser preview path, the pipeline, and a native build
 * alike). There is one `dcrawArgs`, not two flag sets that could quietly
 * drift apart.
 *
 * Sharing matters more than it first looks. `image-set-preview.tsx` renders a
 * thumbnail for every file in a set, so uploading a 10-frame CR2 bracket
 * already converts all ten; running the pipeline then converted them a second
 * time. That was ~20 s and 673 MB of pure repetition on every run. See #242.
 *
 * A 5796x3870 CR2 takes about 1.9 s and peaks around 266 MiB of wasm heap,
 * measured in Chromium. That is per instance and reclaimed when the instance
 * is dropped.
 *
 * `-q 3` is the slowest demosaic and overkill for a thumbnail, so there is a
 * standing temptation to speed previews up with `-q 0`. Because `raw-convert.ts`
 * owns the only `dcrawArgs`, that temptation has nowhere to go without also
 * changing what the pipeline measures -- there is no second, faster flag set
 * for a preview-only shortcut to reach for.
 */

import {
  convertRawInWorker,
  type RawConvertOptions,
} from "./raw-worker-client";

/**
 * Where the browser builds are served from. See `public/wasm/README.md`.
 *
 * Resolved against the document rather than left relative, because a worker's
 * own base URL is the chunk it was loaded from, which is not where the
 * artifacts live.
 */
function wasmBaseUrl(): string {
  return new URL("/wasm", globalThis.location?.href ?? "http://localhost/")
    .href;
}

/** The default converter: the worker. Tests inject their own. */
function workerTiffFor(
  path: string,
  bytes: Uint8Array,
  options?: RawConvertOptions
): Promise<Uint8Array> {
  return convertRawInWorker(path, bytes, wasmBaseUrl(), options);
}

/**
 * How much converted TIFF to keep.
 *
 * Deliberately smaller than two full brackets. Ten frames is 673 MB, and
 * pinning several sets for a whole session would undo the release the pipeline
 * performs after its merge (#232). This keeps one bracket resident, which is
 * the case that matters -- preview then run -- and lets a longer session evict
 * its oldest frames rather than growing without bound.
 *
 * Entries are held by reference, not copied, but staging one into the
 * pipeline still costs a copy: `pipeline-worker-client.ts`'s `owned()` slices
 * a cached frame before `postMessage`, because transferring the cache's own
 * buffer emptied it -- the defect fixed in 93ba5fc. The saving here is not
 * "zero copies at staging time", it is one conversion shared by every caller
 * that wants the same frame.
 */
const BUDGET_BYTES = 768 * 1024 * 1024;

/** What the converter needs from its host, so this module imports no Tauri. */
export interface RawSourceIo {
  /**
   * Something that changes when the file's contents change.
   *
   * Optional, and the reason it exists: keying on path alone means a file
   * replaced on disk mid-session serves the previous conversion forever. The
   * Rust implementation this replaced avoided that by hashing contents; size
   * and mtime are far cheaper and catch the same case.
   */
  fingerprint?: (path: string) => Promise<string>;
  readFile: (path: string) => Promise<Uint8Array>;
  /**
   * Converts one frame, given its path and its bytes.
   *
   * This is the seam, rather than the `ModuleLoader` it replaced, because
   * conversion runs in a worker and a function cannot cross `postMessage`.
   * Defaults to `workerTiffFor`, which drives that worker. Tests inject their
   * own.
   *
   * Named for what it returns rather than what it does: under #243 it will
   * often answer from OPFS without converting anything.
   *
   * `options.signal` lets a frame still waiting in the queue be skipped.
   * `options.onStart` is the converter's half of that bargain: it says the
   * frame can no longer be skipped, which is the only way this module can
   * tell a queued frame from one already converting. A converter that never
   * calls it leaves its frames droppable for their whole life.
   */
  tiffFor?: (
    path: string,
    bytes: Uint8Array,
    options?: { onStart?: () => void; signal?: AbortSignal }
  ) => Promise<Uint8Array>;
}

/**
 * What a conversion has done so far, separate from the entry so `convert`
 * can be given it before the entry it will belong to exists.
 */
interface EntryFlags {
  /** Set once the conversion settles, either way. */
  done: boolean;
  /** Set when the frame leaves the queue and reaches the worker. */
  started: boolean;
}

interface Entry {
  /** Zero until the conversion resolves, so a pending entry evicts nothing. */
  bytes: number;
  /** Aborting this skips the frame, but only while it is still queued. */
  controller: AbortController;
  flags: EntryFlags;
  tiff: Promise<Uint8Array<ArrayBuffer>>;
}

/** Insertion-ordered, so the first key is the least recently used. */
const cache = new Map<string, Entry>();
let held = 0;

/**
 * Returns the TIFF bytes for a RAW file, converting on first request.
 *
 * The promise rather than its result is cached, so a thumbnail strip asking
 * for ten frames at once does not start ten instances of a tool that peaks at
 * 266 MiB each.
 */
export async function rawToTiff(
  path: string,
  io: RawSourceIo
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await cacheKey(path, io);

  const hit = cache.get(key);
  if (hit) {
    // Re-inserting moves it to the end, which is what makes eviction least
    // recently *used* rather than merely oldest.
    cache.delete(key);
    cache.set(key, hit);
    return hit.tiff;
  }

  const controller = new AbortController();
  const flags: EntryFlags = { done: false, started: false };

  const tiff = convert(path, io, flags, controller.signal).catch(
    (error: unknown) => {
      // A failure must not be remembered as a result, or the file could never
      // be retried without a reload.
      flags.done = true;
      forget(key, flags);
      throw error;
    }
  );

  const entry: Entry = { bytes: 0, controller, flags, tiff };
  cache.set(key, entry);

  tiff
    .then((data) => {
      flags.done = true;
      // Only if this entry is still the live one for its key. An entry that
      // left the map while converting -- evicted, or cleared -- must not add
      // to `held`, because `forget` and `evictDownToBudget` both subtract
      // `entry.bytes`, which was still 0 when they let it go. Accounting for
      // it now would raise `held` permanently and make the budget evict ever
      // more eagerly for the rest of the session.
      const live = cache.get(key);
      if (live?.flags !== flags) {
        return;
      }
      live.bytes = data.byteLength;
      held += data.byteLength;
      evictDownToBudget(key);
    })
    .catch(() => {
      // Handled above; this only prevents an unhandled rejection.
    });

  return tiff;
}

async function cacheKey(path: string, io: RawSourceIo): Promise<string> {
  if (!io.fingerprint) {
    return path;
  }
  try {
    return `${path}|${await io.fingerprint(path)}`;
  } catch {
    // A failed stat is not a reason to refuse to convert; falling back to the
    // path alone is exactly what the cache would have done without one.
    return path;
  }
}

/** Drops least-recently-used first, never the entry just added. */
function evictDownToBudget(keep: string): void {
  for (const [key, entry] of Array.from(cache.entries())) {
    if (held <= BUDGET_BYTES) {
      return;
    }
    if (key !== keep) {
      held -= entry.bytes;
      cache.delete(key);
    }
  }
}

/**
 * Removes an entry, if it is still the one holding its key.
 *
 * Identified by its flags rather than by the entry itself, so a conversion's
 * own `catch` can call this without a forward reference to the entry it has
 * not finished building. The two are one-to-one, so the check is the same.
 *
 * That check is what keeps a dropped frame's `AbortError` -- which arrives at
 * the `catch` above one turn later -- from deleting the *fresh* entry a user
 * created by re-adding the same file in between. Without it, that replacement
 * would be orphaned: still converting, no longer cached, and the next
 * consumer to ask would start a third conversion.
 */
function forget(key: string, flags: EntryFlags): void {
  const entry = cache.get(key);
  if (entry?.flags !== flags) {
    return;
  }
  held -= entry.bytes;
  cache.delete(key);
}

async function convert(
  path: string,
  io: RawSourceIo,
  flags: EntryFlags,
  signal: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await io.readFile(path);
  const tiff = await (io.tiffFor ?? workerTiffFor)(path, bytes, {
    onStart: () => {
      flags.started = true;
    },
    signal,
  });
  // Never a SharedArrayBuffer -- these builds are single-threaded, which is
  // what keeps them hostable without COOP/COEP headers, and a page served
  // without those headers does not even define SharedArrayBuffer. The value
  // now arrives by structured clone from the RAW worker rather than straight
  // from MEMFS, but a cloned or transferred view is always ArrayBuffer-backed
  // either way, so the narrowing still holds. Callers still owe `decodeTiff`
  // a copy of `.buffer`, not a bare handoff: it does `buffer.slice(0)` before
  // posting to the tiff worker.
  return tiff as Uint8Array<ArrayBuffer>;
}

/**
 * Gives up on frames the user has removed.
 *
 * Only frames still waiting in the queue are given up on. One already
 * converting is left alone in both senses: it is not skipped, because the
 * queue is past the point where that is possible, and it is not forgotten,
 * because forgetting it would make a re-added set a cache miss and convert
 * the same bytes a second time. A finished frame is kept too -- it costs
 * nothing the LRU budget does not already govern, and it makes re-adding the
 * same file instant. `flags.done` is what recognizes it: a converter that
 * resolves without ever calling `onStart` -- `countingIo` in the tests --
 * would otherwise leave `flags.started` false on a completed entry,
 * indistinguishable from one still queued.
 *
 * Paths that were never converted, including every non-RAW one, match no key
 * and cost a scan.
 */
export function dropRawConversions(paths: string[]): void {
  for (const path of paths) {
    for (const [key, entry] of Array.from(cache.entries())) {
      if (key !== path && !key.startsWith(`${path}|`)) {
        continue;
      }
      if (entry.flags.started || entry.flags.done) {
        continue;
      }
      entry.controller.abort();
      forget(key, entry.flags);
    }
  }
}

/**
 * Returns an already-converted TIFF, or undefined. Never converts.
 *
 * The pipeline runs in a worker, so converting here would put the ~2 s a frame
 * back on the main thread -- exactly what moving it off was for. This lets the
 * page hand over conversions it is already holding and leave the rest to the
 * worker.
 */
export async function peekRawTiff(
  path: string,
  io: RawSourceIo
): Promise<Uint8Array | undefined> {
  const key = await cacheKey(path, io);
  const hit = cache.get(key);
  if (!hit) {
    return;
  }
  try {
    return await hit.tiff;
  } catch {
    // Deliberately swallowed. This only *peeks*: a conversion that failed
    // earlier is not this caller's failure to report, and returning undefined
    // sends it down the same path as a cache miss, where the worker converts
    // it again and surfaces the real error in context.
  }
}

export function clearRawPreviewCache(): void {
  cache.clear();
  held = 0;
}

/** Bytes of converted TIFF currently held. Exposed for tests and diagnostics. */
export function rawCacheBytes(): number {
  return held;
}
