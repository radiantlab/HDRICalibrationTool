import { describe, expect, it } from "@jest/globals";

// A Map rather than an object literal: its get() is genuinely string |
// undefined to both tsc and the linter, so the fallback below is not flagged as
// an unnecessary condition while still satisfying noUncheckedIndexedAccess.
const files = new Map<string, string>();

jest.mock("@tauri-apps/api/path", () => ({
  appConfigDir: () => Promise.resolve("/cfg"),
  join: (...parts: string[]) => Promise.resolve(parts.join("/")),
}));

jest.mock("@tauri-apps/plugin-fs", () => ({
  exists: (path: string) => Promise.resolve(files.has(path)),
  mkdir: () => Promise.resolve(),
  readTextFile: (path: string) => Promise.resolve(files.get(path)),
  writeTextFile: (path: string, contents: string) => {
    files.set(path, contents);
    return Promise.resolve();
  },
}));

declare const jest: typeof import("@jest/globals").jest;

import { readJson, STORAGE_VERSION, writeJson } from "../src/lib/app-storage";

describe("app storage", () => {
  it("round-trips a value and stamps the version", async () => {
    await writeJson("history/runs.json", { runs: [1, 2] });

    const written = files.get("/cfg/history/runs.json") ?? "";
    expect(JSON.parse(written).version).toBe(STORAGE_VERSION);
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
    files.set("/cfg/history/bad.json", "{not json");

    expect(await readJson("history/bad.json", { runs: [] })).toEqual({
      runs: [],
    });
  });

  it("returns the fallback when the version does not match", async () => {
    files.set(
      "/cfg/history/old.json",
      JSON.stringify({ runs: [9], version: 0 })
    );

    expect(await readJson("history/old.json", { runs: [] })).toEqual({
      runs: [],
    });
  });
});
