import { describe, expect, it, jest } from "@jest/globals";
import { describeBatchSummary, runBatch } from "../src/app/home-page/run-batch";
import type { ImageSet } from "../src/components/ui/image-set-preview";

function set(name: string): ImageSet {
  return { files: [`${name}/a.jpg`, `${name}/b.jpg`], name };
}

describe("runBatch", () => {
  it("runs every set, in order", async () => {
    const ran: string[] = [];

    const summary = await runBatch({
      runSet: async ({ set: current }) => {
        await Promise.resolve();
        ran.push(current.name);
      },
      sets: [set("one"), set("two"), set("three")],
    });

    expect(ran).toEqual(["one", "two", "three"]);
    expect(summary).toEqual({
      failed: 0,
      skipped: 0,
      succeeded: 3,
      total: 3,
    });
  });

  // The point of the whole change: one bad directory must not cost an
  // overnight batch the other nine.
  it("carries on past a failing set and counts it as failed", async () => {
    const ran: string[] = [];

    const summary = await runBatch({
      runSet: async ({ set: current }) => {
        await Promise.resolve();
        ran.push(current.name);
        if (current.name === "two") {
          throw new Error("hdrgen exited 1");
        }
      },
      sets: [set("one"), set("two"), set("three")],
    });

    expect(ran).toEqual(["one", "two", "three"]);
    expect(summary).toEqual({
      failed: 1,
      skipped: 0,
      succeeded: 2,
      total: 3,
    });
  });

  it("abandons the remaining sets when stopping is requested", async () => {
    const ran: string[] = [];
    let stop = false;

    const summary = await runBatch({
      runSet: async ({ set: current }) => {
        await Promise.resolve();
        ran.push(current.name);
        if (current.name === "one") {
          stop = true;
        }
      },
      sets: [set("one"), set("two"), set("three")],
      shouldStop: () => stop,
    });

    expect(ran).toEqual(["one"]);
    expect(summary).toEqual({
      failed: 0,
      skipped: 2,
      succeeded: 1,
      total: 3,
    });
  });

  // Stopping is a boundary, not an abort: a set that is already merging
  // exposures finishes rather than leaving a half-written output.
  it("lets a set that is already running finish", async () => {
    const finished: string[] = [];
    let stop = false;

    await runBatch({
      runSet: async ({ set: current }) => {
        stop = true;
        await Promise.resolve();
        finished.push(current.name);
      },
      sets: [set("one"), set("two")],
      shouldStop: () => stop,
    });

    expect(finished).toEqual(["one"]);
  });

  it("announces each set before running it, with its position in the batch", async () => {
    const onBeginSet =
      jest.fn<(at: { position: number; total: number }) => void>();

    await runBatch({
      onBeginSet,
      runSet: () => Promise.resolve(),
      sets: [set("one"), set("two")],
    });

    expect(onBeginSet.mock.calls.map(([at]) => at.position)).toEqual([1, 2]);
    expect(onBeginSet.mock.calls.every(([at]) => at.total === 2)).toBe(true);
  });

  // A single set is the overwhelmingly common case and must not have gained
  // any batch machinery: one call, and a summary the caller can stay quiet
  // about.
  it("treats a single set as one plain run", async () => {
    const runSet = jest.fn<() => Promise<void>>(() => Promise.resolve());

    const summary = await runBatch({ runSet, sets: [set("only")] });

    expect(runSet).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({
      failed: 0,
      skipped: 0,
      succeeded: 1,
      total: 1,
    });
  });

  it("does nothing when there are no sets", async () => {
    const runSet = jest.fn<() => Promise<void>>(() => Promise.resolve());

    const summary = await runBatch({ runSet, sets: [] });

    expect(runSet).not.toHaveBeenCalled();
    expect(summary).toEqual({
      failed: 0,
      skipped: 0,
      succeeded: 0,
      total: 0,
    });
  });
});

describe("describeBatchSummary", () => {
  // The single set is the common case, and it has already said everything it
  // has to say through the progress bar or a failure toast.
  it("says nothing about a single set", () => {
    expect(
      describeBatchSummary({ failed: 0, skipped: 0, succeeded: 1, total: 1 })
    ).toBeNull();
  });

  it("says nothing when there were no sets at all", () => {
    expect(
      describeBatchSummary({ failed: 0, skipped: 0, succeeded: 0, total: 0 })
    ).toBeNull();
  });

  it("counts the sets that completed", () => {
    expect(
      describeBatchSummary({ failed: 0, skipped: 0, succeeded: 3, total: 3 })
    ).toBe("3 of 3 sets completed.");
  });

  // A failed set is already covered by the count, so it needs no clause of its
  // own: what the reader wants is how many of the ten worked.
  it("reports a failure through the count alone", () => {
    expect(
      describeBatchSummary({ failed: 1, skipped: 0, succeeded: 2, total: 3 })
    ).toBe("2 of 3 sets completed.");
  });

  // Stopping is different: without saying so, "1 of 3" reads as two failures
  // rather than as the batch having been ended on purpose.
  it("names the sets that were never started", () => {
    expect(
      describeBatchSummary({ failed: 0, skipped: 2, succeeded: 1, total: 3 })
    ).toBe("1 of 3 sets completed, 2 not started.");
  });
});
