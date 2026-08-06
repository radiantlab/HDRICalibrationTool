# How fast is hdrgen, really, in each place we run it

**Status:** designed, not implemented
**Date:** 2026-08-06

## The question

The PRD says the WebAssembly build costs "roughly 2x native". Nothing in the
repository measures that, and the claim has been repeated in conversation as
though it were established.

Observation has pulled in two directions at once. The shipped wasm `hdrgen`
merges the 18-frame JPEG bracket in **22 s** headless under Node on this
machine, which agrees with the ~24 s recorded for the macOS desktop app in
[#245](https://github.com/radiantlab/LumiLab/issues/245). The same bracket
through the browser build under Playwright's Chromium, on the same machine, did
not finish in **fifteen minutes**. Meanwhile CI's Chromium job runs that same
spec inside a six-minute job.

Those cannot all be explained by one cause, and the difference matters: it
decides whether the web build is viable as the primary way people run this, or
whether the desktop app is the only serious target.

## Why the obvious comparison is not available

`/usr/local/bin/hdrgen` is a `Mach-O 64-bit x86_64` binary and this machine is
`arm64`, so every "native" timing taken so far ran under Rosetta translation
while the wasm ran on a native arm64 JIT. The 4-frame figures that looked like
parity, 4.0 s native against 4.2 s wasm, were not a fair comparison: the native
side was handicapped by an unknown factor.

That is why this builds hdrgen from source rather than only measuring what is
installed.

## Legs

| Leg | What it is |
| --- | --- |
| `native-arm64` | hdrgen built here from the fork, at the pinned commit |
| `native-x86_64` | the installed `/usr/local/bin/hdrgen`, under Rosetta |
| `wasm-node` | the shipped `public/wasm/hdrgen.{js,wasm}`, driven in Node |
| `wasm-chromium` | the same shipped artifacts, in a bare page |
| `wasm-webkit` | the same, in WebKit |

**`native-arm64` must be built from `ad214f25362dd330f35c27c90d8470bd66c0fc19`**,
the commit `public/wasm/versions.json` records the shipped `.wasm` as having
been built from. Building from `main` would compare different source and
silently invalidate the entire native column. The checkout at
`../hdrgen` already has the CMake project, and `CMakeLists.txt:7` deliberately
leaves `CMAKE_OSX_ARCHITECTURES` unset so a caller can pin the architecture.

The two native legs together also measure the Rosetta penalty, which is what
makes the `native-x86_64` row readable instead of merely confusing.

`wasm-webkit` earns its place because the desktop app runs WKWebView on macOS
and is reportedly fast. It is what separates "browsers are slow at this" from
"Chromium is slow at this", and those have completely different consequences.

## Workload

The JPEG bracket at 4, 8 and 18 frames, with the argument vector the app
actually builds (`stages.ts:hdrgenArgs`):

```
-m 1000 <frames…> -o <out> -r <response> -a -e -f -g -F
```

Three repetitions per cell, reporting the median with the minimum and maximum
alongside. A single number from a laptop is noise, and the spread is often more
informative than the middle.

## What is measured, and what is not

Module compile and startup are timed separately from the merge call. A cold
wasm compile is a real cost a user pays, but it is not the same cost as the
merge, and folding them together would hide which one moved.

Every run gets a 300 s ceiling, and **a timeout is recorded as a result, not an
error**. "chromium did not finish 18 frames within 300 s" is the finding this
whole exercise exists to pin down; a benchmark that threw it away would be
measuring only the cases that were never in question.

Two asymmetries are reported in the output rather than papered over:

- The native legs read frames from disk inside the timed region. The wasm legs
  are handed bytes already in memory, because that is how the app feeds them.
  At these sizes the read is small against the merge, but it is not zero.
- `native-x86_64` is emulated and is therefore a **lower bound** on native
  performance, never an upper one.

## Structure

`scripts/bench-hdrgen/`, following the precedent of
`e2e-web/tests/perf.bench.ts`: committed, documented, and deliberately outside
the test suite, because it reports numbers rather than asserting them.

- `run.mjs` orchestrates. It runs the native and node legs directly, shells out
  to Playwright for the browser legs, collects every cell and prints one table.
- `browser-leg.spec.ts` plus a minimal HTML page, served by the bench's own
  tiny static server. Bare on purpose: no Next build, no app, no worker, no UI.
  It loads the same `hdrgen.js`, stages the same frames, and times the same
  `callMain`, so it differs from the node leg in the engine and nothing else.

That last point is the design's whole load-bearing idea. If the browser legs
come back near the node leg's 22 s, the binaries are fine everywhere and the
slowness belongs to the application around them. If they do not, it is the
engine, and the application is exonerated. Any measurement that ran the full
app could not separate those.

## Out of scope

- Any other tool. `dcraw_emu` dominates RAW import and deserves the same
  treatment, but one question at a time.
- The full-app number. `perf.bench.ts` already measures that, and mixing it in
  would reintroduce exactly the confound this design removes.
- Fixing whatever is found. This measures.
