# Stop leaking host paths into pictures, and let provenance through

**Status:** implemented
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
on the desktop hdrgen is handed host paths.

> **Corrected during implementation.** This section originally concluded that
> hdrgen therefore writes those host paths into its provenance line, making the
> merge a second leak surface. That is wrong, and it was checked rather than
> reasoned about only after the code was written. Given frames under
> `/tmp/.../Deep Dir-user@example.edu/bracket/`, hdrgen writes
> `hdrgen created HDR image from 'IMG_6958.JPG' 'IMG_6957.JPG' ...`: basenames
> only, because hdrgen strips the directory itself. The response function is
> not named in the header at all.
>
> So the leak is exactly what #241 reported, the `pcomb -f` cal path, and
> nothing more. Re-pathing the merge inputs is not load-bearing. It is kept
> because it costs nothing, because it makes a header identical across machines
> and hosts for the same inputs, and because a naming rule with an exception is
> worse than one without. But it fixes nothing on its own.

#241's table was built from a CR2 run, and the `pcomb` line was the only leak
visible there because it is the only leak there is.

The browser leaks nothing either way: `vfs.ts` already registers picked files
under synthetic `/session/...` and `/presets/...` paths, which is exactly the
shape this design gives the desktop.

## `-h` is load-bearing, and this design was wrong about it

> **Corrected after CI.** Everything below this heading was written on the
> premise that `-h` could simply be removed. It cannot. Removing it stopped the
> pipeline producing anything at all, on every platform, and CI caught it where
> no local test could.
>
> Radiance tools indent an inherited header with tabs, and evalglare refuses
> any picture whose header carries `EXPOSURE=` and a tab on one line:
>
> ```c
> pictool.c:214   if (strstr(s, EXPOSSTR) && strstr(s, "\t")) { ... exit(1) }
> ```
>
> `pcompos` writes an `EXPOSURE=` line during the crop. With `-h` on the fourth
> correction that line is the last written at column zero and evalglare is
> content. Without it, every correction nests it one tab deeper and the glare
> stage exits with "header contains invalid exposure entry", producing nothing.
> Measured against the shipped wasm binary, not inferred. It also explains why
> the uncalibrated path kept working: with no correction, nothing nests the
> line.
>
> The hypothesis everyone tested, including this document, was the stale
> `VIEW=` line, and that part was fine. The flag was load-bearing for
> `EXPOSURE`. Testing the one risk that had been written down, rather than
> asking what else parses that header, is how both the earlier audit and this
> design missed it.
>
> **Provenance is therefore re-stated rather than inherited**, after evalglare
> has run, through the same `getinfo -a` the pipeline already uses: camera,
> capture date, merged frame list, lens-flare note, and calibration basenames.
> Nothing emitted carries a tab or an exposure entry, because someone will run
> evalglare on the output. `CAPDATE=` is carried as hdrgen resolved it, naming
> one frame's timestamp, since `header.c:44` makes it a standard identifier
> parsed as UTC and it must stay a single well-formed time.

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
map: every referenced file is staged under a sanitized path, and the worker
receives a **copy** of `params` whose path fields point at those staged paths.

The copy matters. `runs/page.tsx:95` records the executed inputs into run
history for display, and the form holds the same strings. Mutating params in
place would put `/src/...` and `/cal/...` in front of users; rewriting only
what crosses into the worker leaves both untouched.

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

**Error messages name staged paths.** A stage that fails reports the path it was
given, so a user would see `/src/3-DSC_0003.JPG` rather than their own file.
Preserving the basename is what keeps the message identifiable, and that is the
whole mitigation: nothing maps a staged path back to the one the user picked.
A failing stage still surfaces the tool's own stderr through `describeError`
(`types.ts:106`), which names the staged path. The two calibration warnings are
the exception, and they name the basename outright.

**Existing pictures are unaffected.** This changes what future runs write. It
does not and cannot clean headers already written, and anyone who has published
supplementary material from this tool has published whatever was in it.

## Verification

Unit:

- `executeInWorker` stages every referenced file under a sanitized path and
  rewrites the params it sends, with a collision case (same basename, two
  directories) and an assertion that the caller's params object is not mutated.
- `photometricArgs` emits no `-h`.

Automated, and this replaces the manual check this section originally planned.
`pipeline.spec.ts` already downloads both finished pictures and reads their
bytes, so asserting on the header there costs no extra run time and turns #241
into a standing guard rather than a one-off inspection. It asserts that every
absolute path in either output sits under `/src`, `/cal` or `/work`, that no
Windows path appears (which the first check cannot see, since one does not
start with a slash), and that exactly one **active** `VIEW=` line survives.

### What the assertions were validated against

A test that has never seen the failure it guards proves nothing, so both were
checked in both directions against real Radiance output before being committed.

The full stage sequence was reproduced with the natively installed Radiance
tools, with a calibration file at
`/tmp/.../Secret Dir-user@example.edu/CF_f5d6.cal`, standing in for the path
#241 reported:

| header | absolute paths outside the allowlist | active `VIEW=` |
| --- | --- | --- |
| four corrections, unsanitised cal path | **4**, one per `pcomb` stage | 1 |
| real 18-frame merge, shipped wasm hdrgen, sources under `/src` | 0 | 0 (written later) |
| hdrgen given deep absolute input paths | 0 | 1 |
| the whole post-merge sequence through the shipped wasm binaries, staged paths | 0 | 1 |

So the guard catches the reported leak, catches it once per correction stage,
and does not fire on clean output.

Every row above is the **picture**. The false-colour map is deliberately not
asserted on for the view line: `falsecolor` composes it with `pcompos -h`, so
it inherits no header and carries no `VIEW=` at all. Asserting a count either
way would pin behaviour this design lists as a separate problem to be filed.
Both path assertions do apply to it.

### The `-h` hypothesis, settled

Removing `-h` risked letting hdrgen's own EXIF-derived `VIEW=` through to
compete with the one the pipeline writes. hdrgen does emit one
(`VIEW= -vtv -vh 133.295593 -vv 114.143967` on the reference bracket), so the
concern was real rather than theoretical.

Running the sequence confirms what the earlier audit predicted, and shows the
mechanism: each stage that copies an inherited header indents it one tab deeper
and prefixes it with the file it came from, so hdrgen's `VIEW=` ends up five
tabs in and deactivated, while the one `getinfo -a` writes sits at column 0.
Exactly one active line, and the flag was not load-bearing.

### Not verified here

The browser end-to-end run against the full 18-frame bracket did not complete
locally, so these assertions will first run for real in CI. The cause is
unrelated to this change and is recorded separately: the shipped wasm binaries
merge that bracket in 22 s headless under Node and about the same in the
desktop webview, while the same merge under Playwright's Chromium on the same
machine did not finish in fifteen minutes.

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
