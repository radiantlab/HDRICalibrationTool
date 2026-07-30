/** Ported from the `mod tests` block in `src-tauri/src/pipeline/output_naming.rs`. */

import { describe, expect, it } from "@jest/globals";
import { completionMessage, outputStem, runTimestamp } from "./output-naming";

const DATETIME = "2026-07-29_11-41-49";

describe("outputStem", () => {
  it("leads with a named set", () => {
    expect(outputStem("JPEG", DATETIME)).toBe(`JPEG_${DATETIME}`);
  });

  it("keeps the single-scene stem when the name is empty", () => {
    expect(outputStem("", DATETIME)).toBe(DATETIME);
  });

  it("keeps the single-scene stem when nothing in the name is usable", () => {
    expect(outputStem("///", DATETIME)).toBe(DATETIME);
    expect(outputStem("   ", DATETIME)).toBe(DATETIME);
  });

  it("cannot escape the output directory", () => {
    // The separators become underscores, so the stem stays a single segment.
    expect(outputStem("../../etc/passwd", DATETIME)).not.toContain("/");
    expect(outputStem("..\\..\\Windows", DATETIME)).toBe(`Windows_${DATETIME}`);
  });

  it("truncates a long name", () => {
    expect(outputStem("a".repeat(200), DATETIME)).toBe(
      `${"a".repeat(64)}_${DATETIME}`
    );
  });
});

describe("runTimestamp", () => {
  it("formats as Rust's %F_%H-%M-%S", () => {
    // Local time, matching chrono's Local::now(): a 4pm capture should not be
    // filed as though it were made at 11pm.
    expect(runTimestamp(new Date(2026, 6, 29, 11, 41, 49))).toBe(DATETIME);
  });

  it("zero-pads every field", () => {
    expect(runTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe(
      "2026-01-02_03-04-05"
    );
  });
});

describe("completionMessage", () => {
  it("reports the pipeline finishing for an unnamed run", () => {
    expect(completionMessage("")).toBe("Pipeline complete.");
  });

  it("names the set for a named run", () => {
    expect(completionMessage(" JPEG ")).toBe("Finished JPEG.");
  });
});
