import "fake-indexeddb/auto";
import { describe, expect, it } from "@jest/globals";
import { getDocument, putDocument, updateDocument } from "./kv";

describe("updateDocument", () => {
  it("creates a document when none exists", async () => {
    const written = await updateDocument<number[]>("counter-a", (current) => [
      ...(current ?? []),
      1,
    ]);
    expect(written).toEqual([1]);
    expect(await getDocument<number[]>("counter-a")).toEqual([1]);
  });

  it("applies the change to the stored value", async () => {
    await putDocument("counter-b", [1, 2]);
    const written = await updateDocument<number[]>("counter-b", (current) => [
      ...(current ?? []),
      3,
    ]);
    expect(written).toEqual([1, 2, 3]);
  });

  it("does not lose concurrent updates", async () => {
    await putDocument("counter-c", []);
    await Promise.all(
      [1, 2, 3, 4, 5].map((value) =>
        updateDocument<number[]>("counter-c", (current) => [
          ...(current ?? []),
          value,
        ])
      )
    );
    const stored = await getDocument<number[]>("counter-c");
    expect(stored).toHaveLength(5);
  });
});
