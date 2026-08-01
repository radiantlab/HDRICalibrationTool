import { beforeEach, describe, expect, it } from "@jest/globals";

declare const jest: typeof import("@jest/globals").jest;

const DEFAULT_ARGS = ["-T", "-o", "1", "-W", "-j", "-q", "3"];

/**
 * A double for `dcrawArgs`, so a test can vary the flags it returns without
 * touching the real flag set. Its return value is what the tag must track --
 * that is the whole point of folding the tool tag into the key -- so a test
 * has to be able to change it independently of the recorded commit.
 */
const mockDcrawArgs = jest.fn(
  (_inputPath: string, _outputPath: string) => DEFAULT_ARGS
);

// A thin wrapper, not `dcrawArgs: mockDcrawArgs` directly: the factory below
// runs the moment "./pipeline/stages" is required, which -- once the mock
// call is hoisted above imports -- is before `mockDcrawArgs` is assigned.
// Deferring the reference into a nested closure means it is only read when
// the mocked `dcrawArgs` is actually called, by which point it exists.
jest.mock("./pipeline/stages", () => ({
  dcrawArgs: (inputPath: string, outputPath: string) =>
    mockDcrawArgs(inputPath, outputPath),
}));

import { rawCacheKey, resetToolTagForTests, toolTag } from "./raw-cache-key";

const VERSIONS = {
  emscripten: "6.0.4",
  tools: {
    dcraw_emu: { commit: "c9d6743", describe: "", repository: "", version: "" },
  },
};

function mockFetch(body: unknown) {
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ json: () => Promise.resolve(body), ok: true })
  ) as unknown as typeof fetch;
}

const CACHE_KEY_PATTERN = /^[0-9a-f]{64}-abc123def456$/;
const TOOL_TAG_PATTERN = /^[0-9a-f]{12}$/;

describe("the RAW cache key", () => {
  beforeEach(() => {
    resetToolTagForTests();
    mockDcrawArgs.mockReturnValue(DEFAULT_ARGS);
  });

  it("joins a content hash and a tool tag", async () => {
    const key = await rawCacheKey(new Uint8Array([1, 2, 3]), "abc123def456");
    expect(key).toMatch(CACHE_KEY_PATTERN);
  });

  it("gives different keys to different bytes", async () => {
    expect(await rawCacheKey(new Uint8Array([1]), "t")).not.toBe(
      await rawCacheKey(new Uint8Array([2]), "t")
    );
  });

  it("derives a twelve-character tag from the recorded commit", async () => {
    mockFetch(VERSIONS);
    const tag = await toolTag("https://example.test/wasm");
    expect(tag).toMatch(TOOL_TAG_PATTERN);
  });

  it("changes the tag when the dcraw_emu commit changes", async () => {
    mockFetch(VERSIONS);
    const before = await toolTag("https://example.test/wasm");

    resetToolTagForTests();
    mockFetch({
      ...VERSIONS,
      tools: { dcraw_emu: { ...VERSIONS.tools.dcraw_emu, commit: "deadbee" } },
    });
    const after = await toolTag("https://example.test/wasm");

    expect(after).not.toBe(before);
  });

  it("changes the tag when the emscripten version changes", async () => {
    // F3: rebuilding dcraw_emu.wasm from the same LibRaw commit on a bumped
    // Emscripten toolchain (what #244 automates) must miss rather than reuse
    // a stale TIFF -- the commit alone can't see that kind of rebuild.
    mockFetch(VERSIONS);
    const before = await toolTag("https://example.test/wasm");

    resetToolTagForTests();
    mockFetch({ ...VERSIONS, emscripten: "6.0.9" });
    const after = await toolTag("https://example.test/wasm");

    expect(after).not.toBe(before);
  });

  it("throws rather than substitute a placeholder when emscripten is missing", async () => {
    mockFetch({ ...VERSIONS, emscripten: undefined });
    await expect(toolTag("https://example.test/wasm")).rejects.toThrow(
      "https://example.test/wasm/versions.json is missing emscripten"
    );
  });

  it("changes the tag when dcrawArgs's flags change", async () => {
    // Guards the repair to the brief's truncated template literal: a version
    // that silently drops the args from the hash again would pass every
    // other test here but fail this one.
    mockFetch(VERSIONS);
    mockDcrawArgs.mockReturnValue(["-T", "-o", "1"]);
    const before = await toolTag("https://example.test/wasm");

    resetToolTagForTests();
    mockDcrawArgs.mockReturnValue(["-T", "-o", "2"]);
    const after = await toolTag("https://example.test/wasm");

    expect(after).not.toBe(before);
  });

  it("fetches versions.json from the absolute base it is given", async () => {
    mockFetch(VERSIONS);
    await toolTag("https://example.test/wasm");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.test/wasm/versions.json"
    );
  });

  it("asks once per base URL", async () => {
    mockFetch(VERSIONS);
    await toolTag("https://example.test/wasm");
    await toolTag("https://example.test/wasm");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws rather than substitute a placeholder when the commit is missing", async () => {
    // A placeholder like "unknown" would let two builds that both fail to
    // report a commit collide on the same tag and share a cache entry --
    // exactly the wrong-pixels hit this module exists to prevent.
    mockFetch({
      ...VERSIONS,
      tools: { dcraw_emu: { ...VERSIONS.tools.dcraw_emu, commit: undefined } },
    });
    await expect(toolTag("https://example.test/wasm")).rejects.toThrow(
      "https://example.test/wasm/versions.json is missing tools.dcraw_emu.commit"
    );
  });

  it("does not remember a missing-commit failure, so a later call can still succeed", async () => {
    mockFetch({
      ...VERSIONS,
      tools: { dcraw_emu: { ...VERSIONS.tools.dcraw_emu, commit: undefined } },
    });
    await expect(toolTag("https://example.test/wasm")).rejects.toThrow();

    // No resetToolTagForTests() call here: recovery must come from the
    // production delete-on-catch, not from the test clearing the memo map.
    mockFetch(VERSIONS);
    await expect(toolTag("https://example.test/wasm")).resolves.toMatch(
      TOOL_TAG_PATTERN
    );
  });
});
