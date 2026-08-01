# Drop RAW conversions the user no longer wants

**Status:** designed, not implemented
**Date:** 2026-08-01
**Closes:** [#248](https://github.com/radiantlab/LumiLab/issues/248)
**Follows:** [#243](https://github.com/radiantlab/LumiLab/issues/243), which added the persistent tier this design deliberately does not touch

## The problem

RAW conversion runs one frame at a time in a dedicated worker. That serialism
is deliberate: `WasmToolRunner.clear()` keeps its compiled modules, so one
long-lived worker compiles `dcraw_emu` once and peaks at a single instance's
~266 MiB, where a pool would compile per worker and multiply that peak.

What the queue has no way to do is stop. `convertRawInWorker(path, bytes,
wasmBaseUrl)` takes no signal and polls nothing.

Because the queue is serial, frames nobody wants any more block frames
somebody does. Remove a 10-frame CR2 set two frames in, or drop a set and add
a different one, and the eight queued frames still convert before the first
frame of the new set starts. That is about 15 s of thumbnails that appear to
hang, on a path that was just fixed so it would stop appearing to hang.

Both siblings already do better. `decodeTiff` takes an `AbortSignal` and
terminates its worker on abort (`tiff-worker-client.ts:29-37`).
`executeInWorker` polls `shouldStop` every 250 ms and terminates between
stages. The RAW worker is the odd one out.

## What #248 assumed, and what the code says

#248 closed with a note worth correcting, because it would have argued this
work down to nothing:

> Once the worker grows an OPFS tier, a "queued" frame may turn out to be a
> cache hit that costs milliseconds, which makes dropping it pointless.

It does not. The persistent lookup lives *inside* the worker —
`convertWithCache` runs in `raw-worker.ts:96`, reached only after the frame
arrives by `postMessage`, which is to say after it has waited its entire turn
in the queue. A frame that is a 5 ms cache hit still sits behind eight 1.9 s
conversions.

So dropping queued frames did not become pointless under #243. If anything the
queue is now the only thing standing between a returning user and an instant
thumbnail.

That observation also implies a second, larger change — resolving cache hits
*before* they queue — which is deliberately **out of scope here**. It means
moving key derivation and the IndexedDB read out of the worker onto the page,
or adding a peek message, and it reworks the boundary #243 has just
established. It gets its own issue.

## What "cancel" means here

**A frame that has not yet been handed to the worker is never handed to it. A
frame already converting runs to completion.**

This is the cheapest of the three definitions #248 offered, and it recovers
almost all of the benefit, because the waste is queue time rather than the
~1.9 s in flight. It is also the only one that carries no risk to sharing:
`rawToTiff` caches the promise rather than its result, so one entry serves
three consumers — thumbnails via `use-tiff-bytes.tsx`, dimensions via
`generic-image-metadata.ts`, and the pipeline via `peekRawTiff` — and one
caller losing interest does not mean the frame is unwanted.

The two rejected alternatives, recorded so they are not re-litigated:

- **Terminate the in-flight frame.** `resetRawWorker()` already does this and
  has no caller outside `onError`. It reclaims up to ~1.9 s more, but throws
  away a frame the pipeline or the metadata reader may still be awaiting, and
  forces a fresh `dcraw_emu` compile on the next frame. Worth revisiting only
  if a case turns up where an in-flight frame is genuinely unwanted by
  everyone.
- **Reference-count the cache entry.** Correct in every case and the most
  work: every consumer acquires and releases, and `peekRawTiff` currently
  borrows without either. Not justified by a symptom that queue-skipping
  already resolves.

## Design

### Ownership

```
image-matrix-input.tsx
        │  dropRawConversions(paths)
        ▼
raw-preview.ts          owns the session cache and one controller per entry
        │  signal
        ▼
raw-worker-client.ts    owns the queue, checks the signal before send()
```

The UI never learns that a worker or a queue exists, which is how it already
reaches conversion — only through `rawToTiff`. `raw-preview.ts` is the only
module that can both abort the conversion and forget the entry, so the drop
API belongs there.

### `raw-worker-client.ts`

`convertRawInWorker` gains an optional `signal`:

```ts
const conversion = queue.then(() => {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return send(path, bytes, wasmBaseUrl);
});
```

Checked at the front of the queue rather than at call time, which is the whole
point: the work being skipped is work that has been waiting. A signal already
aborted when `convertRawInWorker` is called is caught by the same check, so
there is no second code path for it.

A skipped frame still occupies its link in the chain and still settles it, so
ordering and the one-frame-at-a-time invariant are untouched. `send()` is
never entered, so there is no worker message, no interaction with `abandon`,
and no termination.

### `raw-preview.ts`

`Entry` gains two fields:

```ts
interface Entry {
  bytes: number;
  controller: AbortController;
  /** Set once the conversion settles, either way. */
  done: boolean;
  tiff: Promise<Uint8Array<ArrayBuffer>>;
}
```

The controller belongs to the *entry*, not to a caller. That is what keeps
sharing intact: there is exactly one conversion per frame and exactly one
thing that can call it off, so no consumer can cancel a frame out from under
the other two.

`rawToTiff` passes `controller.signal` into `io.tiffFor`, whose signature gains
the optional signal:

```ts
tiffFor?: (path: string, bytes: Uint8Array, signal?: AbortSignal)
  => Promise<Uint8Array>;
```

New export:

```ts
export function dropRawConversions(paths: string[]): void
```

For each path, it matches cache keys by `key === path || key.startsWith(
`${path}|`)` — keys are `path` or `path|fingerprint` — then, **only if the
entry is not `done`**, aborts the controller and calls `forget(key)`.

A finished conversion is deliberately kept. It costs nothing beyond the LRU
budget that already governs it, and keeping it makes re-adding the same file
instant instead of a re-queue. Non-RAW paths match no key, so callers need not
filter by extension.

### The accounting bug this uncovers

`raw-preview.ts:137-141` accounts for a conversion when it resolves:

```ts
entry.bytes = data.byteLength;
held += data.byteLength;
```

`forget()` and `evictDownToBudget()` both subtract `entry.bytes`, which is
**0 while the entry is pending**. So any entry removed from the map before its
conversion resolves adds to `held` and never subtracts. `held` drifts upward
permanently and the 768 MB budget starts evicting far too eagerly.

This is pre-existing and today needs an eviction to land on a pending entry,
which is rare. **This design makes forgetting a pending entry the normal
path**, so it would turn a latent leak into an everyday one. The fix belongs
here rather than in a follow-up: the `.then` accounts only if the entry is
still the live one for its key.

```ts
.then((data) => {
  entry.done = true;
  if (cache.get(key) !== entry) {
    return;               // dropped or evicted while converting
  }
  entry.bytes = data.byteLength;
  held += data.byteLength;
  evictDownToBudget(key);
})
.catch(() => {
  // Already handled at `:127`; this sets `done` on the failure path and
  // prevents an unhandled rejection, as it did before.
  entry.done = true;
})
```

`done` is set on both paths. A conversion that failed is as finished as one
that succeeded, and `dropRawConversions` must not try to abort either.

### `image-matrix-input.tsx`

Wired to the two places that already know the user changed their mind:

- `onRemove` (the whole set) drops every file in the row.
- `onRemoveIndex` drops the one file removed.

### The index bug this uncovers

`image-set-preview.tsx:112` maps over `files`, which `image-matrix-input.tsx:214`
passes as `row.files.toSorted(...)`. `onRemoveIndex` at
`image-matrix-input.tsx:238` then applies that index to the **unsorted**
`row.files`. Removing an image therefore deletes the wrong frame whenever the
stored order is not already sorted — which `onAdd` guarantees as soon as it
appends a file that sorts before an existing one.

This is a user-facing bug that predates this work, and it is fixed here rather
than separately because the wiring is not correct without it: dropping the
conversion for `sorted[i]` while the form removes `unsorted[i]` leaves the
cache and the UI disagreeing about which frame is gone.

Sort once and use the same array for both:

```tsx
const sorted = row.files.toSorted((a, b) => a.localeCompare(b));

<ImageSetPreview
  files={sorted}
  onRemoveIndex={(i) => {
    dropRawConversions([sorted[i]]);
    value[index] = { ...row, files: sorted.filter((_, n) => n !== i) };
    field.onChange([...value]);
  }}
/>
```

An issue is filed recording it independently, since it is worth a changelog
line of its own and did not arrive with this feature.

## Error handling

A dropped frame rejects with a `DOMException` named `AbortError`, the same
shape `decodeTiff` uses, so a deliberate drop stays distinguishable from a
genuine conversion failure.

It must not be remembered as a result. `dropRawConversions` calls `forget` at
drop time, and the existing `catch → forget` at `raw-preview.ts:127` covers
the rejection that follows. A frame dropped and then re-added converts afresh
rather than inheriting a rejected promise.

No new unhandled-rejection surface: `raw-preview.ts:137` keeps a handler on
the cached promise itself, and `tiff-image.tsx:50` already catches its derived
promise because an aborted decode was always expected there. The thumbnail
unmounts when its file is removed, so the `AbortError` does not reach the
`ErrorBoundary` at `tiff-image.tsx:69`.

## Testing

In `raw-worker-client.test.ts`, against the worker double that already pins
the serial invariant:

- A queued frame whose signal is aborted never reaches the worker. Asserted on
  the double's received-message count, not on a flag, so a frame that is
  merely *marked* dropped still fails the test.
- The frames queued behind a skipped one still convert, in order.
- A frame already in flight is unaffected by an abort and still resolves.

In `raw-preview.test.ts`:

- A dropped pending entry is forgotten, so a later request for the same path
  converts again rather than returning the rejected promise.
- A completed entry is not forgotten, so a re-add is served from memory.
- `rawCacheBytes()` returns to zero after a dropped frame's conversion
  settles. This is the guard on the accounting fix. It cannot be written
  against today's code, which has no way to drop anything, so it must be
  checked against a copy of the finished implementation with the
  `cache.get(key) !== entry` guard removed — otherwise it pins nothing.

The `image-matrix-input.tsx` wiring is not unit-tested; the behaviour worth
pinning lives in the two library modules, and the component change is a
two-line call plus the index fix.

## Out of scope

- Resolving persistent-cache hits before they queue. Its own issue.
- Terminating in-flight conversions, and reference-counting cache entries.
  Both rejected above, with reasons.
- Any change to `raw-cache.ts`, `raw-cache-idb.ts`, or the worker's own
  caching. #243's boundary is untouched.
