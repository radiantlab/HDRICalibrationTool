# Persist RAW-to-TIFF conversions so they survive a reload

**Status:** designed, not implemented
**Date:** 2026-07-31
**Issue:** [#243](https://github.com/radiantlab/LumiLab/issues/243)
**Depends on:** [#232](https://github.com/radiantlab/LumiLab/issues/232) Phase 4,
the RAW conversion worker (`src/lib/raw-worker.ts`), which is complete

## The problem

RAW conversion is the most expensive single thing the app does, and it is pure
recomputation: the same input bytes always produce the same TIFF. Measured on
2026-07-31 with `e2e-web`'s benchmark against the CR2 fixture bracket:

| | value |
|---|---|
| Import, 3 frames | 5968 ms local, 5959 ms deployed |
| Per frame | ~2.0 s, matching the documented 1.9 s demosaic |
| `dcraw_emu` fetches | 2, for all three frames |

The cache that avoids repeating this lives in memory (`raw-preview.ts`) and
dies with the tab. Reload the page and every frame in the bracket is converted
again from scratch: ~19 s for a 10-frame bracket, every time.

The desktop build used to keep this on disk (`src-tauri/src/image_cache/`,
keyed by `compute_hash_for_file`) and lost it when the pipeline moved to
WebAssembly. So this is a regression for desktop users as well as a gap for
browser ones.

Not a blocker for deployment: the app is correct without it, only slower on a
second visit.

## Approach

A persistent tier behind the existing session tier, inside the RAW worker.

```
rawToTiff(path)                     [page, raw-preview.ts]
  |- session hit?  -> return
  `- miss -> read bytes -> tiffFor(path, bytes)
                              `- convertRawInWorker  [raw-worker.ts]
                                   |- hash bytes
                                   |- persistent hit? -> read TIFF, return
                                   `- miss -> convertRaw -> write TIFF -> return
```

Three tiers, checked in order:

1. **Session**, `raw-preview.ts`, on the page. Keyed `path|size:mtime`, LRU
   within 768 MB of RAM. Costs no file read when a frame is already resident.
   **Unchanged by this work.**
2. **Persistent**, inside `raw-worker.ts`. Keyed by content hash, LRU within
   2 GB on disk.
3. **Conversion**, the last resort.

### Why the persistent tier lives in the worker

`FileSystemFileHandle.createSyncAccessHandle()` is callable only from a
dedicated Web Worker -- not the main thread, not an iframe, not a SharedWorker.
It is excluded there deliberately, because synchronous I/O on the main thread
blocks rendering.

That constraint turns out to be a gift rather than a tax. The worker already
receives the source bytes in order to convert them, so it can hash them without
a second read, and the content hash never has to cross back to the page. The
`tiffFor` seam established by the RAW worker design needs no change at all --
which is why that seam is named for what it returns rather than what it does.

## The cache key

```
key     = sha256(source bytes) + "-" + toolTag
toolTag = first 12 hex of sha256(dcrawCommit + "\0" + dcrawArgs("in", "out").join(" "))
```

`dcrawCommit` is `tools.dcraw_emu.commit` from `versions.json`. The args are
serialised by calling `dcrawArgs` with fixed placeholder paths, so the tag
tracks the *flags* and changes when they do, without varying per frame.

### Why content hash, not path

This is a correctness requirement in the browser, not an optimisation.
`registerSessionFile` (`src/lib/vfs.ts:44`) mints `/session/${nextId()}/${name}`
from a counter that restarts each session. So `/session/1/capt01.CR2` in one
session and `/session/1/other.CR2` in the next are **the same string for
different bytes**. A path-keyed persistent cache would serve the wrong image.

Content addressing also makes the multi-tab case benign: identical bytes
produce an identical key and an identical TIFF, so two tabs converting the same
bracket duplicate a write and never corrupt anything.

### Why the tool tag

Not in #243, and load-bearing. Keying on content alone means that if
`dcrawArgs` changes, or `dcraw_emu.wasm` is rebuilt from newer sources -- which
is exactly what [#244](https://github.com/radiantlab/LumiLab/issues/244)
proposes to automate -- every cached TIFF becomes silently stale. The app would
serve pixels produced by a *different demosaic* while reporting success.

`raw-preview.ts` goes to real lengths to keep the preview and the pipeline
byte-identical (verified: sha256 `8137c98a...` across the browser preview path,
the pipeline, and a native build). Quietly serving last-build's pixels would
undo that guarantee.

Folding the tag into the key rather than validating it on read means a tool
change simply misses, stale entries age out by LRU, and a rollback re-hits its
old entries instead of having discarded them.

`wasmVersions()` (`src/lib/build-versions.ts`) already exposes
`tools.dcraw_emu.commit`. **One trap:** that module hardcodes
`WASM_BASE_URL = "/wasm"` as a relative fetch, and in a worker a relative URL
resolves against the worker's own chunk, not the document. The worker must
resolve `versions.json` from the absolute `request.wasmBaseUrl` it is already
given -- the same hazard `raw-preview.ts` documents for the wasm base URL.

### Cost

`crypto.subtle.digest` over a 22 MB frame is roughly 25-50 ms, paid only on a
session-cache miss, where the bytes have been read anyway. About 0.5 s across a
10-frame bracket, against the ~19 s of conversion it avoids.

## Storage backend: decided by probe

Two candidates. The probe runs first and picks one; we do not build both.

### A. OPFS blobs + IndexedDB index (recommended)

TIFFs in OPFS, named by key, written and read through `createSyncAccessHandle`
inside the worker. Index in the existing `documents` store.

- **For:** fastest read path, no structured clone of 67 MB, and OPFS generally
  gets a far larger quota than IndexedDB -- which matters at 2 GB, since WebKit
  has historically been stingy with IndexedDB per origin.
- **Against:** two storage systems that can desynchronise. See Reconciliation.

### B. IndexedDB only, extending `kv.ts` (fallback)

A third object store beside `documents` and `files`, blobs as `ArrayBuffer`.

- **For:** one storage system, already proven in all three Tauri webviews --
  presets, settings and run history depend on it in production today, so the
  compatibility risk is zero. Index and blob update in a **single transaction**,
  eliminating the whole orphan/phantom class of bugs in A.
- **Against:** a 67 MB structured clone on every read and write, and large-value
  IndexedDB performance is meaningfully worse than an OPFS sync handle.

### C. OPFS with IndexedDB fallback: rejected

Two caching implementations to keep honest. #243 itself warns that "a second
caching implementation behind `isTauri()` would be the thing that drifts".
Reconsider only if the probe shows OPFS working on some hosts but not others.

### What the probe must answer

1. Does OPFS open, write, read back and delete a ~67 MB blob in WKWebView
   (macOS), WebView2 (Windows) and WebKitGTK (Linux)?
2. What does `navigator.storage.estimate()` actually grant on each host, for
   both backends?
3. Does IndexedDB accept ~2 GB of large values on those same hosts?

OPFS is used nowhere in the codebase today, and its behaviour in the Tauri
webviews has never been tested -- `PRD.md:132` records that plainly. WebKitGTK
is the doubtful one, and Safari has a history of OPFS write bugs.

## Components

### New

| File | Purpose |
|---|---|
| `src/lib/raw-cache.ts` | The tier: lookup, store, index, eviction. Storage injected. |
| `src/lib/raw-cache-opfs.ts` | `opfsBlobStore()`. The only file touching OPFS, so Jest never imports it and the probe can exercise it alone. **Under B this is `raw-cache-idb.ts` instead; exactly one of the two exists.** |
| `src/lib/raw-cache.types.ts` | `BlobStore` and index records, importable without the implementation. |

### Modified

- `src/lib/raw-worker.ts` -- hash, consult the cache, store on miss.
- `src/lib/storage/kv.ts` -- add `updateDocument(key, fn)`, a get+put inside one
  transaction. See Concurrency.
- The Settings page -- usage read-out and Clear button.

### The storage seam

```ts
export interface BlobStore {
  read(key: string): Promise<Uint8Array | undefined>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
  /** Every key present. For reconciliation against the index. */
  keys(): Promise<string[]>;
}
```

Follows the injection style already used for `RawSourceIo`, `ModuleLoader` and
`tiffFor`, so the tier is testable in jsdom, which has no OPFS. OPFS satisfies
it; IndexedDB satisfies it if the probe sends us to B; a `Map`-backed fake
satisfies it in tests. That is what keeps the A/B decision from rippling past
one file.

### The index

One JSON document in the existing `documents` store under `raw-cache-index`,
mapping `key -> { size, lastUsed }`.

At 2 GB / 67 MB that is about 30 entries, so a single document is the right
grain: each index update is atomic, and the page can read it directly, which is
what lets Settings report usage without involving the worker.

## Data flow, inside the worker

```
1. key  = sha256(bytes) + "-" + toolTag        toolTag from versions.json @ wasmBaseUrl
2. hit  = await cache.get(key)   -> touch lastUsed, return
3. miss -> tiff = await convertRaw(runner, path, bytes)
4. await cache.put(key, tiff)    -> write blob, update index, evict to 2 GB
5. postMessage(tiff, [tiff.buffer])            <- transfer LAST
```

**Step 4 must precede step 5, and that is a correctness constraint rather than
a preference.** `postMessage` with a transfer detaches the buffer, so caching
afterwards would persist a zero-byte file while reporting success -- the same
detached-`ArrayBuffer` failure fixed in `93ba5fc`. Writing first costs ~100 ms
on a 67 MB TIFF and removes the hazard entirely.

## Eviction

Budget **2 GB**, fixed. LRU by `lastUsed`, evicting until total is at or under
budget, never the entry just added. Mirrors `evictDownToBudget` in
`raw-preview.ts` so both tiers read alike.

One guard the session tier does not need: a blob larger than the whole budget
is not cached at all, rather than evicting everything and then itself.

## Reconciliation

The price of approach A, and unnecessary under B. Two failure shapes:

- **Phantom** -- index entry present, blob gone, e.g. the browser reclaimed
  storage. `get` reads the index, then the blob; a missing blob drops the index
  entry and reports a miss. Self-healing, no sweep required.
- **Orphan** -- blob written, index write lost to a crash. Invisible to
  eviction, so it consumes disk forever. Swept once per session on first use:
  `keys()`, delete anything absent from the index. About 30 keys, so it is
  cheap.

Writes go blob-first then index, so an interrupted write leaves the recoverable
orphan rather than the phantom.

## Concurrency

Mostly handled by construction. The worker serialises conversions through the
queue in `raw-worker-client.ts`, so there is no concurrent `put` from that side.
Two real cases remain:

- **Settings "Clear" racing a write.** The index is a read-modify-write, and
  `kv.ts`'s `run()` does one request per transaction, so this needs
  `updateDocument(key, fn)` doing get+put inside a single transaction. This is
  the only change to existing storage code.
- **Two tabs converting the same bracket.** Benign, because the store is
  content-addressed: identical bytes give an identical key and an identical
  TIFF, so the worst case is a duplicate write.

## Error handling

Asymmetric, deliberately:

- A cache **read** failure is treated as a miss, and the frame is converted.
- A cache **write** failure is logged and swallowed. The conversion already
  succeeded and the user should get their image whether or not the disk
  cooperated.

**The cache may never be the reason a conversion fails.**

## Settings

One row beside the tool versions the page already carries:

```
RAW conversion cache        1.2 GB of 2 GB used     [Clear]
```

Usage reads the index document directly from the page. Clearing from the page
is fine: only `createSyncAccessHandle()` is worker-restricted;
`getDirectory()` and `removeEntry()` work on the main thread.

## Testing

**1. The probe, first, because it gates A vs B.** Runs in the desktop suite
(WebdriverIO -- macOS, Ubuntu, Windows in CI) and the browser suite (Playwright
-- WebKit, Chromium). Opens OPFS, writes ~67 MB, reads back and verifies the
bytes, deletes, reports `navigator.storage.estimate()`; then the same volume
through IndexedDB. Output is a per-host table answering the three questions
above.

**2. Unit** (Jest, fake `BlobStore`): hit, miss, eviction order, budget guard,
phantom self-heal, orphan sweep, write-failure swallowed, and a changed tool tag
causing a miss.

**3. Integration**: convert once, request identical bytes again, assert the
injected converter ran exactly once -- the counting-injection pattern
`raw-convert.test.ts` already uses.

**4. End to end, with a number rather than a claim.** `e2e-web`'s benchmark
already measures this path: `MODE=cr2` reports 5968 ms for 3 frames with 2 wasm
fetches. Adding a reload-and-reimport pass gives the acceptance criterion
directly -- the second import should fall by roughly the conversion time while
wasm fetches stay at 2.

## What does not change

- `raw-preview.ts`. The session tier, its budget and its key are untouched.
- The `tiffFor` seam and the worker message protocol.
- `dcrawArgs`. There is still exactly one flag set, so the preview cannot drift
  from what the pipeline measures.
- Pipeline behaviour on a cache miss, which is what it does today.

## Out of scope

- Memoising fingerprint -> content hash so an unchanged file skips the read
  *and* the digest on a later session. Worth considering later, not worth
  building first.
- Persisting anything other than RAW-to-TIFF conversions.
- A user-facing toggle to disable persistence. Speculative until asked for.
