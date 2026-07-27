import { describe, expect, it } from "@jest/globals";
import { groupRunsByDay } from "../src/app/runs/group-runs";
import type { RunRecord } from "../src/lib/run-history";

const run = (startedAt: string) =>
  ({ id: startedAt, startedAt }) as unknown as RunRecord;

describe("groupRunsByDay", () => {
  it("labels the current day as Today", () => {
    const groups = groupRunsByDay(
      [run("2026-07-27T12:00:00.000Z")],
      new Date("2026-07-27T18:00:00.000Z")
    );

    expect(groups[0]?.label).toBe("Today");
  });

  it("labels the previous day as Yesterday", () => {
    const groups = groupRunsByDay(
      [run("2026-07-26T12:00:00.000Z")],
      new Date("2026-07-27T18:00:00.000Z")
    );

    expect(groups[0]?.label).toBe("Yesterday");
  });

  it("orders newest day first", () => {
    const groups = groupRunsByDay(
      [run("2026-07-20T12:00:00.000Z"), run("2026-07-27T12:00:00.000Z")],
      new Date("2026-07-27T18:00:00.000Z")
    );

    expect(groups[0]?.label).toBe("Today");
    expect(groups[1]?.label).toBe("2026-07-20");
  });

  it("orders runs within a day newest first", () => {
    const groups = groupRunsByDay(
      [run("2026-07-27T09:00:00.000Z"), run("2026-07-27T17:00:00.000Z")],
      new Date("2026-07-27T18:00:00.000Z")
    );

    expect(groups[0]?.runs[0]?.startedAt).toBe("2026-07-27T17:00:00.000Z");
  });
});
