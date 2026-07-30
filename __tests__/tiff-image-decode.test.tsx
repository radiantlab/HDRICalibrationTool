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
    // Resolves with a 1x1 image. The assertions are about what the decode was
    // asked for, but a promise that never settles would leave a suspended
    // React tree behind after every test.
    return Promise.resolve({
      buffer: new ArrayBuffer(4),
      height: 1,
      width: 1,
    });
  },
}));
jest.mock("@/components/ui/(image)/(tiff-image)/use-tiff-bytes", () => {
  // One promise for the whole module, because the real hook memoises. Handing
  // back a new one per render makes the identity of TiffImage's only effect
  // dependency change every render, which loops until the heap gives out.
  const tiffBytes = Promise.resolve(new Uint8Array(64));
  return { useTiffBytes: () => tiffBytes };
});

import { TiffImage } from "../src/components/ui/(image)/(tiff-image)/tiff-image";

// Stands in for layout. A dialog that animates in reports zero before it
// reports its real size.
let clientWidth = 0;
let clientHeight = 0;
const resizeCallbacks: (() => void)[] = [];

const realResizeObserver = globalThis.ResizeObserver;

/**
 * Gives one element a size, rather than patching HTMLElement.prototype.
 *
 * The prototype form reached every element in the environment, including
 * React's and testing-library's own, and made the suite segfault a worker
 * roughly one run in five under parallel load.
 */
function giveSize(element: Element) {
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    get: () => clientWidth,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
}

class RecordingResizeObserver {
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe(target: Element) {
    giveSize(target);
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
