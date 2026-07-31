import { beforeEach, describe, expect, it, jest } from "@jest/globals";
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
});
