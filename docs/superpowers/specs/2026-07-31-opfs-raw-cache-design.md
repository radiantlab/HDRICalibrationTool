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

Primarily because the worker already holds the bytes. It receives them in
order to convert them, so hashing there costs no second read, and the content
hash never has to cross back to the page. Doing that hash on the main thread
instead would mean shipping a 22 MB frame across `postMessage` just to jank
the UI the RAW worker exists to keep responsive -- the same class of stall
`e2e-web/tests/pipeline.spec.ts` guards against for conversion itself.

`FileSystemFileHandle.createSyncAccessHandle()` being callable only from a
dedicated Web Worker -- not the main thread, not an iframe, not a
SharedWorker -- is an additional reason, not the deciding one. That
restriction is why synchronous I/O on the main thread is excluded at all, but
it only bears on this placement if the probe below sends the write path to
`createSyncAccessHandle`; if `createWritable` wins instead, the placement
holds anyway, on the first reason alone.

The `tiffFor` seam established by the RAW worker design needs no change at all
-- which is why that seam is named for what it returns rather than what it
does.

## The cache key

```
key     = sha256(source bytes) + "-" + toolTag
toolTag = first 12 hex of sha256(dcrawCommit + ":" + dcrawArgs("in", "out").join(" "))
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

## Probe results

Measured 2026-07-31 with `e2e-web/tests/storage-probe.spec.ts` against the
static export (`npm run build`, then `npx playwright test
tests/storage-probe.spec.ts --project=<name>` from `e2e-web`). Two of the five
engines the decision rules need; the other three are below.

The spec now runs each OPFS write path twice: once as a single call across the
whole 67 MB blob, once as 8 MB slices through the same handle
(`opfsChunkedWriteMs`, `opfsSyncChunked`). Chunking is the standard mitigation
for a large OPFS write, and a chunked pass that survives where the
single-shot one failed would point at the call shape rather than at OPFS
itself -- see the spec's module docstring.

It also now runs a **control write** first on every host: 4 bytes, main
thread, `createWritable`, read back and compared, before anything else is
attempted. This was added after the WebKit row below was first recorded and
turned out to be wrong -- see the correction below the table. `controlOk`
must be `true` before any other cell in that host's row means anything about
OPFS; the spec's own assertions are ordered the same way, control first, so a
run that fails the control reports itself as inconclusive rather than as an
OPFS verdict.

| Host | controlOk | opfsAvailable | opfsRoundTrips | opfsWriteMs | opfsChunkedRoundTrips | opfsChunkedWriteMs | opfsSync.writeMs | opfsSyncChunked.writeMs | quota | idbWriteMs | errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| WebKit (Playwright, macOS) | **false** (inferred -- see below) | true | -- (never compared) | -- | -- (never compared) | -- | -- | -- | 1000 MB | 169-296 | `UnknownError: ... out of memory` at `getDirectory()`, before any write -- host-level, not a finding about OPFS |
| Chromium (Playwright, macOS) | true | true | true | 78-103 | true | 84-97 | 115-179 | 93-120 | 3072-4096 MB | 41-66 | none |
| WKWebView (macOS, Tauri) | needs a local Tauri debug build | -- | -- | -- | -- | -- | -- | -- | -- | -- | not yet run |
| WebView2 (Windows, Tauri) | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI |
| WebKitGTK (Linux, Tauri) | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI | pending CI |

Chromium and WebKit each show a range because the spec was run more than
once while diagnosing the WebKit result below; the numbers move host-load to
host-load but the pass/fail outcome was stable across every Chromium run and
every WebKit run. Chromium's `controlOk: true` and full round-trip are from
the most recent run, after the control write and the chunked paths were both
added -- confirming neither addition regressed the already-passing case.

WebKit's `controlOk` is marked **false (inferred)** rather than measured: the
control write did not exist as a spec assertion during any of the WebKit runs
recorded here, but a same-session throwaway diagnostic (a bare 4-byte
`createWritable` write, described below) failed identically, which is exactly
what the permanent control write now checks. Not run again to confirm --
see "Still needed."

**Chromium round-trips cleanly on all four paths, single-shot and chunked,
main thread and worker.** All four writes -- `createWritable` single-shot,
`createWritable` chunked, `createSyncAccessHandle` single-shot,
`createSyncAccessHandle` chunked -- complete and read back byte-identical.
This is the one clean chunked-vs-single-shot comparison available so far: the
chunked writer's code path is correct, and on an engine that already handles
the single-shot write, chunking neither breaks anything nor buys much
(84-97 ms vs. 78-103 ms for `createWritable`; 93-120 ms vs. 115-179 ms for
`createSyncAccessHandle` -- see the timing-comparability caveat below before
reading either pair as a real speed difference).

**The WebKit row above needs correction from what an earlier version of this
document said, and the correction is the more important result of this
pass.** The original single-shot run (recorded when this section was first
written) failed with `UnknownError: The operation failed for an unknown
transient reason (e.g. out of memory).` on a 67 MB write, and that entry read
this as "not naive quota exhaustion at 67 MB," reasoning from the blob size
against a reported 1000 MB quota. Chasing whether chunking fixed that led to
a machine-level check that overturns the "at 67 MB" framing entirely: a
follow-up run of a **4-byte** OPFS write, on the same host, in the same
session, failed with the *identical* `UnknownError`, at the *same* stage
(`navigator.storage.getDirectory()`, before any write is attempted at all).
`memory_pressure` on the host at the time showed roughly 60-230 MB of a 16 GB
machine free across repeated checks, with 9.3M page-outs already recorded --
this is a real desktop under its owner's normal multi-app load, not a CI
runner reserved for the test. A host that cannot open the OPFS root directory
for 4 bytes cannot tell you anything about whether it can write 67 MB in one
call versus eight -- both the original single-shot number and the new chunked
one are **confounded by host memory pressure, not evidence about WebKit's
OPFS implementation**. Both are marked accordingly in the table rather than
left to read as findings.

This is Playwright's bundled WebKit on macOS, in an ephemeral profile. The
task brief's backend decision rule names five engines explicitly -- "WebKit,
Chromium, WKWebView, WebView2, WebKitGTK" -- and WebKit is the first of them,
so the rule does apply to this row; the point is not that WebKit falls
outside it. The point is that this row's **evidence is invalid**, not that
the rule doesn't reach it: `controlOk: false` means the host could not write
4 bytes, so nothing this run reports distinguishes "OPFS is broken in
WebKit" from "this host was thrashing." Applying the brief's "OPFS fails on
any engine -> approach B" rule to invalid evidence would be deciding the
architecture on a measurement that was never actually taken -- the run must
be regathered on an unloaded host (CI, or this same machine at rest, with
`controlOk: true`) before the rule can be applied to WebKit at all. Once a
valid WebKit result exists, three outcomes follow directly from the brief's
rule, independent of what WKWebView separately shows: a valid failure on
WebKit itself fires "fails on any engine -> B" outright; a valid pass leaves
the decision to whatever the other four engines show; and a second invalid
run (`controlOk: false` again) means try again on a different host, not a
finding either way.

**The write-path timing is not comparable as instrumented, independent of the
confound above.** `opfsSync.writeMs` brackets only `access.write` + `flush`
inside the worker, on a freshly allocated all-zero buffer; `opfsWriteMs`
brackets `write` + `close` on the main thread, on the patterned source buffer.
Different spans, different payloads. The same gap exists between
`opfsSyncChunked.writeMs` and `opfsChunkedWriteMs`. None of Chromium's four
numbers should be fed into the brief's write-path rule (`createSyncAccessHandle`
over `createWritable` only if more than 2x faster on every engine) -- a rerun
timing the same span over the same bytes would be needed before any pair of
them means anything.

**`idbRoundTrips` is not in the table above deliberately.** The probe never
reads the value back from IndexedDB; it treats the write transaction's
`oncomplete` as success. Both engines report a completed write and no
`idbError` on every run, which is weaker than OPFS's actual byte comparison
and shouldn't be read as equivalent verification.

**Still needed:** an unloaded rerun of the WebKit case (the current numbers
are confounded, not negative), plus all three Tauri webviews.
`e2e-tests/test/specs/storage-probe.e2e.ts` exists, ports the same probe body
(including the chunked paths) to `browser.execute`, and type-checks
(`npx tsc --noEmit` from `e2e-tests`), but has not run anywhere -- it needs
the debug Tauri binary that `wdio.conf.js`'s `onPrepare` builds
(`npm run tauri build -- --debug --no-bundle --features e2e-driver`), which
this pass did not produce. WKWebView can run locally afterward with
`npm run test:e2e:desktop` on macOS; WebView2 and WebKitGTK need the
`e2e-tests` CI job on its Windows and Ubuntu runners. Until those rows are
filled in from a host that also passes the 4-byte control, neither the
backend (A vs. B) nor the write path can be decided -- this section is what
the decision needs, not the decision itself.

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
directly -- the second import should fall by roughly the conversion time. See
"Measured result" below for what "wasm fetches stay at 2" turns into once the
benchmark actually reloads the page.

## Measured result

Measured 2026-07-31 with the reload pass added to `e2e-web/tests/perf.bench.ts`
in Task 10, against the local static build (`npm run build`, then `MODE=cr2
FRAMES=<n> npm --prefix e2e-web run bench`, `dangerouslyDisableSandbox` needed
for both in this agent's sandbox -- see the module docstring's note on
inflated numbers, which applies to `npm run build`'s Turbopack dev server too).

| | 3 frames | 10 frames |
|---|---|---|
| `runMs` (first import, cache miss + write) | 10094 / 8456 / 9074 (avg 9208) | 25715 |
| `secondImportMs` (reload, reimport, cache hit) | 2012 / 1949 / 1970 (avg 1977) | 5198 |
| ratio (second / first) | 21.5% | 20.2% |
| `requests.wasm` | 4 | 4 |

Three 3-frame runs are reported individually because a single sample was not
enough to trust against the 5968 ms baseline below; ten frames was run once,
at ~26 s for the pair, well within reasonable time. A fourth 3-frame run's raw
JSON was lost to output truncation before it was saved -- its `requests.wasm`
shape was confirmed identical (one `dcraw_emu.js`, one `dcraw_emu.wasm`, two
`versions.json`) but its `runMs`/`secondImportMs` pair was not recovered, so
it is excluded rather than guessed at. The averages above are three runs, not
four.

**`secondImportMs` falls to about a fifth of `runMs`, at both frame counts.**
The demosaic (~1.9 s/frame) is skipped entirely; what remains is the
IndexedDB read of ~67 MB/frame plus the TIFF decode. This is the acceptance
criterion in #243, measured rather than asserted.

**`requests.wasm` is 4, not 2 -- expected, once broken down, not a
regression.** The pre-reload baseline counted `/wasm/` requests across *one*
page load; this benchmark now spans two (initial load, then `page.reload()`).
`wasmRequestDetail` for a representative 3-frame run:

```
versions.json   (1 KB)   -- first import: computing the cache key's tool tag
dcraw_emu.js   (20 KB)   -- first import: cache miss, converting
dcraw_emu.wasm (312 KB)  -- first import: cache miss, converting
versions.json   (0 KB)   -- second import: computing the cache key's tool tag
```

`dcraw_emu.js`/`.wasm` appear exactly **once**, on the first import only, at
both 3 and 10 frames. On the second import, `convertWithCache`'s `key()` call
fetches `versions.json` to build the tag, finds a persistent-cache hit, and
returns without ever calling `convertRaw` -- so `runnerFor`'s compiled
`dcraw_emu` module is not just reused, it is never touched a second time. This
is stronger evidence than a flat fetch count: the benchmark's own listener
(`page.on("requestfinished")`) fires for HTTP-cache-served requests too --
the second `versions.json` above shows `kb: 0`, a cache hit that still
produced an event -- so the *absence* of a second `dcraw_emu.wasm` entry is
not the listener missing a cached fetch, it is `convertRaw` never running.

**A control run confirms the reload comparison is real.** Temporarily
reverting `raw-worker.ts` to its pre-cache form
(`git show 390bbf2^:src/lib/raw-worker.ts`) and rebuilding gives, for 3
frames: `runMs` 8036 ms, `secondImportMs` 7944 ms -- equal within noise,
because nothing is cached, and `dcraw_emu.js`/`.wasm` each fetched twice
(once per import, the second served from the HTTP cache at `kb: 0`). That is
the acceptance-criterion comparison this task exists to make, and it holds.

**What the control does *not* settle: why `runMs` itself (8456-10094 ms,
3-frame) runs above the 5968 ms baseline measured earlier today.** The
control's 8036 ms is a **single sample**, and it happens to be the fastest of
all four cache-on/cache-off runs recorded in this session -- one data point
below a three-run cache-on spread does not distinguish "this environment
generally runs slower than whatever host measured 5968 ms" from "the
persistent write adds a modest cost to the first import that the control
happened to under-sample." Both are consistent with what was measured; only
the first is consistent with the *design*, since the write is documented at
~100 ms/frame (see "Cost" above `crypto.subtle.digest`'s estimate, and the
"Step 4 must precede step 5" note), which would be too small to explain a
~1200-2100 ms gap on its own -- but "too small on paper" is not the same as
measured. Settling it would need several more cache-off control runs at the
same n as the cache-on runs, ideally on the same host that produced 5968 ms,
which this pass did not attempt because it would not change the reload
result above. Left here as an open question rather than resolved.

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
