# Pipeline Header Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop host paths reaching any tool's argv, so they stop appearing in
output picture headers, and let the provenance chain through to the calibrated
picture.

**Architecture:** One new pure module names every file a run reads under a
`/work` path that keeps the basename and drops the directory. The staging
boundary (`executeInWorker`) applies it, so the orchestrator, the filter stage
and the `release` bookkeeping never learn about it. With no host path left in
an argv, `-h` on the fourth correction stage stops being load-bearing and the
stage collapses into the same argument builder the other three use.

**Tech Stack:** TypeScript, Jest, Radiance/hdrgen compiled to WebAssembly, Next
static export inside Tauri.

**Design:** [`docs/superpowers/specs/2026-08-05-pipeline-header-provenance-design.md`](../specs/2026-08-05-pipeline-header-provenance-design.md)
**Closes:** [#241](https://github.com/radiantlab/LumiLab/issues/241)

## Global Constraints

- **No new dependencies.** Everything here is standard library plus what the
  repo already imports.
- **Paths stay opaque keys.** `prepareInputs`, `maybeFilter`, `filterImages`
  and `runner.release(consumed)` must not be modified at all, and no code may
  start branching on what a path looks like. If a task seems to need one of
  those changed, the boundary is in the wrong place; stop and re-read the
  design. (Task 4 does edit `warnIfResolutionDependent`, but only the text of
  the warning it emits, never how it resolves the path.)
- **The caller's params object is never mutated.** `runs/page.tsx:95` records
  the executed inputs into run history for display, and the form holds the same
  strings.
- **Basenames survive, directories do not.** `CF_f5d6.cal` names the aperture
  it was derived at; the directory is the part that leaks.
- **Windows separators count.** Tauri hands back native paths, so a basename
  helper that splits only on `/` keeps the entire `C:\Users\...` string.
- **Lint and format with `npx ultracite fix`** before each commit. The repo uses
  Biome via Ultracite, and object keys are sorted alphabetically in this
  codebase.
- **Commit style:** lowercase `type(scope): summary`, imperative, and end the
  message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/pipeline/stages.ts` | Gains `basename`, loses `photometricArgs`. Already owns `WORK_DIR` and `workPath`, so it is where path helpers live. |
| `src/lib/pipeline/source-paths.ts` | **New.** Pure: given params, returns params naming work paths plus the work-path-to-source map. Knows nothing about IO. |
| `src/app/pipeline/pipeline-worker-client.ts` | Applies the map when staging, sends the rewritten params. |
| `src/lib/pipeline/orchestrator.ts` | Loses `suppressHeader` and the `photometricArgs` branch; names basenames in calibration warnings. |

---

### Task 1: The naming layer

**Files:**
- Modify: `src/lib/pipeline/stages.ts:24-29` (add `basename` beside `workPath`)
- Test: `src/lib/pipeline/stages.test.ts`
- Create: `src/lib/pipeline/source-paths.ts`
- Test: `src/lib/pipeline/source-paths.test.ts`

**Interfaces:**
- Consumes: `PipelineParams` from `./types`, `WORK_DIR` from `./stages`.
- Produces: `basename(path: string): string` from `./stages`;
  `sanitizeSources(params: PipelineParams): SanitizedSources` and
  `interface SanitizedSources { params: PipelineParams; sources: Map<string, string> }`
  from `./source-paths`. Task 2 consumes both.

- [ ] **Step 1: Write the failing test for `basename`**

Append to `src/lib/pipeline/stages.test.ts`:

```ts
describe("basename", () => {
  it("keeps the last segment of a POSIX path", () => {
    expect(basename("/Users/someone/Drive/cal files/CF_f5d6.cal")).toBe(
      "CF_f5d6.cal"
    );
  });

  // Tauri hands back native paths, so a Windows run carries backslashes.
  // Splitting on "/" alone would return the whole string and leak exactly what
  // this helper exists to remove.
  it("keeps the last segment of a Windows path", () => {
    expect(basename("C:\\Users\\someone\\Pictures\\DSC_0001.JPG")).toBe(
      "DSC_0001.JPG"
    );
  });

  it("leaves a bare filename alone", () => {
    expect(basename("CF_f5d6.cal")).toBe("CF_f5d6.cal");
  });

  // A path ending in a separator has no segment to keep, and an empty string
  // would produce a work path ending in "-", which reads as a truncation.
  it("falls back to a placeholder when there is no segment", () => {
    expect(basename("/some/directory/")).toBe("file");
  });
});
```

Add `basename` to the import block at `src/lib/pipeline/stages.test.ts:11-25`,
keeping it alphabetical.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/lib/pipeline/stages.test.ts -t basename`
Expected: FAIL, `"basename" is not exported by "./stages"` (a TypeScript error
surfaced by ts-jest, not an assertion failure).

- [ ] **Step 3: Implement `basename`**

Insert into `src/lib/pipeline/stages.ts` immediately after `workPath` (line 29):

```ts
/**
 * The last segment of a path, for POSIX and Windows separators alike.
 *
 * Used to name a staged file after the one the user picked without carrying
 * the directory it came from. Radiance tools write their own argv into the
 * header of the picture they produce, so a directory that reaches an argument
 * list reaches the finished picture. See #241.
 */
export function basename(path: string): string {
  const segment = path.split(/[/\\]/).pop() ?? "";
  return segment === "" ? "file" : segment;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest src/lib/pipeline/stages.test.ts -t basename`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing tests for `sanitizeSources`**

Create `src/lib/pipeline/source-paths.test.ts`:

```ts
/**
 * The naming contract that keeps host paths out of picture headers.
 *
 * Every Radiance tool appends its own command line to the header of what it
 * writes, so any path handed to a tool is a path published in the output. The
 * observed case (#241) was a calibration file whose absolute path contained a
 * university email address, in every calibrated picture the tool produced.
 */

import { describe, expect, it } from "@jest/globals";
import { sanitizeSources } from "./source-paths";
import type { PipelineParams } from "./types";

function params(overrides: Partial<PipelineParams> = {}): PipelineParams {
  return {
    diameter: 3612,
    fisheyeCorrectionCal: "",
    horizontalAngle: 180,
    inputImages: [],
    legendHeight: "",
    legendWidth: "",
    neutralDensityCal: "",
    photometricAdjustmentCal: "",
    projection: "vta",
    responseFunction: "",
    scaleLabel: "",
    scaleLevels: "",
    scaleLimit: "",
    setName: "Images",
    verticalAngle: 180,
    vignettingCorrectionCal: "",
    xdim: 1000,
    xleft: 1019,
    ydim: 1000,
    ytop: 66,
    ...overrides,
  };
}

describe("sanitizeSources", () => {
  it("names frames by position and basename", () => {
    const { params: staged } = sanitizeSources(
      params({
        inputImages: [
          "/Users/someone/Pictures/bracket/DSC_0001.JPG",
          "/Users/someone/Pictures/bracket/DSC_0002.JPG",
        ],
      })
    );

    expect(staged.inputImages).toEqual([
      "/work/src/1-DSC_0001.JPG",
      "/work/src/2-DSC_0002.JPG",
    ]);
  });

  // Two directories can each hold a DSC_0001.JPG. Without the index they would
  // collide onto one staged file, and the merge would read the same frame
  // twice while reporting the right count.
  it("keeps same-named frames from different directories apart", () => {
    const { params: staged, sources } = sanitizeSources(
      params({
        inputImages: ["/a/DSC_0001.JPG", "/b/DSC_0001.JPG"],
      })
    );

    expect(new Set(staged.inputImages).size).toBe(2);
    expect(sources.get("/work/src/1-DSC_0001.JPG")).toBe("/a/DSC_0001.JPG");
    expect(sources.get("/work/src/2-DSC_0001.JPG")).toBe("/b/DSC_0001.JPG");
  });

  it("names each .cal after the correction it belongs to", () => {
    const { params: staged } = sanitizeSources(
      params({
        fisheyeCorrectionCal: "/cal/fisheye_corr.cal",
        neutralDensityCal: "/cal/NDfilter.cal",
        photometricAdjustmentCal: "/cal/CF_f5d6.cal",
        vignettingCorrectionCal: "/cal/vignetting.cal",
      })
    );

    expect(staged.fisheyeCorrectionCal).toBe("/work/cal/fisheye-fisheye_corr.cal");
    expect(staged.vignettingCorrectionCal).toBe(
      "/work/cal/vignetting-vignetting.cal"
    );
    expect(staged.neutralDensityCal).toBe("/work/cal/neutral-NDfilter.cal");
    expect(staged.photometricAdjustmentCal).toBe(
      "/work/cal/photometric-CF_f5d6.cal"
    );
  });

  // One file can legitimately serve two corrections. The slot prefix is what
  // stops the second staging overwriting the first under one key.
  it("keeps one file supplied to two slots apart", () => {
    const { params: staged, sources } = sanitizeSources(
      params({
        neutralDensityCal: "/cal/same.cal",
        photometricAdjustmentCal: "/cal/same.cal",
      })
    );

    expect(staged.neutralDensityCal).not.toBe(staged.photometricAdjustmentCal);
    expect(sources.get("/work/cal/neutral-same.cal")).toBe("/cal/same.cal");
    expect(sources.get("/work/cal/photometric-same.cal")).toBe("/cal/same.cal");
  });

  it("names the response function", () => {
    const { params: staged } = sanitizeSources(
      params({ responseFunction: "/Users/someone/resp/response_function.rsp" })
    );

    expect(staged.responseFunction).toBe(
      "/work/src/response-response_function.rsp"
    );
  });

  // An unsupplied slot is an empty string, which the orchestrator tests for to
  // decide whether the stage runs at all. Naming it would turn every run into
  // a fully calibrated one against files that do not exist.
  it("leaves unsupplied slots empty", () => {
    const { params: staged, sources } = sanitizeSources(params());

    expect(staged.fisheyeCorrectionCal).toBe("");
    expect(staged.responseFunction).toBe("");
    expect(sources.size).toBe(0);
  });

  // Run history records the executed inputs for display, and the form holds
  // the same strings. A user must keep seeing the file they picked.
  it("does not mutate the params it was given", () => {
    const original = params({
      inputImages: ["/a/DSC_0001.JPG"],
      photometricAdjustmentCal: "/cal/CF_f5d6.cal",
    });

    sanitizeSources(original);

    expect(original.inputImages).toEqual(["/a/DSC_0001.JPG"]);
    expect(original.photometricAdjustmentCal).toBe("/cal/CF_f5d6.cal");
  });

  // The staging loop fails on the first file it cannot read, and the comment
  // there says a missing *input* should fail before any wasm module loads.
  // That only holds while frames are staged first.
  it("orders the map inputs first, then response, then corrections", () => {
    const { sources } = sanitizeSources(
      params({
        fisheyeCorrectionCal: "/cal/f.cal",
        inputImages: ["/a/1.jpg"],
        responseFunction: "/r/resp.rsp",
      })
    );

    expect([...sources.keys()]).toEqual([
      "/work/src/1-1.jpg",
      "/work/src/response-resp.rsp",
      "/work/cal/fisheye-f.cal",
    ]);
  });

  it("carries every non-path field through untouched", () => {
    const { params: staged } = sanitizeSources(
      params({ inputImages: ["/a/1.jpg"], setName: "North facade" })
    );

    expect(staged.setName).toBe("North facade");
    expect(staged.diameter).toBe(3612);
    expect(staged.projection).toBe("vta");
  });
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `npx jest src/lib/pipeline/source-paths.test.ts`
Expected: FAIL, `Cannot find module './source-paths'`.

- [ ] **Step 7: Implement `source-paths.ts`**

Create `src/lib/pipeline/source-paths.ts`:

```ts
/**
 * Names every file a run reads, so no host path reaches a tool's argv.
 *
 * Radiance tools append their own command line to the header of the picture
 * they write, and the pipeline names files by whatever string the host used to
 * find them. On the desktop that is an absolute path from the native file
 * dialog, so the finished picture carries the user's home directory, their
 * cloud-drive account, and whatever else the path spells out. The observed
 * case was a university email address in every calibrated picture (#241).
 *
 * The browser never had the problem: `vfs.ts` already hands out synthetic
 * `/session/...` and `/presets/...` paths. This gives the desktop the same
 * shape, and as a side effect makes the header identical on both hosts for the
 * same inputs, which is what makes a published picture reproducible.
 *
 * Pure, and deliberately so. It decides names; the caller stages the bytes.
 */

import { basename, WORK_DIR } from "./stages";
import type { PipelineParams } from "./types";

/**
 * The four correction slots, named after the stage rather than the form field.
 *
 * The name reaches the picture header, so it should read as the pipeline step
 * a reader can look up, not as a UI label.
 */
const CAL_SLOTS = [
  ["fisheyeCorrectionCal", "fisheye"],
  ["vignettingCorrectionCal", "vignetting"],
  ["neutralDensityCal", "neutral"],
  ["photometricAdjustmentCal", "photometric"],
] as const;

export interface SanitizedSources {
  /** Params naming work paths. The object handed in is left untouched. */
  params: PipelineParams;
  /** Work path to the path its bytes must be read from, in staging order. */
  sources: Map<string, string>;
}

export function sanitizeSources(params: PipelineParams): SanitizedSources {
  const sources = new Map<string, string>();

  // 1-based, matching the index `prepareInputs` gives the converted TIFFs, so
  // the two numbering schemes read the same way in a status log.
  const inputImages = params.inputImages.map((path, index) => {
    const work = `${WORK_DIR}/src/${index + 1}-${basename(path)}`;
    sources.set(work, path);
    return work;
  });

  const staged: PipelineParams = { ...params, inputImages };

  if (params.responseFunction !== "") {
    const work = `${WORK_DIR}/src/response-${basename(params.responseFunction)}`;
    sources.set(work, params.responseFunction);
    staged.responseFunction = work;
  }

  for (const [field, slot] of CAL_SLOTS) {
    const path = params[field];
    // An empty slot means the correction does not run. Naming it would stage a
    // file that does not exist and turn every run into a calibrated one.
    if (path === "") {
      continue;
    }
    const work = `${WORK_DIR}/cal/${slot}-${basename(path)}`;
    sources.set(work, path);
    staged[field] = work;
  }

  return { params: staged, sources };
}
```

- [ ] **Step 8: Run them and watch them pass**

Run: `npx jest src/lib/pipeline/source-paths.test.ts src/lib/pipeline/stages.test.ts`
Expected: PASS, all tests in both files.

- [ ] **Step 9: Commit**

```bash
npx ultracite fix src/lib/pipeline/source-paths.ts src/lib/pipeline/source-paths.test.ts src/lib/pipeline/stages.ts src/lib/pipeline/stages.test.ts
git add src/lib/pipeline/source-paths.ts src/lib/pipeline/source-paths.test.ts src/lib/pipeline/stages.ts src/lib/pipeline/stages.test.ts
git commit -m "feat(pipeline): name staged files without their directories

Radiance tools write their own argv into the header of the picture they
produce, so a path handed to a tool is a path published in the output. The
naming layer keeps the basename, which carries the meaning, and drops the
directory, which is what leaks. Not wired up yet.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Stage under the sanitized names

**Files:**
- Modify: `src/app/pipeline/pipeline-worker-client.ts:69-90` (replace
  `referencedFiles` and the staging loop) and `:168-172` (send the rewritten
  params)
- Test: `src/app/pipeline/pipeline-worker-client.test.ts:211-221` (existing
  assertion changes), plus new cases

**Interfaces:**
- Consumes: `sanitizeSources` and `SanitizedSources` from Task 1.
- Produces: no new exports. After this task the worker receives work paths, and
  every downstream consumer sees them.

- [ ] **Step 1: Update the existing staging assertion and add the new cases**

In `src/app/pipeline/pipeline-worker-client.test.ts`, replace the body of the
test at line 211 (`"still hands the worker the bytes it staged"`) with:

```ts
  it("still hands the worker the bytes it staged", async () => {
    installWorkerDouble();
    const store = sessionStore({ "/session/1/a.jpg": [1, 2, 3] });

    await run(store, params({ inputImages: ["/session/1/a.jpg"] }));

    // Protecting the caller's buffers by sending the worker an empty view
    // would be no fix at all, so what arrived is asserted as well as what
    // survived. The key is the staged name, not the source: see #241.
    expect(received[0]).toEqual({ "/work/src/1-a.jpg": [1, 2, 3] });
  });
```

Then append these tests inside the same `describe`:

```ts
  it("stages every file under a name that carries no directory", async () => {
    installWorkerDouble();
    const store = sessionStore({
      "/session/1/DSC_0001.JPG": [1],
      "/session/2/CF_f5d6.cal": [2],
      "/session/3/response_function.rsp": [3],
    });

    await run(
      store,
      params({
        inputImages: ["/session/1/DSC_0001.JPG"],
        photometricAdjustmentCal: "/session/2/CF_f5d6.cal",
        responseFunction: "/session/3/response_function.rsp",
      })
    );

    expect(Object.keys(received[0]).sort()).toEqual([
      "/work/cal/photometric-CF_f5d6.cal",
      "/work/src/1-DSC_0001.JPG",
      "/work/src/response-response_function.rsp",
    ]);
  });

  it("reads from the source path and stages under the work path", async () => {
    installWorkerDouble();
    const store = sessionStore({ "/session/1/a.jpg": [9, 9] });

    await run(store, params({ inputImages: ["/session/1/a.jpg"] }));

    // The bytes have to come from where the file actually is; only the name
    // the worker sees changes.
    expect(received[0]["/work/src/1-a.jpg"]).toEqual([9, 9]);
  });

  it("leaves the caller's params naming the files the user picked", async () => {
    installWorkerDouble();
    const store = sessionStore({ "/session/1/a.jpg": [1] });
    const original = params({ inputImages: ["/session/1/a.jpg"] });

    await run(store, original);

    // Run history records these for display. Rewriting them in place would
    // show the user /work paths for files they chose themselves.
    expect(original.inputImages).toEqual(["/session/1/a.jpg"]);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/app/pipeline/pipeline-worker-client.test.ts`
Expected: FAIL. Three tests report staged keys of `/session/...` where
`/work/...` was expected; `"leaves the caller's params"` passes already,
because nothing mutates params yet.

- [ ] **Step 3: Replace `referencedFiles` with the sanitized map**

In `src/app/pipeline/pipeline-worker-client.ts`, delete the whole
`referencedFiles` function (lines 68-78, including its doc comment) and add the
import:

```ts
import { sanitizeSources } from "@/lib/pipeline/source-paths";
```

Then replace the staging block at the top of `executeInWorker`:

```ts
export async function executeInWorker(
  options: ExecuteOptions
): Promise<PipelineRunResult> {
  const files: Record<string, Uint8Array> = {};

  // Named without their directories, so no host path reaches a tool's argv and
  // therefore none reaches the header of the finished picture (#241). The
  // caller's params keep the paths the user picked: run history displays them.
  const { params: stagedParams, sources } = sanitizeSources(options.params);

  // Staged up front rather than lazily: a missing input should fail before any
  // wasm module is instantiated, not eight stages in.
  for (const [work, source] of sources) {
    // biome-ignore lint/performance/noAwaitInLoops: reads are sequential so a missing file fails on its own path rather than inside an aggregate rejection
    files[work] = owned(await options.read(source));
  }
```

The RAW peek loop that follows is unchanged: it iterates
`options.params.inputImages` because the RAW preview cache is keyed by the
host path, and it stages under `workPath(\`input${index}.tiff\`)`, which
`prepareInputs` looks for by the same 1-based index.

- [ ] **Step 4: Send the rewritten params**

At `src/app/pipeline/pipeline-worker-client.ts:168-172`, change the request:

```ts
      const request: PipelineRunRequest = {
        files,
        params: stagedParams,
        wasmBaseUrl: options.wasmBaseUrl,
      };
```

- [ ] **Step 5: Run the whole suite and watch it pass**

Run: `npx jest`
Expected: PASS, every suite.

Nothing downstream reads the source paths back: `run-wasm-pipeline.ts` touches
only `params.setName` (`:188`, `:232`) and `params.outputPath` (`:205`) after
the run, and the form field the web e2e suite inspects
(`e2e-web/tests/support.ts:157`) is the user's own config, which this does not
touch. So a failure here means something reads paths back out of the worker
request that this plan did not account for. Stop and report it rather than
adjusting the assertion.

- [ ] **Step 6: Commit**

```bash
npx ultracite fix src/app/pipeline/pipeline-worker-client.ts src/app/pipeline/pipeline-worker-client.test.ts
git add src/app/pipeline/pipeline-worker-client.ts src/app/pipeline/pipeline-worker-client.test.ts
git commit -m "fix(pipeline): stage source files under names that carry no directory

The desktop staged every file under the absolute path the native dialog
returned, so hdrgen and pcomb were handed host paths and wrote them into the
headers of both output pictures. The browser never had the problem, because
vfs.ts already hands out synthetic paths; this gives the desktop the same
shape.

Done at the staging boundary, so prepareInputs, the filter stage and the
release bookkeeping are untouched: they treat a path as an opaque key into the
virtual filesystem, which is what makes this containable.

Closes #241 for the leak; the header flag follows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: One argument builder for all four corrections

**Files:**
- Modify: `src/lib/pipeline/stages.ts:155-179` (delete `photometricArgs`,
  rewrite the `pcombCalArgs` comment)
- Modify: `src/lib/pipeline/orchestrator.ts:23` (import), `:81-89`
  (`Correction`), `:252-288` (the four literals), `:308-311` (the branch)
- Test: `src/lib/pipeline/stages.test.ts:206-226`
- Test: `src/lib/pipeline/orchestrator.test.ts:246-257`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `photometricArgs` no longer exists. `Correction` no longer has
  `suppressHeader`. `pcombCalArgs(calFile: string, input: string): string[]` is
  unchanged and is now the only pcomb correction builder.

- [ ] **Step 1: Rewrite the failing argv tests**

In `src/lib/pipeline/stages.test.ts`, replace both tests at lines 206-226 with:

```ts
  it("all four .cal corrections differ only in the file they pass", () => {
    // Including the photometric adjustment, which used to add `-h` and so
    // discarded everything the three before it had accumulated. See #241.
    expect(pcombCalArgs("fisheye.cal", "in.hdr")).toEqual([
      "-f",
      "fisheye.cal",
      "in.hdr",
    ]);
    expect(pcombCalArgs("cf.cal", "in.hdr")).toEqual([
      "-f",
      "cf.cal",
      "in.hdr",
    ]);
  });
```

Remove `photometricArgs` from the import block at lines 11-25.

In `src/lib/pipeline/orchestrator.test.ts`, replace lines 250-257 (the second
`pcomb` assertion and the comment above it) with:

```ts
    // The photometric adjustment is last and passes the same arguments as the
    // other three: it used to add `-h`, which discarded the provenance the
    // earlier stages had accumulated (#241).
    expect(call(pcomb, 1).args).toEqual([
      "-f",
      "/cal/cf.cal",
      "/work/projection_adjustment.hdr",
    ]);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/lib/pipeline/stages.test.ts src/lib/pipeline/orchestrator.test.ts`
Expected: FAIL. The orchestrator test reports a received array beginning
`"-h"`; the stages file fails to compile once `photometricArgs` leaves the
import, which is the point.

- [ ] **Step 3: Delete `photometricArgs`**

In `src/lib/pipeline/stages.ts`, delete lines 155-179 entirely (the
`photometricArgs` doc comment and function) and replace the `pcombCalArgs`
comment at lines 147-150 with:

```ts
/**
 * pcomb with a `.cal` file. All four corrections use it, differing only in
 * which file they pass.
 *
 * The photometric adjustment used to have its own builder that additionally
 * passed `-h`, which stops pcomb copying the header it was handed. It was the
 * only one of the four that did, so the fourth stage discarded everything the
 * three before it had accumulated: the camera, hdrgen's record of which frames
 * were merged, the original capture date, `PRIMARIES`, `EXPOSURE`, and the
 * crop and resize lines. A calibrated picture therefore carried less
 * provenance than an uncalibrated one, which runs no pcomb stage at all.
 *
 * The flag was never chosen. `extra/ldr-to-hdr.sh:197` has the same asymmetry,
 * `photometric_adjustment.rs` transcribed it in 9825c4b without a word, and
 * this port carried it across for parity with a file that no longer exists.
 * Table 3 step 9 of Pierson et al. (2019) does not call for it. See #241.
 */
```

- [ ] **Step 4: Collapse the branch in the orchestrator**

In `src/lib/pipeline/orchestrator.ts`, remove `photometricArgs` from the import
block at line 23. Delete the `suppressHeader: boolean;` field at line 88 and
its doc-free companions: the four `suppressHeader: false,` / `true,` lines at
`:262`, `:270`, `:278` and `:286`. Then replace lines 308-311 with:

```ts
    await run(
      runner,
      "pcomb",
      pcombCalArgs(correction.cal, workPath(next)),
      { stdout: workPath(correction.output) }
    );
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx jest src/lib/pipeline`
Expected: PASS, every pipeline suite including `integration.test.ts`.

- [ ] **Step 6: Commit**

```bash
npx ultracite fix src/lib/pipeline/stages.ts src/lib/pipeline/stages.test.ts src/lib/pipeline/orchestrator.ts src/lib/pipeline/orchestrator.test.ts
git add src/lib/pipeline/stages.ts src/lib/pipeline/stages.test.ts src/lib/pipeline/orchestrator.ts src/lib/pipeline/orchestrator.test.ts
git commit -m "fix(pipeline): let the calibrated picture keep its provenance

The photometric adjustment was the only one of the four corrections to pass
pcomb -h, so it threw away everything the three before it had accumulated: the
camera, the frames hdrgen merged, the capture date, and the crop and resize
lines. A picture processed with calibration files recorded less than one
processed without, which is backwards for outputs that go into papers.

The flag traces to extra/ldr-to-hdr.sh rather than to the tutorial, whose
Table 3 step 9 is pcomb -s factor. With the paths sanitized it was no longer
holding anything back, so the stage collapses into pcombCalArgs and the
special case goes.

Closes #241.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Calibration warnings name the file, not the staging path

**Files:**
- Modify: `src/lib/pipeline/orchestrator.ts:591-622`
  (`warnIfResolutionDependent`)
- Test: `src/lib/pipeline/orchestrator.test.ts:459-551`

**Interfaces:**
- Consumes: `basename` from Task 1.
- Produces: no signature change. `calWarning(label, path, ...)` already takes
  the path as a parameter, so only what the caller passes changes.

- [ ] **Step 1: Write the failing tests**

In `src/lib/pipeline/orchestrator.test.ts`, inside the
`"calibration file resolution warnings"` describe, append:

```ts
  it("names the file rather than the path it was staged under", async () => {
    const runner = new FakeRunner();
    await runner.writeFile("/work/cal/vignetting-VC_f5d6.cal", HARDCODED);
    const events: PipelineStatusPayload[] = [];

    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params({
        vignettingCorrectionCal: "/work/cal/vignetting-VC_f5d6.cal",
      }),
      runner,
    });

    const warning = warnings(events).find(
      (event) => event.step === "cal_check"
    );
    // The transcript is stored with the run, so a path in it is a path kept.
    expect(warning?.message).toContain("VC_f5d6.cal");
    expect(warning?.message).not.toContain("/work/cal/");
  });

  it("names the file when it cannot be read either", async () => {
    const runner = new FakeRunner();
    const events: PipelineStatusPayload[] = [];

    await runPipeline({
      emit: (payload) => events.push(payload),
      params: params({ fisheyeCorrectionCal: "/work/cal/fisheye-missing.cal" }),
      runner,
    });

    const warning = warnings(events).find(
      (event) => event.step === "cal_check"
    );
    expect(warning?.message).toContain("missing.cal");
    expect(warning?.message).not.toContain("/work/cal/");
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest src/lib/pipeline/orchestrator.test.ts -t "names the file"`
Expected: FAIL, both, on the `not.toContain("/work/cal/")` assertion.

- [ ] **Step 3: Name the basename in both messages**

In `src/lib/pipeline/orchestrator.ts`, add `basename` to the import from
`./stages`, then rewrite the body of `warnIfResolutionDependent` (lines
599-621):

```ts
  // The staged name, not the path. The path is a work path now, which means
  // nothing to a user, and the run transcript is stored with the run, so
  // whatever goes in a warning is kept alongside it.
  const name = basename(calPath);
  let text: string;
  try {
    text = new TextDecoder().decode(await runner.readFile(calPath));
  } catch (error) {
    emit({
      kind: "warning",
      message: `Could not read the ${label} calibration file ${name}: ${error}`,
      progress: null,
      step: "cal_check",
    });
    return;
  }

  const constants = resolutionDependentConstants(text);
  if (constants === null) {
    return;
  }
  emit({
    kind: "warning",
    message: calWarning(label, name, width, height, constants),
    progress: null,
    step: "cal_check",
  });
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest src/lib/pipeline/orchestrator.test.ts`
Expected: PASS, the whole file. The four pre-existing warning tests assert on
basenames already (`toContain("vignetting.cal")`), so they are unaffected.

- [ ] **Step 5: Commit**

```bash
npx ultracite fix src/lib/pipeline/orchestrator.ts src/lib/pipeline/orchestrator.test.ts
git add src/lib/pipeline/orchestrator.ts src/lib/pipeline/orchestrator.test.ts
git commit -m "fix(pipeline): name the calibration file in warnings, not its staging path

Staged files are named /work/cal/<slot>-<file> now, which means nothing to a
user reading a status log. The run transcript is stored with the run, so this
is also the last place a full host path was being written down.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Verify against real brackets

Nothing in the suite asserts on header content, so this is the only step that
proves the change did what it was for. It cannot be skipped, and its result is
recorded rather than assumed.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-05-pipeline-header-provenance-design.md`
  (status line, and the verification section gains its result)

- [ ] **Step 1: Run the full gates**

```bash
npx jest
npx tsc --noEmit
npx ultracite check
```

Expected: all suites pass, no type errors, no new warnings. There is one
pre-existing warning about an unused suppression at
`src/lib/pipeline/orchestrator.ts:532`; leave it, it is tracked separately.

- [ ] **Step 2: Build and launch the desktop app**

```bash
npm run tauri dev
```

Note: `npm run build` needs the sandbox disabled in this environment, and its
port-binding failure reads like a build error while still exiting 0. Read the
output rather than trusting the exit code.

- [ ] **Step 3: Run the JPEG bracket with calibration files**

Use `e2e-tests/test/inputs/JPEG` as the bracket and the `.cal` files in
`example/`. Supply all four corrections and the response function, so every
stage that can name a path does.

- [ ] **Step 4: Read the header of both outputs**

```bash
getinfo < <output>.hdr
getinfo < <output>_falsecolor.hdr
```

Confirm, and record each in the design doc:

1. No host path, home directory, user name or email address anywhere.
2. The calibrated picture carries the provenance chain: camera, capture date,
   hdrgen's frame list, the crop and resize lines, and four `pcomb` lines
   showing `/work/cal/<slot>-<basename>`.
3. Exactly one **active** `VIEW=` line. This is the `-h` hypothesis under test:
   `-h` may have been standing in for Table 3 step 10's `sed '/VIEW/d'`. A
   second active line here means the flag was load-bearing after all, so stop
   and report rather than working around it.
4. hdrgen's provenance names `/work/src/<n>-<basename>` frames.

- [ ] **Step 5: Repeat with the example CR2 bracket**

The RAW branch already re-pathed its frames, so this confirms nothing
regressed rather than that anything was fixed. Frames are 5796x3870 and a full
bracket is around 673 MB of decoded TIFF, so give it room.

- [ ] **Step 6: Record the result and commit**

Update the design doc's status line to `implemented` and write what the
headers actually contained under its verification section, including the
`VIEW=` count.

```bash
git add docs/superpowers/specs/2026-08-05-pipeline-header-provenance-design.md
git commit -m "docs: record the header verification for #241

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Out of scope, to be filed after this lands

Confirm with the maintainer before opening these; they are noted here so they
are not lost, not so they are filed automatically.

- **The false-colour map is header-stripped too.** `falsecolor.ts:153` and
  `:271` pass `-h` to `pcompos`, so the second of the two files a run produces
  carries no provenance either. Same argument as #241, different tool.
- **Table 3 step 9 is `pcomb -s factor`.** The app requires a hand-written
  `.cal` where the tutorial takes a number. Numerically identical for
  `example/calibration_factor.cal`, which is a plain 1.18x scalar, so this is a
  usability gap. Already noted in the tutorial-conformance spec §9.
