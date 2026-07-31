/**
 * Recovery from a failed open(), in its own file for the same reason as
 * `kv-upgrade.test.ts`: each Jest test file gets its own module registry, so
 * a fresh `fake-indexeddb` in-memory database and a fresh `connection`
 * module variable, with nothing else in this run able to interfere with the
 * failure this test injects.
 */
import "fake-indexeddb/auto";
import { describe, expect, it, jest } from "@jest/globals";
import { getDocument, putDocument } from "./kv";

describe("recovering from a failed open()", () => {
  it("does not cache a rejection -- a later call can still succeed", async () => {
    // Fails the first indexedDB.open() the module makes, standing in for a
    // real failure (onblocked losing a race with another tab, for one). If
    // kv.ts cached that rejected promise, every subsequent call in the
    // session -- getDocument, putDocument, presets, settings -- would reject
    // forever with this same error, not just the call that hit it.
    const openSpy = jest.spyOn(indexedDB, "open").mockImplementationOnce(() => {
      const request = {
        error: new Error("simulated open failure"),
        onblocked: null,
        onerror: null as (() => void) | null,
        onsuccess: null,
        onupgradeneeded: null,
        result: undefined,
      };
      // Deferred so kv.ts's open() has finished assigning request.onerror
      // before it fires, the same way a real IDBOpenDBRequest's events do.
      queueMicrotask(() => request.onerror?.());
      return request as unknown as IDBOpenDBRequest;
    });

    await expect(getDocument("anything")).rejects.toThrow(
      "simulated open failure"
    );

    // The mock only overrides the first call; this one reaches the real
    // fake-indexeddb and should succeed if -- and only if -- kv.ts asked for
    // a fresh open() rather than reusing the rejected promise above.
    await putDocument("recovered", { ok: true });
    await expect(getDocument("recovered")).resolves.toEqual({ ok: true });

    openSpy.mockRestore();
  });
});
