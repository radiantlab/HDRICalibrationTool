import { describe, expect, it } from "@jest/globals";

/**
 * Storage moved from JSON files under Tauri's config directory to IndexedDB,
 * so one implementation serves the desktop app and the browser build. The
 * behaviour that has to survive the move is the fallback contract: history and
 * presets are records, not state the app depends on, so nothing stored badly
 * may stop the app from starting.
 */

const documents = new Map<string, unknown>();

jest.mock("../src/lib/storage/kv", () => {
  // A real subclass, not a bare object shape: F1's fix to `readJson` tells
  // this class apart with `instanceof`, and a mock that only matched by
  // duck-typing would leave that check untested against the one thing it
  // actually has to distinguish. Assigned rather than declared with `class
  // DatabaseVersionError`, which would shadow the real export this file also
  // imports by that name for its own assertions.
  const MockDatabaseVersionError = class extends Error {
    constructor() {
      super("stored data is newer than this build can open");
      this.name = "DatabaseVersionError";
    }
  };
  return {
    DatabaseVersionError: MockDatabaseVersionError,
    getDocument: (key: string) => {
      const value = documents.get(key);
      if (value === "THROW") {
        return Promise.reject(new Error("store unavailable"));
      }
      if (value === "VERSION_ERROR") {
        return Promise.reject(new MockDatabaseVersionError());
      }
      return Promise.resolve(value);
    },
    putDocument: (key: string, value: unknown) => {
      documents.set(key, value);
      return Promise.resolve();
    },
  };
});

declare const jest: typeof import("@jest/globals").jest;

import { readJson, STORAGE_VERSION, writeJson } from "../src/lib/app-storage";
import { DatabaseVersionError } from "../src/lib/storage/kv";

describe("app storage", () => {
  it("round-trips a value and stamps the version", async () => {
    await writeJson("history/runs.json", { runs: [1, 2] });

    expect(
      (documents.get("history/runs.json") as { version: number }).version
    ).toBe(STORAGE_VERSION);
    expect(await readJson("history/runs.json", { runs: [] })).toEqual({
      runs: [1, 2],
      version: STORAGE_VERSION,
    });
  });

  it("returns the fallback when nothing is stored", async () => {
    expect(await readJson("history/missing.json", { runs: [] })).toEqual({
      runs: [],
    });
  });

  it("returns the fallback rather than throwing when the store is unusable", async () => {
    documents.set("history/bad.json", "THROW");

    expect(await readJson("history/bad.json", { runs: [] })).toEqual({
      runs: [],
    });
  });

  it("returns the fallback when the version does not match", async () => {
    documents.set("history/old.json", { runs: [9], version: 0 });

    expect(await readJson("history/old.json", { runs: [] })).toEqual({
      runs: [],
    });
  });

  it("rethrows DatabaseVersionError instead of returning the fallback", async () => {
    // F1: a stored-data-is-newer-than-this-build condition is not "nothing
    // stored badly" -- the data is intact, and papering over it with the
    // fallback is what used to make a rolled-back deploy render as an empty
    // app with nothing to explain why.
    documents.set("history/newer.json", "VERSION_ERROR");

    await expect(
      readJson("history/newer.json", { runs: [] })
    ).rejects.toBeInstanceOf(DatabaseVersionError);
  });
});
