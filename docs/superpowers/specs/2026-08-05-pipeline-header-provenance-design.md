# Stop leaking host paths into pictures, and let provenance through

**Status:** designed, not implemented
**Date:** 2026-08-05
**Closes:** [#241](https://github.com/radiantlab/LumiLab/issues/241)
**Settles:** the `pcomb -h` consistency follow-up parked in
[`2026-07-26-tutorial-conformance-fixes.md`](./2026-07-26-tutorial-conformance-fixes.md) §9

## The problem

Every Radiance tool appends its own command line to the header of the picture
it writes. The pipeline names files by whatever string the host used to find
them, and on the desktop that string is an absolute path from the native file
dialog. So the paths end up inside the output picture.

The version of this that has been observed, from #241:

```
pcomb -h -f "/Users/<user>/Library/CloudStorage/GoogleDrive-<user>@oregonstate.edu/Shared drives/radiantlab HDRICalibrationTool/examples/inputs/calibration_files/CF_f5d6.cal" /work/neutral_density.hdr
```

That is a university email address in every calibrated picture, and these
pictures go into papers as supplementary material.

There is a second half. `photometricArgs` (`stages.ts:177`) passes `-h`, which
stops `pcomb` copying the header it was handed. It is the only one of the four
correction stages that does. The three before it accumulate; the fourth throws
all of it away. A calibrated picture therefore records less than an
uncalibrated one: no camera, no capture date, no list of merged frames, no
lens-flare note, no crop or resize line. Nothing numerical is at risk
(`EXPOSURE` is always 1 after `ra_xyze -r -o`, `PRIMARIES` is always Radiance's
default), but a reader cannot tell what produced the picture.

## What the leak actually covers

#241 reports the `pcomb -f` path. Reading the code, it is wider, and the reason
it looked narrow is instructive.

`prepareInputs` (`orchestrator.ts:489`) has two branches. The RAW branch
re-paths everything: frames become `/work/inputN.tiff` (`:520`) and the
response function becomes `/work/sqr.rsp` (`:540`). The LDR branch returns
`params.inputImages` and `params.responseFunction` unchanged (`:506-510`), so
on the desktop hdrgen is handed host paths and writes them into its provenance
lines.

#241's table was built from a CR2 run, where the merge stage had no host path
left to leak. The `pcomb` line was the only one visible.

The browser leaks nothing either way: `vfs.ts` already registers picked files
under synthetic `/session/...` and `/presets/...` paths, which is exactly the
shape this design gives the desktop.

## Where `-h` came from

Worth recording, because it determines whether removing it is a change or a
correction.

It is not from the tutorial. Table 3 step 9 of Pierson et al. (2019) is
`pcomb -s factor`, taking a measured luminance or a calibration factor; the app
requires a hand-written `.cal` instead, logged as a usability gap in
`2026-07-26-tutorial-conformance-fixes.md` §9. Nothing in that step calls for
`-h`.

It comes from `extra/ldr-to-hdr.sh:182-197`, the lab's shell script, which has
the identical asymmetry: three plain `pcomb -f` calls and then `pcomb -h -f`
for the calibration factor. `photometric_adjustment.rs` transcribed it in
commit `9825c4b` (December 2023) with no comment, and the WebAssembly port
carried it across byte for byte.

The likeliest original reason, offered as a hypothesis and not as a record: the
line after it in that script is `getinfo | sed "/VIEW/d"`, Table 3 step 10,
which removes the stale `VIEW=` line hdrgen leaves behind. `-h` wipes the whole
inherited header, which does that job bluntly. The app skips the `sed`
entirely, so a stale `VIEW=` is the one thing that could come back when `-h`
goes.

That risk was already investigated in
`2026-07-26-tutorial-conformance-fixes.md` §8, which found that `pcompos`
indents the inherited header during the crop, deactivating the stale line in
every path, and that Radiance resolves the **last** active `VIEW` when several
are present, confirmed by experiment. This design verifies it rather than
inheriting the conclusion.

## The design

### Sanitize at the boundary

One change point: `executeInWorker` (`pipeline-worker-client.ts:80`), the
single place a run is staged (`run-wasm-pipeline.ts:165` injects it, and tests
substitute it).

It already reads every referenced file and builds the `files` map the worker
writes into the virtual filesystem (`pipeline.worker.ts:55`). It gains a path
map: every referenced file is staged under a sanitized work path, and the
worker receives a **copy** of `params` whose path fields point at those work
paths.

The copy matters. `runs/page.tsx:95` records the executed inputs into run
history for display, and the form holds the same strings. Mutating params in
place would put `/work/...` in front of users; rewriting only what crosses into
the worker leaves both untouched.

### Naming

Keep the basename, which carries meaning: `CF_f5d6.cal` names the aperture the
file was derived at. Drop the directory, which is the part that leaks.

| What | Staged path |
| --- | --- |
| input frame *n* | `/src/<n>-<basename>` |
| response function | `/src/response-<basename>` |
| `.cal` file | `/cal/<slot>-<basename>` |

Outside `/work`, deliberately. `WORK_DIR`'s comment states that every
*intermediate* lives under that prefix, and `collectOutputs`
(`wasm-runner.ts:404`) is built on it: after each tool it scans `/work` and
files whatever it finds as something the tool produced. Sources staged under
`/work/src` would appear there as directory entries and be collected as
zero-byte outputs. The runner already expects sources to live elsewhere
(`wasm-runner.ts:383`: "Source images keep whatever path the caller gave them,
which is not necessarily under /work"), and `makeParentDirs` creates whatever
depth they need.

`<n>` is the frame's 1-based position in `params.inputImages`, matching the
index `prepareInputs` already uses for `/work/inputN.tiff`. `<slot>` is one of
`fisheye`, `vignetting`, `neutral`, `photometric`, named after the correction
rather than after the form field, so the header reads as the pipeline stage it
belongs to.

The index and the slot prefix are collision handling, not decoration: two
directories can each hold a `DSC_0001.JPG`, and one `.cal` file can legitimately
be supplied to two correction slots. Extensions are preserved because
`isRawImage` (`orchestrator.ts:76`) dispatches on them.

The resulting header is also deterministic: the same bracket produces the same
header on any machine, on either host.

### What does not change

`prepareInputs`, `maybeFilter`, `filterImages`, `warnIfResolutionDependent` and
`runner.release(consumed)` treat paths as opaque keys into the virtual
filesystem, so none of them need touching. This is what keeps a merge-stage
change out of a release week.

The RAW peek loop in `executeInWorker` keeps using **host** paths, because the
thumbnail cache is keyed that way, while staging its result under
`/work/inputN.tiff` as it does today. The two loops stay aligned by position.

`params.outputPath` is declared (`orchestrator.ts:97`) and never reaches a tool
argv, so the output directory is not a leak surface and is left alone.

### Header

Remove `-h` from `photometricArgs` (`stages.ts:178`) so all four correction
stages accumulate alike.

Its doc comment (`stages.ts:155-176`) justifies the flag as byte-for-byte
parity with `photometric_adjustment.rs`. That file no longer exists;
`src-tauri/src/pipeline/` is empty and the pipeline is TypeScript. The comment
is rewritten in the same change, and so is the matching justification in
`stages.test.ts`, which locks the argv exactly.

## Consequences

**Error messages name work paths.** A stage that fails reports the path it was
given, so a user would see `/src/3-DSC_0003.JPG` rather than their own
file. Preserving the basename keeps the message identifiable. Each user-facing
error path is checked, and mapped back to the original where a message reaches
the UI.

**Existing pictures are unaffected.** This changes what future runs write. It
does not and cannot clean headers already written, and anyone who has published
supplementary material from this tool has published whatever was in it.

## Verification

Unit:

- `executeInWorker` stages every referenced file under a sanitized path and
  rewrites the params it sends, with a collision case (same basename, two
  directories) and an assertion that the caller's params object is not mutated.
- `photometricArgs` emits no `-h`.

Manual, on the example CR2 bracket and a JPEG bracket, both hosts if
convenient and the desktop at minimum, since it is the only host that leaked:

1. `getinfo` on the calibrated output contains no host path, no home directory,
   no email address.
2. It carries the provenance chain: camera, capture date, hdrgen's frame list,
   the crop and resize lines, and four `pcomb` lines showing basenames.
3. It carries exactly one active `VIEW=` line, which is the `-h` hypothesis
   under test.
4. A JPEG run's hdrgen provenance names `/src/...` frames, not host paths.

Nothing in the suite asserts on header content today, so the manual run is the
real verification. This adds to the manual-check debt tracked in #256 rather
than reducing it.

## Not in scope

- **The false-colour map's header.** `falsecolor.ts:153` and `:271` pass `-h`
  to `pcompos`, so the second output file is header-stripped for the same
  reason. Filed separately.
- **Table 3 step 9.** `pcomb -s factor` with a numeric calibration factor,
  instead of requiring a hand-written `.cal`. A UI change, and a real
  divergence from the tutorial, but not this.
- **Cleaning `-h` out of `psign` calls.** `falsecolor.ts:262` and `:301` pass
  `-h` to `psign`, where it is character height. Same spelling, unrelated flag,
  correct as written.
