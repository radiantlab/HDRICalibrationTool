# Run History and Input Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a permanent, inspectable record of every pipeline run with the inputs that produced it, and let a camera and lens calibration be saved once as a named preset and reapplied.

**Architecture:** Entirely frontend. The app already has `fs:allow-*` capabilities with an unrestricted `fs:scope`, so history and presets are JSON plus copied calibration files under the Tauri app-config directory, reached with `@tauri-apps/api/path` and `@tauri-apps/plugin-fs`. No Rust changes. The logic that can be wrong (outcome classification, grouping, hash comparison, preset field partitioning) is isolated in pure functions with their own tests; the filesystem layer is thin and mocked in tests.

**Tech Stack:** Next.js 15, React 19, shadcn/ui, zustand, `@tauri-apps/plugin-fs`, Jest + Testing Library.

**Source spec:** `docs/superpowers/specs/2026-07-27-run-console-history-and-mask-editor.md`, section C, including the decisions in C3.

## Scope note

This is plan 3 of 3. It is written as **two phases that can ship separately**:

- **Phase 1, Tasks 1 to 5: run history (C1).** Delivers most of the value on its own, because "reuse inputs" covers the common case that presets exist for.
- **Phase 2, Tasks 6 to 8: presets (C2).** Depends on Phase 1's storage module. Do not start it until Phase 1 is in use.

**Depends on the run console plan** (`2026-07-27-run-console.md`) for `LogEntry`, which is the record format history stores. Build that first; this plan assumes `usePipelineStatus()` exposes `log`.

## Global Constraints

- **No Rust changes.** Everything is reachable from the webview under the existing capabilities.
- **Use shadcn/ui components** for anything with interaction semantics. `Select` and `Dialog` already exist by this point; `Table` may need adding with `npx shadcn@latest add table` (**needs the sandbox disabled**, see below).
- **`npx shadcn` needs the sandbox disabled.** It fails with `EPERM` writing `~/.npm/_cacache`, which npm misreports as root-owned files; there are none.
- **`crypto.subtle` is undefined under jsdom.** Verified: `crypto: object subtle: undefined`. Task 6 adds a shim to `jest.setup.js` using Node's `webcrypto`; without it every hashing test fails on an unrelated error.
- **`jest.mock` must use the global `jest`, not the binding from `@jest/globals`.** The SWC transform only hoists the global form above imports.
- **Every stored file carries a `version` field** from the first write, so a later format change has something to branch on.
- **History is never pruned automatically** (decision C3). Because of that, the count and on-disk size must be visible in the UI; that is Task 5, not a nicety.
- **Test command:** `npm test`. Lint: `npm run check`. Types: `npx tsc --noEmit`.
- **Prose in comments and UI copy uses no em dashes.**

## Storage layout

```
<app-config>/
  presets/
    presets.json                     index: id, name, values, file hashes
    <preset-id>/
      response.rsp                   copies, per decision C3
      fisheye.cal  vignetting.cal  nd.cal  calibration.cal
  history/
    runs.json                        append-only, never auto-pruned
```

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src/lib/app-storage.ts` | Versioned JSON read/write under the app-config dir. |
| `src/lib/run-history.ts` | Run record type, append/read/clear, outcome classification. |
| `src/lib/presets.ts` | Preset type, file copying, hashing, change detection. |
| `src/app/home-page/pipeline-config-store.ts` | `useGlobalPipelineConfig`, lifted out of `page.tsx`. |
| `src/app/runs/page.tsx` | The Runs page. |
| `src/app/home-page/preset-bar.tsx` | Preset selector, save, change indicator. |

**Modified:** `src/app/home-page/page.tsx`, `src/app/navigation.tsx`, `jest.setup.js`.

---

## Phase 1: Run history

### Task 1: Versioned storage under the app-config directory

**Files:**
- Create: `src/lib/app-storage.ts`, `__tests__/app-storage.test.ts`

**Interfaces:**
- Produces: `storagePath(...segments: string[]): Promise<string>`, `readJson<T>(relativePath: string, fallback: T): Promise<T>`, `writeJson(relativePath: string, value: object): Promise<void>`, and `STORAGE_VERSION`.

`readJson` returns the fallback for a missing file and for a file whose `version` does not match, rather than throwing. A corrupt or future-versioned history must not stop the app from running; it is a record, not state the app depends on.

- [ ] **Step 1: Write the failing test**

Create `__tests__/app-storage.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";

const files: Record<string, string> = {};

jest.mock("@tauri-apps/api/path", () => ({
  appConfigDir: () => Promise.resolve("/cfg"),
  join: (...parts: string[]) => Promise.resolve(parts.join("/")),
}));

jest.mock("@tauri-apps/plugin-fs", () => ({
  exists: (path: string) => Promise.resolve(path in files),
  mkdir: () => Promise.resolve(),
  readTextFile: (path: string) => Promise.resolve(files[path]),
  writeTextFile: (path: string, contents: string) => {
    files[path] = contents;
    return Promise.resolve();
  },
}));

declare const jest: typeof import("@jest/globals").jest;

import { readJson, STORAGE_VERSION, writeJson } from "../src/lib/app-storage";

describe("app storage", () => {
  it("round-trips a value and stamps the version", async () => {
    await writeJson("history/runs.json", { runs: [1, 2] });

    expect(JSON.parse(files["/cfg/history/runs.json"]).version).toBe(
      STORAGE_VERSION
    );
    expect(await readJson("history/runs.json", { runs: [] })).toEqual({
      runs: [1, 2],
      version: STORAGE_VERSION,
    });
  });

  it("returns the fallback when the file is absent", async () => {
    expect(await readJson("history/missing.json", { runs: [] })).toEqual({
      runs: [],
    });
  });

  it("returns the fallback rather than throwing on unreadable content", async () => {
    files["/cfg/history/bad.json"] = "{not json";

    expect(await readJson("history/bad.json", { runs: [] })).toEqual({
      runs: [],
    });
  });

  it("returns the fallback when the version does not match", async () => {
    files["/cfg/history/old.json"] = JSON.stringify({ runs: [9], version: 0 });

    expect(await readJson("history/old.json", { runs: [] })).toEqual({
      runs: [],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- __tests__/app-storage.test.ts`
Expected: FAIL, `Cannot find module '../src/lib/app-storage'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/app-storage.ts`:

```ts
import { appConfigDir, join } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

/** Bumped only when a stored shape changes incompatibly. */
export const STORAGE_VERSION = 1;

export async function storagePath(...segments: string[]): Promise<string> {
  return await join(await appConfigDir(), ...segments);
}

/**
 * Reads a versioned JSON file, falling back rather than throwing.
 *
 * History and presets are records, not state the app depends on, so a corrupt
 * or future-versioned file must never stop the app from starting.
 */
export async function readJson<T>(
  relativePath: string,
  fallback: T
): Promise<T> {
  const path = await storagePath(...relativePath.split("/"));
  try {
    if (!(await exists(path))) {
      return fallback;
    }
    const parsed = JSON.parse(await readTextFile(path));
    if (parsed?.version !== STORAGE_VERSION) {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(
  relativePath: string,
  value: object
): Promise<void> {
  const segments = relativePath.split("/");
  const path = await storagePath(...segments);
  if (segments.length > 1) {
    await mkdir(await storagePath(...segments.slice(0, -1)), {
      recursive: true,
    });
  }
  await writeTextFile(
    path,
    JSON.stringify({ ...value, version: STORAGE_VERSION }, null, 2)
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- __tests__/app-storage.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-storage.ts __tests__/app-storage.test.ts
git commit -m "feat(storage): versioned JSON storage under the app config dir"
```

---

### Task 2: Run records

**Files:**
- Create: `src/lib/run-history.ts`, `__tests__/run-history.test.ts`

**Interfaces:**
- Consumes: `readJson`, `writeJson` from Task 1; `LogEntry` from the run console plan.
- Produces: `RunRecord`, `RunOutcome`, `classifyOutcome(log, failure)`, `appendRun(record)`, `readRuns()`, `clearRuns()`, `historyStats()`.

Per decision C3, **every attempt is recorded**, including ones rejected before the backend was called. `classifyOutcome` is the pure part and carries the rules.

- [ ] **Step 1: Write the failing test**

Create `__tests__/run-history.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import { classifyOutcome } from "../src/lib/run-history";

const step = (message: string) =>
  ({ at: "2026-07-27T12:00:00.000Z", kind: "step", message, step: null }) as const;
const warn = (message: string) =>
  ({ at: "2026-07-27T12:00:00.000Z", kind: "warning", message, step: null }) as const;

describe("classifyOutcome", () => {
  it("is ok when nothing was flagged", () => {
    expect(classifyOutcome([step("Merging exposures")], null)).toBe("ok");
  });

  it("is warning when the log holds a warning", () => {
    expect(
      classifyOutcome([step("Merging"), warn("vignetting.cal is fixed size")], null)
    ).toBe("warning");
  });

  it("is error when the run failed, even with no warnings", () => {
    expect(classifyOutcome([step("Merging")], "hdrgen exited 1")).toBe("error");
  });

  it("is rejected when the run never reached the backend", () => {
    expect(classifyOutcome([], "No images selected")).toBe("rejected");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/run-history.test.ts`
Expected: FAIL, `Cannot find module '../src/lib/run-history'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/run-history.ts`:

```ts
import { stat } from "@tauri-apps/plugin-fs";
import type { LogEntry } from "@/app/pipeline-status-context";
import { readJson, storagePath, writeJson } from "./app-storage";

export type RunOutcome = "ok" | "warning" | "error" | "rejected";

export interface RunRecord {
  finishedAt: string | null;
  id: string;
  /** The buildPipelineParams payload, verbatim, so reuse is a straight copy. */
  inputs: Record<string, unknown>;
  log: LogEntry[];
  outcome: RunOutcome;
  outputs: string[];
  presetName: string | null;
  /** Why a run failed or was rejected. Null when it succeeded. */
  reason: string | null;
  startedAt: string;
  toolPaths: {
    dcrawEmu: string;
    hdrgen: string;
    radiance: string;
  };
}

const HISTORY_FILE = "history/runs.json";

/**
 * A run that never reached the backend is "rejected" rather than "error":
 * it is a misconfiguration, not a processing failure, and the Runs page
 * filters the two apart. An empty log is what distinguishes them, since the
 * backend emits at least one step as soon as it starts.
 */
export function classifyOutcome(
  log: LogEntry[],
  failure: string | null
): RunOutcome {
  if (failure) {
    return log.length === 0 ? "rejected" : "error";
  }
  return log.some((entry) => entry.kind === "warning" || entry.kind === "error")
    ? "warning"
    : "ok";
}

export async function readRuns(): Promise<RunRecord[]> {
  const stored = await readJson<{ runs: RunRecord[] }>(HISTORY_FILE, {
    runs: [],
  });
  return stored.runs ?? [];
}

export async function appendRun(record: RunRecord): Promise<void> {
  const runs = await readRuns();
  await writeJson(HISTORY_FILE, { runs: [...runs, record] });
}

export async function clearRuns(): Promise<void> {
  await writeJson(HISTORY_FILE, { runs: [] });
}

/** Feeds the size indicator that unbounded retention requires. */
export async function historyStats(): Promise<{
  bytes: number;
  count: number;
}> {
  const runs = await readRuns();
  const path = await storagePath("history", "runs.json");
  let bytes = 0;
  try {
    bytes = (await stat(path)).size;
  } catch {
    // No history written yet.
  }
  return { bytes, count: runs.length };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- __tests__/run-history.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/run-history.ts __tests__/run-history.test.ts
git commit -m "feat(history): run record type and outcome classification"
```

---

### Task 3: Record every run

**Files:**
- Create: `src/app/home-page/pipeline-config-store.ts`
- Modify: `src/app/home-page/page.tsx`

**Interfaces:**
- Consumes: `appendRun`, `classifyOutcome` from Task 2; `log` from `usePipelineStatus`.
- Produces: `useGlobalPipelineConfig` exported from its own module, so the Runs page can write inputs back into the form.

`page.tsx` already writes a JSON trace on failure via `writePipelineTrace`. This
generalises that from failures to every attempt; the trace writer is removed once
history records the same inputs and error.

- [ ] **Step 1: Lift the config store out of the page**

Move the `useGlobalPipelineConfig` `create<...>` call verbatim from `page.tsx`
into `src/app/home-page/pipeline-config-store.ts`, export it, and import it back
into `page.tsx`. No behaviour change. Run `npm test` to confirm nothing moved
that should not have.

- [ ] **Step 2: Record the run**

In the submit handler, capture the start time and, on both branches of the
`invoke` promise, append a record. Replace the `writePipelineTrace` call with
the failure path below.

```tsx
            const startedAt = new Date().toISOString();
            const toolPaths = {
              dcrawEmu: settings.dcrawEmuPath,
              hdrgen: settings.hdrgenPath,
              radiance: settings.radiancePath,
            };

            const record = (failure: string | null, outputs: string[]) =>
              appendRun({
                finishedAt: new Date().toISOString(),
                id: startedAt,
                inputs: params as Record<string, unknown>,
                log,
                outcome: classifyOutcome(log, failure),
                outputs,
                presetName: null,
                reason: failure,
                startedAt,
                toolPaths,
              });

            invoke<string>("pipeline", params)
              .then((outputDirectory) => record(null, [outputDirectory]))
              .catch(async (error) => {
                await record(String(error), []);
                // existing error handling continues here
              });
```

The early `toast.error` returns above (no images, bad radius, bad angles) must
also call `record(<the same message>, [])` before returning, since decision C3
records attempts rejected before the backend was called.

`log` must be read at the time the record is written, not captured at submit
time, or it will be empty. Take it from a ref updated by an effect, or read it
from the store inside the callback.

- [ ] **Step 3: Verify**

Run: `npm test`, `npx tsc --noEmit`, `npm run check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/home-page/pipeline-config-store.ts src/app/home-page/page.tsx
git commit -m "feat(history): record every run attempt, not only failures"
```

---

### Task 4: The Runs page

**Files:**
- Create: `src/app/runs/page.tsx`, `__tests__/run-grouping.test.ts`
- Modify: `src/app/navigation.tsx`

**Interfaces:**
- Consumes: `readRuns`, `RunRecord` from Task 2.
- Produces: `groupRunsByDay(runs, today)`, pure and testable, plus the page.

Grouping and the outcome filter are what keep the page usable given unbounded
retention and the recording of rejected attempts.

- [ ] **Step 1: Write the failing test**

Create `__tests__/run-grouping.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import { groupRunsByDay } from "../src/app/runs/group-runs";

const run = (startedAt: string) =>
  ({ startedAt, id: startedAt }) as never;

describe("groupRunsByDay", () => {
  it("labels the current day as Today", () => {
    const groups = groupRunsByDay(
      [run("2026-07-27T12:00:00.000Z")],
      new Date("2026-07-27T18:00:00.000Z")
    );

    expect(groups[0].label).toBe("Today");
  });

  it("labels the previous day as Yesterday", () => {
    const groups = groupRunsByDay(
      [run("2026-07-26T12:00:00.000Z")],
      new Date("2026-07-27T18:00:00.000Z")
    );

    expect(groups[0].label).toBe("Yesterday");
  });

  it("orders newest first", () => {
    const groups = groupRunsByDay(
      [run("2026-07-20T12:00:00.000Z"), run("2026-07-27T12:00:00.000Z")],
      new Date("2026-07-27T18:00:00.000Z")
    );

    expect(groups[0].label).toBe("Today");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/run-grouping.test.ts`
Expected: FAIL, `Cannot find module '../src/app/runs/group-runs'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/runs/group-runs.ts`:

```ts
import type { RunRecord } from "@/lib/run-history";

export interface RunGroup {
  label: string;
  runs: RunRecord[];
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/**
 * Groups newest first, with friendly labels for the last two days.
 * `today` is a parameter rather than read from the clock so the labelling is
 * testable.
 */
export function groupRunsByDay(runs: RunRecord[], today: Date): RunGroup[] {
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  const byDay = new Map<string, RunRecord[]>();
  for (const record of runs) {
    const key = dayKey(record.startedAt);
    byDay.set(key, [...(byDay.get(key) ?? []), record]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, dayRuns]) => ({
      label:
        key === todayKey
          ? "Today"
          : key === yesterdayKey
            ? "Yesterday"
            : key,
      runs: [...dayRuns].sort((a, b) =>
        a.startedAt < b.startedAt ? 1 : -1
      ),
    }));
}
```

Then create `src/app/runs/page.tsx`: load runs with `readRuns()` in an effect,
render `groupRunsByDay(runs, new Date())`, and provide an outcome filter with the
shadcn `Select` (all / succeeded / warnings / failed / rejected, defaulting to
hiding `rejected`). Each row shows the time, set count, exposure count, and
outcome badge, with a shadcn `DropdownMenu` of actions (Task 5 fills these in).

Add the nav link in `src/app/navigation.tsx`, following the existing `Link`
pattern exactly, with `href="/runs"` and the label `Runs`.

- [ ] **Step 4: Verify**

Run: `npm test`, `npx tsc --noEmit`, `npm run check`
Expected: clean, 3 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/runs/ __tests__/run-grouping.test.ts src/app/navigation.tsx
git commit -m "feat(history): add a Runs page grouped by day with an outcome filter"
```

---

### Task 5: Row actions, clear history, and the size indicator

**Files:**
- Modify: `src/app/runs/page.tsx`

**Interfaces:**
- Consumes: `clearRuns`, `historyStats` from Task 2; `useGlobalPipelineConfig` from Task 3.

- [ ] **Step 1: Add the actions**

Per row, a `DropdownMenu` with:

- **Open folder**: `revealItemInDir(record.outputs[0])`, disabled when there are no outputs.
- **Open image**: `router.push(serializeViewerUrl("/image-viewer/view", { filePath: record.outputs[0] }))`.
- **View log**: a shadcn `Dialog` rendering `record.log` with the same timestamped layout as the run console.
- **Reuse inputs**: writes the record's inputs back into the form and navigates home.

Reuse works because `inputs` is the `buildPipelineParams` payload verbatim, so it
maps back field by field:

```tsx
  const reuse = (record: RunRecord) => {
    const inputs = record.inputs as ReturnType<typeof buildPipelineParams>;
    setGlobalConfig({
      cameraResponseLocation: inputs.responseFunction || null,
      correctionFiles: {
        calibrationFactor: inputs.photometricAdjustmentCal || null,
        fisheye: inputs.fisheyeCorrectionCal || null,
        neutralDensity: inputs.neutralDensityCal || null,
        vignetting: inputs.vignettingCorrectionCal || null,
      },
      fisheyeView: {
        horizontalViewDegrees: inputs.horizontalAngle,
        projection: inputs.projection,
        verticalViewDegrees: inputs.verticalAngle,
      },
      inputSets: [],
      lensMask: {
        radius: inputs.diameter / 2,
        x: inputs.xleft + inputs.diameter / 2,
        y: inputs.ytop + inputs.diameter / 2,
      },
      outputSettings: {
        filterIrrelevantSrcImages: inputs.filterImages,
        targetRes: inputs.xdim,
      },
      validityCheck: {
        measuredVerticalIlluminanceLux: inputs.measuredVerticalIlluminance,
      },
    });
    router.push("/home-page");
  };
```

The image set is deliberately not restored: those files belong to that capture.

- [ ] **Step 2: Add the footer**

Because history is never pruned automatically, show what it costs and offer the
only prune there is:

```tsx
      <div className="flex items-center justify-between border-t p-4 text-muted-foreground text-sm">
        <span>
          {stats.count} runs, {(stats.bytes / 1024).toFixed(0)} KB
        </span>
        <Button onClick={confirmClear} type="button" variant="outline">
          Clear history
        </Button>
      </div>
```

`confirmClear` opens a shadcn `Dialog` confirming the deletion, then calls
`clearRuns()` and reloads. Do not delete without confirmation: this is the user's
only record of what they ran.

- [ ] **Step 3: Verify in the running app**

Run a successful set, a set that produces a warning (point the vignetting `.cal`
at a mismatched resolution), and an attempt with no images selected. Confirm all
three appear with the right outcome, that the rejected one is hidden by the
default filter and appears when the filter is changed, that Reuse inputs
repopulates the form, and that the size indicator moves.

- [ ] **Step 4: Commit**

```bash
git add src/app/runs/page.tsx
git commit -m "feat(history): row actions, clear history and a size indicator"
```

---

## Phase 2: Input presets

### Task 6: The preset store

**Files:**
- Create: `src/lib/presets.ts`, `__tests__/presets.test.ts`
- Modify: `jest.setup.js`

**Interfaces:**
- Consumes: Task 1's storage.
- Produces: `Preset`, `PresetFile`, `sha256Hex(bytes)`, `presetFields(config)`, `savePreset(name, config)`, `readPresets()`, `changedSources(preset)`.

Decision C3: calibration files are **copied** into `presets/<id>/`, with the
source path and a content hash recorded so a re-derived calibration can be
detected rather than silently ignored.

- [ ] **Step 1: Add the crypto shim**

`crypto.subtle` is undefined under jsdom (verified). Append to `jest.setup.js`:

```js
// jsdom exposes crypto but not crypto.subtle, which the preset hashing uses.
const { webcrypto } = require("node:crypto");
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
}
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/presets.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import { presetFields, sha256Hex } from "../src/lib/presets";

describe("sha256Hex", () => {
  it("hashes deterministically", async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3]));
    const b = await sha256Hex(new Uint8Array([1, 2, 3]));
    const c = await sha256Hex(new Uint8Array([1, 2, 4]));

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});

describe("presetFields", () => {
  const config = {
    cameraResponseLocation: "/cal/response.rsp",
    correctionFiles: {
      calibrationFactor: "/cal/cf.cal",
      fisheye: "/cal/fisheye.cal",
      neutralDensity: null,
      vignetting: "/cal/vig.cal",
    },
    fisheyeView: {
      horizontalViewDegrees: 186,
      projection: "vta" as const,
      verticalViewDegrees: 186,
    },
    inputSets: [{ files: ["/a.jpg"], name: "set" }],
    lensMask: { radius: 1806, x: 2825, y: 1864 },
    outputSettings: { filterIrrelevantSrcImages: true, targetRes: 1000 },
    validityCheck: { measuredVerticalIlluminanceLux: 1240 },
  };

  it("keeps the one-time setup material", () => {
    const fields = presetFields(config);

    expect(fields.fisheyeView.verticalViewDegrees).toBe(186);
    expect(fields.outputSettings.targetRes).toBe(1000);
    expect(fields.lensMask).toEqual({ radius: 1806, x: 2825, y: 1864 });
  });

  it("excludes per-capture material", () => {
    const fields = presetFields(config) as Record<string, unknown>;

    expect(fields.inputSets).toBeUndefined();
    expect(fields.validityCheck).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- __tests__/presets.test.ts`
Expected: FAIL, `Cannot find module '../src/lib/presets'`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/presets.ts`. The partitioning is the important part and mirrors
the table in spec section C2: a preset is the tutorial's one-time setup and
nothing else.

```ts
import type { pipelineConfig } from "@/app/home-page/(pipeline-configuration)/config-provider";

export interface PresetFile {
  fileName: string;
  sha256: string;
  sourcePath: string;
}

export interface Preset {
  files: Partial<Record<PresetFileSlot, PresetFile>>;
  fisheyeView: pipelineConfig["fisheyeView"];
  id: string;
  /** The image dimensions the mask was drawn against, so it can be checked. */
  lensMaskImageSize: [number, number] | null;
  lensMask: pipelineConfig["lensMask"] | null;
  name: string;
  outputSettings: pipelineConfig["outputSettings"];
}

export type PresetFileSlot =
  | "calibrationFactor"
  | "fisheye"
  | "neutralDensity"
  | "response"
  | "vignetting";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The equipment half of the configuration.
 *
 * Per spec section C2, a preset holds the tutorial's one-time setup material
 * (response function, calibration files, view angles, projection, target
 * resolution, lens mask) and never the per-capture material (the image set and
 * the measured illuminance), which changes every time.
 */
export function presetFields(config: pipelineConfig) {
  return {
    fisheyeView: config.fisheyeView,
    lensMask: config.lensMask,
    outputSettings: config.outputSettings,
  };
}
```

Then the store itself:

```ts
const PRESETS_FILE = "presets/presets.json";

const SLOT_FILENAMES: Record<PresetFileSlot, string> = {
  calibrationFactor: "calibration.cal",
  fisheye: "fisheye.cal",
  neutralDensity: "nd.cal",
  response: "response.rsp",
  vignetting: "vignetting.cal",
};

export async function readPresets(): Promise<Preset[]> {
  const stored = await readJson<{ presets: Preset[] }>(PRESETS_FILE, {
    presets: [],
  });
  return stored.presets ?? [];
}

/**
 * Copies every supplied calibration file into presets/<id>/ so the preset
 * survives the originals being moved or deleted, recording each source path and
 * content hash so a re-derived calibration can be detected later (Task 7).
 */
export async function savePreset(
  id: string,
  name: string,
  config: pipelineConfig,
  lensMaskImageSize: [number, number] | null
): Promise<Preset> {
  const sources: Record<PresetFileSlot, string | null> = {
    calibrationFactor: config.correctionFiles.calibrationFactor,
    fisheye: config.correctionFiles.fisheye,
    neutralDensity: config.correctionFiles.neutralDensity,
    response: config.cameraResponseLocation,
    vignetting: config.correctionFiles.vignetting,
  };

  const dir = await storagePath("presets", id);
  await mkdir(dir, { recursive: true });

  const files: Partial<Record<PresetFileSlot, PresetFile>> = {};
  for (const [slot, sourcePath] of Object.entries(sources) as [
    PresetFileSlot,
    string | null,
  ][]) {
    if (!sourcePath) {
      continue;
    }
    const fileName = SLOT_FILENAMES[slot];
    await copyFile(sourcePath, await join(dir, fileName));
    files[slot] = {
      fileName,
      sha256: await sha256Hex(await readFile(sourcePath)),
      sourcePath,
    };
  }

  const preset: Preset = {
    files,
    id,
    lensMaskImageSize,
    name,
    ...presetFields(config),
  };
  const presets = await readPresets();
  await writeJson(PRESETS_FILE, {
    presets: [...presets.filter((p) => p.id !== id), preset],
  });
  return preset;
}
```

`copyFile`, `mkdir`, `readFile` come from `@tauri-apps/plugin-fs` and `join` from
`@tauri-apps/api/path`. `changedSources` is Task 7.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- __tests__/presets.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/presets.ts __tests__/presets.test.ts jest.setup.js
git commit -m "feat(presets): preset store with copied calibration files and hashes"
```

---

### Task 7: Detect a re-derived calibration

**Files:**
- Modify: `src/lib/presets.ts`
- Create: `__tests__/preset-changes.test.ts`

**Interfaces:**
- Produces: `changedSources(preset): Promise<PresetFileSlot[]>`.

This is the consequence of copying rather than referencing, and per decision C3
it ships with the feature rather than after it. Without it, redoing a vignetting
calibration leaves every saved preset silently using the old curves.

- [ ] **Step 1: Write the failing test**

Create `__tests__/preset-changes.test.ts`:

```ts
import { describe, expect, it } from "@jest/globals";

const onDisk: Record<string, number[]> = {
  "/cal/fisheye.cal": [1, 2, 3],
  "/cal/vig.cal": [9, 9, 9],
};

jest.mock("@tauri-apps/plugin-fs", () => ({
  copyFile: () => Promise.resolve(),
  exists: (path: string) => Promise.resolve(path in onDisk),
  mkdir: () => Promise.resolve(),
  readFile: (path: string) => Promise.resolve(new Uint8Array(onDisk[path])),
  readTextFile: () => Promise.resolve("{}"),
  stat: () => Promise.resolve({ size: 0 }),
  writeTextFile: () => Promise.resolve(),
}));

declare const jest: typeof import("@jest/globals").jest;

import { changedSources, sha256Hex } from "../src/lib/presets";

describe("changedSources", () => {
  it("reports only the slot whose source content differs", async () => {
    const preset = {
      files: {
        fisheye: {
          fileName: "fisheye.cal",
          sha256: await sha256Hex(new Uint8Array([1, 2, 3])),
          sourcePath: "/cal/fisheye.cal",
        },
        vignetting: {
          fileName: "vignetting.cal",
          // Saved against different bytes than are on disk now.
          sha256: await sha256Hex(new Uint8Array([0, 0, 0])),
          sourcePath: "/cal/vig.cal",
        },
      },
    } as never;

    expect(await changedSources(preset)).toEqual(["vignetting"]);
  });

  it("does not report a source that no longer exists", async () => {
    const preset = {
      files: {
        fisheye: {
          fileName: "fisheye.cal",
          sha256: await sha256Hex(new Uint8Array([7])),
          sourcePath: "/cal/deleted.cal",
        },
      },
    } as never;

    // Surviving a deleted original is the entire reason presets copy files.
    expect(await changedSources(preset)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/preset-changes.test.ts`
Expected: FAIL, `changedSources is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/presets.ts`:

```ts
/**
 * Slots whose source file still exists but no longer matches the copy taken
 * when the preset was saved, meaning that calibration has been re-derived.
 *
 * A source that has been moved or deleted is not reported: surviving that is
 * why presets copy their files in the first place.
 */
export async function changedSources(
  preset: Preset
): Promise<PresetFileSlot[]> {
  const changed: PresetFileSlot[] = [];
  for (const [slot, file] of Object.entries(preset.files) as [
    PresetFileSlot,
    PresetFile,
  ][]) {
    if (!(await exists(file.sourcePath))) {
      continue;
    }
    const current = await sha256Hex(await readFile(file.sourcePath));
    if (current !== file.sha256) {
      changed.push(slot);
    }
  }
  return changed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- __tests__/preset-changes.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/presets.ts __tests__/preset-changes.test.ts
git commit -m "feat(presets): detect calibration files changed since a preset was saved"
```

---

### Task 8: The preset bar

**Files:**
- Create: `src/app/home-page/preset-bar.tsx`
- Modify: `src/app/home-page/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 6 and 7.

- [ ] **Step 1: Build the bar**

A row above the accordion in the configuration panel, so it frames the inputs
rather than hiding inside one section:

- A shadcn `Select` listing saved presets.
- **Save** opens a shadcn `Dialog` asking for a name, then calls `savePreset`.
- A **modified** indicator when the current equipment fields differ from the
  selected preset.
- When `changedSources` is non-empty, a warning row naming the files with
  **Keep preset copy** and **Update from source** actions.
- When the preset carries a `lensMask` and `lensMaskImageSize` differs from the
  currently selected image, a warning that the mask was drawn at another
  resolution. This is the same hazard class as the `.cal` resolution warning in
  `a140f40`; reuse that wording.

Selecting a preset fills only the equipment fields and leaves the image set and
measured illuminance alone.

- [ ] **Step 2: Verify in the running app**

Save a preset, change a `.cal` file on disk, reload the app and confirm the
changed-source warning names that file and that **Update from source** refreshes
the copy. Confirm selecting a preset does not clear the image set.

- [ ] **Step 3: Commit**

```bash
git add src/app/home-page/preset-bar.tsx src/app/home-page/page.tsx
git commit -m "feat(presets): add the preset bar with change detection"
```

---

## Final verification

```bash
npm test
npx tsc --noEmit
npm run check
```

No Rust changes, so `cargo test` is unaffected. The manual passes in Task 5
Step 3 and Task 8 Step 2 are required; storage bugs surface as missing rows and
stale files, neither of which a unit test with a mocked filesystem will catch.

## Deliberately not built

- **Export and import of presets** (decision C3). Because presets already copy their calibration files into a per-preset directory, a later export is close to zipping that directory plus its JSON entry.
- **Snapshotting `.cal` contents into run records.** Presets copy, history references. History is therefore a weaker reproducibility record than it could be, since a run's `.cal` may have changed since. Explicitly left open in C3; revisit once history is in use, as an additive change to the record format.
- **Automatic pruning.** Decision C3 is manual only. The size indicator in Task 5 exists so the growth is visible.
- **Editing a saved preset in place.** Save under the same name overwrites; there is no field-level editor.
