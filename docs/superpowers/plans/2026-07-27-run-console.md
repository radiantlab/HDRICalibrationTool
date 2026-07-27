# Run Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every pipeline status message as it happens, in a scrollable timestamped log with per-set progress, instead of a single line that each new message overwrites.

**Architecture:** The messages already exist; the frontend discards them. `PipelineStatusProvider` gains an accumulated log alongside its current single-payload state, and a shadcn `Dialog` renders it. The backend changes only to say which image set it is on, plus a correctness fix to the progress arithmetic that the console would otherwise put on display.

**Tech Stack:** Rust + Tauri v2, Next.js 15, React 19, shadcn/ui, Jest + Testing Library.

**Source spec:** `docs/superpowers/specs/2026-07-27-run-console-history-and-mask-editor.md`, section B.

## Scope note and dependency

This is plan 2 of 3 from that spec. **Task 4 needs the shadcn `Dialog`, added by Task 1 of `2026-07-27-lens-mask-editor.md`.** Either land that plan first, or run its Task 1 (`npx shadcn@latest add dialog`) standalone before starting Task 4 here. Tasks 1 to 3 have no such dependency and can proceed either way.

Run history (spec section C) is a separate plan. This plan deliberately does not persist anything: the log lives in memory for the current run only. Task 3's `LogEntry` shape is chosen to be the record format history will later store, so that work is additive rather than a rewrite.

## Global Constraints

- **Use shadcn/ui components, not hand-rolled equivalents,** for anything with accessibility semantics. The log viewport itself is a plain scroll container with `role="log"`, because shadcn has no log primitive and native scrolling is what a live region needs.
- **No new npm or Rust dependencies.** Clipboard uses `navigator.clipboard`, which the Tauri webview supports from a user gesture; if it proves unreliable in the packaged app, add `@tauri-apps/plugin-clipboard-manager` as a follow-up rather than pre-emptively.
- **`jest.mock` must use the global `jest`, not the binding from `@jest/globals`.** The SWC transform only hoists the global form above imports.
- **The `@/` alias resolves in tests** via `moduleNameMapper` in `jest.config.js`.
- **No tutorial section references in run status messages.** They belong in field infoboxes. This was already applied in `795bcfe`; do not reintroduce them.
- **Rust test command:** `cd src-tauri && cargo test` (binary crate, no lib target). **JS:** `npm test`. **Lint:** `npm run check`. **Types:** `npx tsc --noEmit`.
- **Prose in comments and UI copy uses no em dashes.**

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src-tauri/src/pipeline/progress.rs` | Step counter that yields a percentage. Pure, testable. |
| `src/app/home-page/run-console.tsx` | The dialog: per-set progress, log, copy, actions. |
| `__tests__/run-console.test.tsx` | Log rendering and copy behaviour. |
| `__tests__/pipeline-status-log.test.tsx` | Event accumulation in the provider. |

**Modified:** `src-tauri/src/pipeline.rs` (progress, set index), `src/app/pipeline-status-context.tsx` (log), `src/app/home-page/pipeline-status.tsx` (compact strip), `src/app/home-page/page.tsx` (mount the console).

---

### Task 1: Fix the progress arithmetic

**Files:**
- Create: `src-tauri/src/pipeline/progress.rs`
- Modify: `src-tauri/src/pipeline.rs:1-12` (module list), `:140-160` (`emit_progress`), `:340-343`, and the six `current_step += 1` sites in `process_image_set`

**Interfaces:**
- Produces: `pub struct StepProgress` with `StepProgress::new(total: usize)`, `advance(&mut self) -> i32`, and `percent(&self) -> i32`.

`process_image_set` contains **six** `current_step += 1` statements, while `total_steps` is set to `5` (`pipeline.rs:340`, via the no-op ternary `if is_directory { 5 } else { 5 }`). The bar therefore reaches 120 percent. Nobody has noticed because the single-line status is what draws the eye; a console that shows the number prominently would make it obvious, so fix it first.

There are seven reportable stages: merge, nullify, crop, header (view), evalglare, header (results), falsecolor. The seventh currently has no increment.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/pipeline/progress.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_at_zero() {
        assert_eq!(StepProgress::new(7).percent(), 0);
    }

    #[test]
    fn reaches_exactly_one_hundred_on_the_last_step() {
        let mut progress = StepProgress::new(7);
        let mut last = 0;
        for _ in 0..7 {
            last = progress.advance();
        }
        assert_eq!(last, 100);
    }

    #[test]
    fn never_exceeds_one_hundred_when_over_advanced() {
        let mut progress = StepProgress::new(7);
        for _ in 0..20 {
            progress.advance();
        }
        assert_eq!(progress.percent(), 100);
    }

    #[test]
    fn a_zero_total_does_not_divide_by_zero() {
        let mut progress = StepProgress::new(0);
        assert_eq!(progress.advance(), 100);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd src-tauri && cargo test progress::tests`
Expected: FAIL to compile, `cannot find struct StepProgress`. Remember to add `mod progress;` to `pipeline.rs` in this step, or the file is never compiled and the run reports a false pass.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/pipeline/progress.rs`:

```rust
/// Counts pipeline stages and reports completion as a percentage.
///
/// This replaces a hand-incremented counter compared against a hardcoded
/// total, which had drifted out of step: six increments against a total of
/// five, so the bar reported 120 percent.
pub struct StepProgress {
    current: usize,
    total: usize,
}

impl StepProgress {
    pub fn new(total: usize) -> Self {
        Self { current: 0, total }
    }

    pub fn advance(&mut self) -> i32 {
        self.current += 1;
        self.percent()
    }

    pub fn percent(&self) -> i32 {
        if self.total == 0 {
            return 100;
        }
        let ratio = self.current as f64 / self.total as f64;
        (ratio.min(1.0) * 100.0) as i32
    }
}
```

Add `mod progress;` alongside the other stage modules in `pipeline.rs`, and
`use progress::StepProgress;`.

In `pipeline.rs`, replace the `total_steps` / `current_step` pair (currently
lines 340 to 343) with:

```rust
    // merge, nullify, crop, header (view), evalglare, header (results), falsecolor
    const PIPELINE_STAGES: usize = 7;
    let mut progress = StepProgress::new(PIPELINE_STAGES);
    emit_progress(&app, progress.percent())?;
```

Change `emit_progress` to take a percentage directly rather than computing one:

```rust
fn emit_progress(app: &tauri::AppHandle, percent: i32) -> Result<(), PipelineError> {
    app.emit("pipeline-progress", percent)
        .map_err(|e| PipelineError::Event {
            message: format!("Failed to emit progress event: {}", e),
        })?;
    emit_status(
        app,
        PipelineStatusPayload {
            kind: PipelineStatusKind::Progress,
            progress: Some(percent),
            step: None,
            message: None,
            set_index: None,
            set_total: None,
        },
    )
}
```

(The two new payload fields come from Task 2; if doing Task 1 alone, omit them
and add them there.)

Thread `&mut StepProgress` into `process_image_set` in place of the
`current_step: usize, total_steps: usize` pair, replace each
`current_step += 1; emit_progress(app, current_step, total_steps)?;` with
`emit_progress(app, progress.advance())?;`, and add the seventh call after the
`falsecolor` stage so the bar lands on 100.

Note for batch runs: the same `StepProgress` is now threaded through every set,
so it must be reset per set. Call `*progress = StepProgress::new(PIPELINE_STAGES)`
at the top of `process_image_set`. Overall multi-set progress is reported by the
set index from Task 2, not by this counter.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests including 4 new ones in `progress::tests`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline/progress.rs src-tauri/src/pipeline.rs
git commit -m "fix(pipeline): report progress out of the real stage count"
```

---

### Task 2: Report which image set is running

**Files:**
- Modify: `src-tauri/src/pipeline.rs` (`PipelineStatusPayload`, the batch loop, `process_image_set` signature)
- Modify: `src/app/pipeline-status-context.tsx` (schema)

**Interfaces:**
- Consumes: `StepProgress` from Task 1.
- Produces: `set_index: Option<usize>` and `set_total: Option<usize>` on `PipelineStatusPayload`, serialised as `set_index` / `set_total` and skipped when `None`.

Batch runs currently pass `current_step` by value into each set, so the bar restarts at zero per directory with nothing saying which one is running or how many remain.

- [ ] **Step 1: Write the failing test**

Append to the `#[cfg(test)] mod tests` block in `src-tauri/src/pipeline/progress.rs` (it is the only test module in scope for pipeline payload shape; a dedicated module is not worth a file):

```rust
    #[test]
    fn set_fields_are_omitted_when_absent() {
        let payload = crate::pipeline::PipelineStatusPayload {
            kind: crate::pipeline::PipelineStatusKind::Step,
            progress: None,
            step: Some("merge_exposures".to_string()),
            message: None,
            set_index: None,
            set_total: None,
        };
        let json = serde_json::to_string(&payload).expect("serialises");
        assert!(!json.contains("set_index"));
    }

    #[test]
    fn set_fields_are_present_when_supplied() {
        let payload = crate::pipeline::PipelineStatusPayload {
            kind: crate::pipeline::PipelineStatusKind::Step,
            progress: None,
            step: None,
            message: Some("Processing set 2 of 3".to_string()),
            set_index: Some(2),
            set_total: Some(3),
        };
        let json = serde_json::to_string(&payload).expect("serialises");
        assert!(json.contains("\"set_index\":2"));
        assert!(json.contains("\"set_total\":3"));
    }
```

`serde_json` is already an indirect dependency of `tauri`, but is not a direct
one. Add it to `[dev-dependencies]` in `src-tauri/Cargo.toml`:

```toml
serde_json = "1"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test progress::tests`
Expected: FAIL to compile, `PipelineStatusPayload` has no field `set_index`.

- [ ] **Step 3: Write the implementation**

In `pipeline.rs`, extend the payload:

```rust
#[derive(Debug, Serialize, Clone)]
pub struct PipelineStatusPayload {
    pub kind: PipelineStatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// One-based index of the image set being processed, for batch runs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_total: Option<usize>,
}
```

Every existing construction site must gain `set_index: None, set_total: None`.
There are several across `pipeline.rs`, `merge_exposures.rs` and any other stage
that emits status; the compiler will list them all.

In the batch loop, emit a set marker before each set. Replace
`for input_dir in &input_images {` with:

```rust
        let set_total = input_images.len();
        for (index, input_dir) in input_images.iter().enumerate() {
            let set_index = index + 1;
            let set_name = Path::new(input_dir)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            emit_status(
                &app,
                PipelineStatusPayload {
                    kind: PipelineStatusKind::Step,
                    progress: None,
                    step: Some("image_set".to_string()),
                    message: Some(format!(
                        "Processing set {set_index} of {set_total}: {set_name}"
                    )),
                    set_index: Some(set_index),
                    set_total: Some(set_total),
                },
            )?;
```

Update the closing brace and any `input_dir` uses inside the loop accordingly.

In `src/app/pipeline-status-context.tsx`, extend the zod schema so the new fields
parse rather than being rejected:

```ts
const pipelineStatusSchema = z.object({
  kind: z.enum(["step", "progress", "warning", "error", "done"]),
  message: z.string().optional().nullable(),
  progress: z.number().optional().nullable(),
  set_index: z.number().optional().nullable(),
  set_total: z.number().optional().nullable(),
  step: z.string().optional().nullable(),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test`
Expected: PASS, all tests.

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/pipeline.rs src-tauri/src/pipeline/ src-tauri/Cargo.toml \
        src/app/pipeline-status-context.tsx
git commit -m "feat(pipeline): report which image set a batch run is on"
```

---

### Task 3: Accumulate the status log

**Files:**
- Modify: `src/app/pipeline-status-context.tsx`
- Create: `__tests__/pipeline-status-log.test.tsx`

**Interfaces:**
- Consumes: the schema from Task 2.
- Produces, on the context value: `log: LogEntry[]`, `clearLog: () => void`, `setIndex: number | null`, `setTotal: number | null`, where

```ts
export interface LogEntry {
  at: string;          // ISO timestamp, stamped on receipt
  kind: "step" | "progress" | "warning" | "error" | "done";
  message: string;
  step: string | null;
}
```

That shape is deliberately the one run history will persist, so section C stores
these entries directly rather than reshaping them.

`pipeline-status-context.tsx:41` currently does `setPayload(nextPayload)`, so each
event overwrites the last and the messages are unreadable. Nothing else is wrong
with the pipeline's reporting.

- [ ] **Step 1: Write the failing test**

Create `__tests__/pipeline-status-log.test.tsx`:

```tsx
import { describe, expect, it } from "@jest/globals";
import { act, render, screen } from "@testing-library/react";

// Captures the listener the provider registers so the test can push events.
const listeners: Record<string, (event: { payload: unknown }) => void> = {};

jest.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: (event: { payload: unknown }) => void) => {
    listeners[name] = handler;
    return Promise.resolve(() => undefined);
  },
}));

declare const jest: typeof import("@jest/globals").jest;

import {
  PipelineStatusProvider,
  usePipelineStatus,
} from "../src/app/pipeline-status-context";

function LogView() {
  const { log } = usePipelineStatus();
  return (
    <ul>
      {log.map((entry) => (
        <li key={`${entry.at}-${entry.message}`}>{entry.message}</li>
      ))}
    </ul>
  );
}

describe("pipeline status log", () => {
  it("keeps every message instead of overwriting", async () => {
    await act(() => {
      render(
        <PipelineStatusProvider>
          <LogView />
        </PipelineStatusProvider>
      );
      return Promise.resolve();
    });

    act(() => {
      listeners["pipeline-status"]({
        payload: { kind: "step", message: "Merging exposures" },
      });
      listeners["pipeline-status"]({
        payload: { kind: "step", message: "Cropping HDR image" },
      });
    });

    expect(screen.getByText("Merging exposures")).toBeInTheDocument();
    expect(screen.getByText("Cropping HDR image")).toBeInTheDocument();
  });

  it("records the kind so warnings can be marked", async () => {
    await act(() => {
      render(
        <PipelineStatusProvider>
          <LogView />
        </PipelineStatusProvider>
      );
      return Promise.resolve();
    });

    act(() => {
      listeners["pipeline-status"]({
        payload: { kind: "warning", message: "vignetting.cal is fixed size" },
      });
    });

    expect(
      screen.getByText("vignetting.cal is fixed size")
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- __tests__/pipeline-status-log.test.tsx`
Expected: FAIL, `log` is not on the context value (TypeScript error, and at runtime `log.map` is not a function).

- [ ] **Step 3: Write the implementation**

In `src/app/pipeline-status-context.tsx`, add the entry type and state:

```ts
export interface LogEntry {
  at: string;
  kind: "step" | "progress" | "warning" | "error" | "done";
  message: string;
  step: string | null;
}
```

```ts
  const [log, setLog] = useState<LogEntry[]>([]);
  const [setIndex, setSetIndex] = useState<number | null>(null);
  const [setTotal, setSetTotal] = useState<number | null>(null);
```

Inside the `pipeline-status` handler, after the existing `setPayload(nextPayload)`,
append an entry for anything that carries text. Progress-only events are skipped
so the log is not flooded with percentages:

```ts
        if (typeof nextPayload.set_index === "number") {
          setSetIndex(nextPayload.set_index);
        }
        if (typeof nextPayload.set_total === "number") {
          setSetTotal(nextPayload.set_total);
        }

        const text =
          nextPayload.message ?? nextPayload.step?.replace(/_/g, " ") ?? null;
        if (text && nextPayload.kind !== "progress") {
          setLog((entries) => [
            ...entries,
            {
              at: new Date().toISOString(),
              kind: nextPayload.kind,
              message: text,
              step: nextPayload.step ?? null,
            },
          ]);
        }
```

Add `clearLog`:

```ts
  const clearLog = useCallback(() => {
    setLog([]);
    setSetIndex(null);
    setSetTotal(null);
  }, []);
```

and extend the memoised context value with `log`, `clearLog`, `setIndex`,
`setTotal`, updating `PipelineStatusContextValue` to match. Import `useCallback`.

Leave the existing `toast.warning` call alone; a warning should still surface
when the console is closed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add src/app/pipeline-status-context.tsx __tests__/pipeline-status-log.test.tsx
git commit -m "feat(ui): accumulate pipeline status messages into a log"
```

---

### Task 4: The run console dialog

**Files:**
- Create: `src/app/home-page/run-console.tsx`
- Create: `__tests__/run-console.test.tsx`

**Interfaces:**
- Consumes: `Dialog` (from the mask editor plan, Task 1), `usePipelineStatus` with `log`, `setIndex`, `setTotal` from Task 3, and the existing `lastEmittedOutput` and `progress`.
- Produces: `RunConsole({ onOpenChange, open }: { onOpenChange: (open: boolean) => void; open: boolean })`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/run-console.test.tsx`:

```tsx
import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";

jest.mock("../src/app/pipeline-status-context", () => ({
  usePipelineStatus: () => ({
    lastEmittedOutput: { path: "/out/2026-07-27.hdr" },
    log: [
      {
        at: "2026-07-27T12:04:31.000Z",
        kind: "step",
        message: "Merging exposures",
        step: "merge_exposures",
      },
      {
        at: "2026-07-27T12:05:02.000Z",
        kind: "warning",
        message: "vignetting.cal is fixed size",
        step: "cal_check",
      },
    ],
    payload: null,
    progress: 62,
    setIndex: 1,
    setTotal: 3,
    statusText: "Applying vignetting correction",
  }),
}));

declare const jest: typeof import("@jest/globals").jest;

import { RunConsole } from "../src/app/home-page/run-console";

describe("RunConsole", () => {
  it("shows every log entry, not just the newest", () => {
    render(<RunConsole onOpenChange={() => undefined} open />);

    expect(screen.getByText("Merging exposures")).toBeInTheDocument();
    expect(
      screen.getByText("vignetting.cal is fixed size")
    ).toBeInTheDocument();
  });

  it("reports which set of how many is running", () => {
    render(<RunConsole onOpenChange={() => undefined} open />);

    expect(screen.getByText(/Set 1 of 3/)).toBeInTheDocument();
  });

  it("exposes the log as an accessible live region", () => {
    render(<RunConsole onOpenChange={() => undefined} open />);

    expect(screen.getByRole("log")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- __tests__/run-console.test.tsx`
Expected: FAIL, `Cannot find module '../src/app/home-page/run-console'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/home-page/run-console.tsx`:

```tsx
"use client";

import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { serializeViewerUrl } from "../image-viewer/viewer-url";
import { usePipelineStatus } from "../pipeline-status-context";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}

/**
 * The live view of a pipeline run.
 *
 * The messages were always being emitted; the provider used to keep only the
 * most recent one, so they were unreadable. This renders the accumulated log.
 *
 * The viewport is a plain scroll container rather than a shadcn ScrollArea:
 * it needs role="log" with a polite live region so a screen reader announces
 * new lines, and native scrolling so the auto-scroll below is a single
 * assignment rather than reaching into a custom scrollbar's inner viewport.
 */
export function RunConsole({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { lastEmittedOutput, log, progress, setIndex, setTotal, statusText } =
    usePipelineStatus();
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [log.length]);

  const copyLog = async () => {
    const text = log
      .map((entry) => `${formatTime(entry.at)}  ${entry.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Log copied");
    } catch {
      toast.error("Could not copy the log");
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[80vh] w-[42rem] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>Generating HDR images</DialogTitle>
        </DialogHeader>

        {setIndex && setTotal ? (
          <p className="text-muted-foreground text-sm">
            Set {setIndex} of {setTotal}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <span className="w-10 text-muted-foreground text-xs">
            {progress}%
          </span>
          <Progress value={progress} />
        </div>

        {statusText ? (
          <p className="text-muted-foreground text-sm">{statusText}</p>
        ) : null}

        <div
          aria-live="polite"
          className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs"
          ref={viewportRef}
          role="log"
        >
          {log.map((entry) => (
            <div
              className={
                entry.kind === "warning" || entry.kind === "error"
                  ? "text-destructive"
                  : undefined
              }
              key={`${entry.at}-${entry.message}`}
            >
              <span className="text-muted-foreground">
                {formatTime(entry.at)}
              </span>{" "}
              {entry.message}
            </div>
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button onClick={copyLog} type="button" variant="outline">
            Copy log
          </Button>
          <div className="flex gap-2">
            <Button
              disabled={!lastEmittedOutput}
              onClick={() => {
                if (lastEmittedOutput) {
                  revealItemInDir(lastEmittedOutput.path);
                }
              }}
              type="button"
              variant="outline"
            >
              Open folder
            </Button>
            <Button
              disabled={!lastEmittedOutput}
              onClick={() =>
                router.push(
                  serializeViewerUrl("/image-viewer/view", {
                    filePath: lastEmittedOutput?.path,
                  })
                )
              }
              type="button"
            >
              Open image
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all suites.

Run: `npx tsc --noEmit` and `npm run check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/home-page/run-console.tsx __tests__/run-console.test.tsx
git commit -m "feat(ui): add a run console showing the full pipeline log"
```

---

### Task 5: Open the console when a run starts

**Files:**
- Modify: `src/app/home-page/page.tsx` (submit handler and the footer)
- Modify: `src/app/home-page/pipeline-status.tsx` (compact strip)

**Interfaces:**
- Consumes: `RunConsole` from Task 4, `clearLog` from Task 3.

The console owns the run; the existing inline strip stays as a compact indicator
so closing the dialog does not hide the fact that a run is still going.

- [ ] **Step 1: Wire it up**

In `page.tsx`, add state and clear the log when a run starts:

```tsx
  const [consoleOpen, setConsoleOpen] = useState(false);
```

In the submit handler, next to `setProgressVisible(true)`:

```tsx
            clearLog();
            setConsoleOpen(true);
```

taking `clearLog` from `usePipelineStatus()`. Render the console beside the
existing status strip in the footer:

```tsx
              <RunConsole onOpenChange={setConsoleOpen} open={consoleOpen} />
```

In `pipeline-status.tsx`, add a button that reopens the console, so a user who
dismissed it can get back:

```tsx
        <Button onClick={onShowConsole} type="button" variant="outline">
          Show log
        </Button>
```

threading `onShowConsole` from `page.tsx` as `() => setConsoleOpen(true)`.

- [ ] **Step 2: Run the checks**

Run: `npm test`, `npx tsc --noEmit`, `npm run check`
Expected: all clean.

- [ ] **Step 3: Verify in the running app**

This is the task whose value is entirely visual, so it must be exercised for real.
Run a batch of at least two image sets and confirm: the console opens on Generate;
every step appears with a timestamp; the set line counts up; the bar reaches 100
and not 120; warnings are marked and still toast when the console is closed;
Copy log puts the transcript on the clipboard; Open folder and Open image work;
closing and reopening via Show log preserves the log.

- [ ] **Step 4: Commit**

```bash
git add src/app/home-page/page.tsx src/app/home-page/pipeline-status.tsx
git commit -m "feat(ui): open the run console when a pipeline run starts"
```

---

## Final verification

```bash
cd src-tauri && cargo test && cd ..
npm test
npx tsc --noEmit
npm run check
```

Then the manual pass in Task 5 Step 3. The e2e suite is not a gate; it asserts
only that HDR files are produced and currently cannot start locally.

## Deliberately not built

- **Persistence.** The log is in memory for the current run. Run history is spec section C and its own plan; `LogEntry` is shaped to be the record it will store.
- **Cancelling a run.** The pipeline has no cancellation path today, and adding one is a backend concern well beyond a console.
- **Raw stderr of failed Radiance commands.** `CommandError::NonZeroExit` already captures it and it is the most useful thing when hdrgen refuses a set. Worth adding behind a "Show details" toggle on error entries once the console exists, but it needs the error payload plumbed through the status event first.
- **Even progress weighting.** The optional stages (resize, projection, vignetting, ND, photometric) do not advance the counter, so the bar still moves unevenly. Pre-existing, and cosmetic once the total is right.
