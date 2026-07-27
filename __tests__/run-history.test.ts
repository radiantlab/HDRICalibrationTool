import { describe, expect, it } from "@jest/globals";
import type { LogEntry } from "../src/app/pipeline-status-context";
import { classifyOutcome } from "../src/lib/run-history";

const step = (message: string): LogEntry => ({
  at: "2026-07-27T12:00:00.000Z",
  kind: "step",
  message,
  step: null,
});

const warn = (message: string): LogEntry => ({
  at: "2026-07-27T12:00:00.000Z",
  kind: "warning",
  message,
  step: null,
});

describe("classifyOutcome", () => {
  it("is ok when nothing was flagged", () => {
    expect(classifyOutcome([step("Merging exposures")], null)).toBe("ok");
  });

  it("is warning when the log holds a warning", () => {
    expect(
      classifyOutcome(
        [step("Merging"), warn("vignetting.cal is fixed size")],
        null
      )
    ).toBe("warning");
  });

  it("is error when the run failed, even with no warnings", () => {
    expect(classifyOutcome([step("Merging")], "hdrgen exited 1")).toBe("error");
  });

  it("is rejected when the run never reached the backend", () => {
    // The backend emits a step as soon as it starts, so an empty log means the
    // attempt was turned away before the pipeline command ran.
    expect(classifyOutcome([], "No images selected")).toBe("rejected");
  });
});
