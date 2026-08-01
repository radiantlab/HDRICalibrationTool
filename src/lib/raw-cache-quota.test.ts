/**
 * `navigator.storage` is not implemented in jsdom, so every case here defines
 * it on the fly with `Object.defineProperty` (existing browser globals in
 * jsdom are read-only accessors, so a plain assignment throws) and restores
 * it afterwards -- `undefined` in jsdom is the accurate "absent" baseline for
 * the next test in this file, not a leftover from whichever case ran before.
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  estimateQuotaBytes,
  persistStorageBestEffort,
} from "./raw-cache-quota";

afterEach(() => {
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: undefined,
  });
});

describe("estimateQuotaBytes", () => {
  it("returns the quota navigator.storage.estimate reports", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: () => Promise.resolve({ quota: 12_345, usage: 0 }) },
    });
    await expect(estimateQuotaBytes()).resolves.toBe(12_345);
  });

  it("returns undefined when navigator.storage is absent", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: undefined,
    });
    await expect(estimateQuotaBytes()).resolves.toBeUndefined();
  });

  it("returns undefined when quota is not a number (WebKit's null, in CI)", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: () => Promise.resolve({ quota: null, usage: 0 }) },
    });
    await expect(estimateQuotaBytes()).resolves.toBeUndefined();
  });

  it("returns undefined rather than throwing when estimate() rejects", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { estimate: () => Promise.reject(new Error("nope")) },
    });
    await expect(estimateQuotaBytes()).resolves.toBeUndefined();
  });
});

describe("persistStorageBestEffort", () => {
  it("calls navigator.storage.persist()", async () => {
    const persist = jest.fn(() => Promise.resolve(true));
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persist },
    });
    await persistStorageBestEffort();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not throw when navigator.storage.persist is absent", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {},
    });
    await expect(persistStorageBestEffort()).resolves.toBeUndefined();
  });

  it("does not throw when persist() itself rejects", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persist: () => Promise.reject(new Error("refused")) },
    });
    await expect(persistStorageBestEffort()).resolves.toBeUndefined();
  });
});
