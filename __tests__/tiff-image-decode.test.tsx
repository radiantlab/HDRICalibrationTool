import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { act, render } from "@testing-library/react";

declare const jest: typeof import("@jest/globals").jest;

interface DecodeCall {
  maxHeight?: number;
  maxWidth?: number;
}
const decodeCalls: DecodeCall[] = [];

jest.mock("@/lib/tiff-worker-client", () => ({
  decodeTiff: (_buffer: ArrayBuffer, options: DecodeCall) => {
    decodeCalls.push(options);
    return new Promise(() => {
      // Never settles: this test is about what the decode is asked for, not
      // about what comes back.
    });
  },
}));
jest.mock("@tauri-apps/plugin-fs", () => ({
  readFile: () => Promise.resolve({ buffer: new ArrayBuffer(64) }),
}));
jest.mock("@/components/ui/(image)/(tiff-image)/useTiffPath", () => {
  // One promise for the whole module, because the real hook memoises. Handing
  // back a new one per render makes the identity of TiffImage's only effect
  // dependency change every render, which loops until the heap gives out.
  const tiffPath = Promise.resolve("/cache/capt01.tiff");
  return {
    getTiffPath: () => tiffPath,
    useTiffPath: () => tiffPath,
  };
});

import { TiffImage } from "../src/components/ui/(image)/(tiff-image)/tiff-image";

// Stands in for layout. A dialog that animates in reports zero before it
// reports its real size.
let clientWidth = 0;
let clientHeight = 0;
const resizeCallbacks: (() => void)[] = [];

const realResizeObserver = globalThis.ResizeObserver;
const widthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientWidth"
);
const heightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientHeight"
);

Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get: () => clientWidth,
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get: () => clientHeight,
});

class RecordingResizeObserver {
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe() {
    resizeCallbacks.push(this.callback);
  }
  unobserve() {
    // not needed
  }
  disconnect() {
    // not needed
  }
}
globalThis.ResizeObserver =
  RecordingResizeObserver as unknown as typeof ResizeObserver;

afterAll(() => {
  globalThis.ResizeObserver = realResizeObserver;
  if (widthDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      "clientWidth",
      widthDescriptor
    );
  }
  if (heightDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      "clientHeight",
      heightDescriptor
    );
  }
});

beforeEach(() => {
  decodeCalls.length = 0;
  resizeCallbacks.length = 0;
  clientWidth = 0;
  clientHeight = 0;
});

const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe("TiffImage decode sizing", () => {
  // The bug this pins: a zero measurement produced maxWidth/maxHeight of
  // undefined, which means "no limit" rather than "not yet", so the full
  // 5796x3870 picture was decoded.
  it("does not decode while the container has no size", async () => {
    render(<TiffImage src="/photos/capt01.CR2" />);
    await settle();

    expect(decodeCalls).toHaveLength(0);
  });

  it("decodes once the container has been measured, capped to it", async () => {
    render(<TiffImage src="/photos/capt01.CR2" />);
    await settle();

    clientWidth = 800;
    clientHeight = 600;
    await act(() => {
      for (const callback of resizeCallbacks) {
        callback();
      }
      return Promise.resolve();
    });
    await settle();

    expect(decodeCalls).toHaveLength(1);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    expect(decodeCalls[0]?.maxWidth).toBe(Math.floor(800 * dpr));
    expect(decodeCalls[0]?.maxHeight).toBe(Math.floor(600 * dpr));
  });

  // Every extra decode was a new worker asking for a heap twice the file size.
  it("decodes only once, however often the container resizes", async () => {
    clientWidth = 800;
    clientHeight = 600;
    render(<TiffImage src="/photos/capt01.CR2" />);
    await settle();

    await act(() => {
      for (const callback of resizeCallbacks) {
        callback();
        callback();
      }
      return Promise.resolve();
    });
    await settle();

    expect(decodeCalls).toHaveLength(1);
  });
});
