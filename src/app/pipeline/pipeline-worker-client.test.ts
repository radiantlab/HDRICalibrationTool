/**
 * The staging contract: what the client hands the worker, it must own.
 *
 * `postMessage` with a transfer list *moves* the buffers, leaving the page's
 * views detached and zero-length. The bytes the client stages come from stores
 * that outlive the run -- the session filesystem hands back the array it holds
 * in its map, and the RAW preview cache documents that it hands back its own
 * buffer and never a copy -- so transferring them straight through emptied both.
 *
 * The damage was invisible until the *next* action. A second run threw
 * `DataCloneError: An ArrayBuffer is detached and could not be cloned`, and a
 * preset compared its calibration file against a now-empty source and reported
 * that the file had changed on disk when nothing had touched it.
 *
 * These tests use a worker double that detaches what it is given, exactly as a
 * real one does, so they fail against a client that transfers borrowed bytes.
 */

import { afterEach, describe, expect, it } from "@jest/globals";
import type { PipelineParams } from "@/lib/pipeline/types";
import { clearSessionFiles, readVirtual, registerSessionFile } from "@/lib/vfs";

declare const jest: typeof import("@jest/globals").jest;

const peekedTiff = jest.fn<() => Promise<Uint8Array | undefined>>();

jest.mock("@/lib/raw-preview", () => ({
  peekRawTiff: () => peekedTiff(),
}));
jest.mock("@/lib/host/raw-io", () => ({ tauriRawIo: {} }));

import { executeInWorker } from "./pipeline-worker-client";

/**
 * A store that hands out the array it holds, like the session filesystem.
 *
 * That aliasing is the point: a store handing back copies could not be
 * damaged by a consumer transferring what it was given, and there would be
 * nothing here to test.
 */
function sessionStore(entries: Record<string, number[]>) {
  const held = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    held.set(path, new Uint8Array(bytes));
  }
  return {
    held,
    read: (path: string) => {
      const bytes = held.get(path);
      if (!bytes) {
        throw new Error(`${path} is not in the store`);
      }
      return Promise.resolve(bytes);
    },
  };
}

/** The staged files, as they looked the instant the worker received them. */
const received: Record<string, number[]>[] = [];

/**
 * Stands in for the pipeline worker, and moves buffers the way a real one does.
 *
 * `ArrayBuffer.prototype.transfer()` is the same detachment the structured
 * clone algorithm performs for a transfer list, so a buffer that survives this
 * double survives a real `postMessage`, and one that does not raises the same
 * `DataCloneError` here that the browser raised.
 */
function installWorkerDouble() {
  class FakeWorker {
    private readonly listeners = new Map<
      string,
      ((event: unknown) => void)[]
    >();

    addEventListener(type: string, listener: (event: unknown) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    postMessage(message: unknown, transfer: Transferable[] = []) {
      // Checked before anything is read, because that is the order a real
      // `postMessage` fails in: the transfer list is validated first, and a
      // detached entry in it aborts the send before the message is serialised.
      for (const item of transfer) {
        const buffer = item as ArrayBuffer & { detached?: boolean };
        if (buffer.detached || buffer.byteLength === 0) {
          throw new Error(
            "DataCloneError: Failed to execute 'postMessage' on 'Worker': " +
              "An ArrayBuffer is detached and could not be cloned."
          );
        }
      }

      const { files } = message as { files: Record<string, Uint8Array> };
      const snapshot: Record<string, number[]> = {};
      for (const [path, bytes] of Object.entries(files)) {
        snapshot[path] = Array.from(bytes);
      }
      received.push(snapshot);

      for (const item of transfer) {
        (item as ArrayBuffer).transfer();
      }
      queueMicrotask(() => {
        for (const listener of this.listeners.get("message") ?? []) {
          listener({
            data: {
              computedVerticalIlluminance: null,
              kind: "done",
              outputs: [],
            },
          });
        }
      });
    }

    terminate() {
      // Nothing to tear down; the double holds no resources.
    }
  }

  (globalThis as { Worker?: unknown }).Worker = FakeWorker;
}

function params(overrides: Partial<PipelineParams> = {}): PipelineParams {
  return {
    diameter: 3612,
    fisheyeCorrectionCal: "",
    horizontalAngle: 180,
    inputImages: ["/session/1/a.jpg", "/session/2/b.jpg"],
    legendHeight: "",
    legendWidth: "",
    measuredVerticalIlluminance: null,
    neutralDensityCal: "",
    photometricAdjustmentCal: "",
    projection: "vta",
    responseFunction: "",
    scaleLabel: "",
    scaleLevels: "",
    scaleLimit: "",
    setName: "Images",
    verticalAngle: 180,
    vignettingCorrectionCal: "",
    xdim: 1000,
    xleft: 1019,
    ydim: 1000,
    ytop: 66,
    ...overrides,
  };
}

function run(
  store: { read: (path: string) => Promise<Uint8Array> },
  p = params()
) {
  return executeInWorker({
    onStatus: () => undefined,
    params: p,
    read: store.read,
    wasmBaseUrl: "http://localhost/wasm",
  });
}

const realWorker = (globalThis as { Worker?: unknown }).Worker;

afterEach(() => {
  received.length = 0;
  peekedTiff.mockReset();
  (globalThis as { Worker?: unknown }).Worker = realWorker;
});

describe("staging bytes for the worker", () => {
  it("leaves the caller's buffers intact", async () => {
    installWorkerDouble();
    const store = sessionStore({
      "/session/1/a.jpg": [1, 2, 3],
      "/session/2/b.jpg": [4, 5, 6],
    });

    await run(store);

    // The session filesystem still resolves what it resolved before the run.
    // This is what a preset's `changedSources` reads, and reading zero bytes
    // there is what produced the "changed on disk" warning for a file that
    // nothing had touched.
    expect(Array.from(store.held.get("/session/1/a.jpg") ?? [])).toEqual([
      1, 2, 3,
    ]);
    expect(Array.from(store.held.get("/session/2/b.jpg") ?? [])).toEqual([
      4, 5, 6,
    ]);
  });

  it("runs a second time on the same files", async () => {
    installWorkerDouble();
    const store = sessionStore({
      "/session/1/a.jpg": [1, 2, 3],
      "/session/2/b.jpg": [4, 5, 6],
    });

    await run(store);

    // The reported failure: load a preset, press Generate again, and the run
    // never started because the buffers had been given away by the first one.
    await expect(run(store)).resolves.toEqual({
      computedVerticalIlluminance: null,
      outputs: [],
    });
  });

  it("still hands the worker the bytes it staged", async () => {
    installWorkerDouble();
    const store = sessionStore({ "/session/1/a.jpg": [1, 2, 3] });

    await run(store, params({ inputImages: ["/session/1/a.jpg"] }));

    // Protecting the caller's buffers by sending the worker an empty view
    // would be no fix at all, so what arrived is asserted as well as what
    // survived. The key is the staged name, not the source: see #241.
    expect(received[0]).toEqual({ "/src/1-a.jpg": [1, 2, 3] });
  });

  it("stages every file under a name that carries no directory", async () => {
    installWorkerDouble();
    const store = sessionStore({
      "/session/1/DSC_0001.JPG": [1],
      "/session/2/CF_f5d6.cal": [2],
      "/session/3/response_function.rsp": [3],
    });

    await run(
      store,
      params({
        inputImages: ["/session/1/DSC_0001.JPG"],
        photometricAdjustmentCal: "/session/2/CF_f5d6.cal",
        responseFunction: "/session/3/response_function.rsp",
      })
    );

    expect(Object.keys(received[0] ?? {}).sort()).toEqual([
      "/cal/photometric-CF_f5d6.cal",
      "/src/1-DSC_0001.JPG",
      "/src/response-response_function.rsp",
    ]);
  });

  it("reads from the source path and stages under the staged path", async () => {
    installWorkerDouble();
    const store = sessionStore({ "/session/1/a.jpg": [9, 9] });

    await run(store, params({ inputImages: ["/session/1/a.jpg"] }));

    // The bytes have to come from where the file actually is; only the name
    // the worker sees changes.
    expect(received[0]?.["/src/1-a.jpg"]).toEqual([9, 9]);
  });

  it("leaves the caller's params naming the files the user picked", async () => {
    installWorkerDouble();
    const store = sessionStore({ "/session/1/a.jpg": [1] });
    const original = params({ inputImages: ["/session/1/a.jpg"] });

    await run(store, original);

    // Run history records these for display. Rewriting them in place would
    // show the user staged paths for files they chose themselves.
    expect(original.inputImages).toEqual(["/session/1/a.jpg"]);
  });

  // The store above is a stand-in, and a stand-in can only prove the client
  // does not damage something shaped like the session filesystem. This runs the
  // real one, which is the chain that broke: a file is registered when the user
  // picks it, staged by path, and read again afterwards by whatever needs it.
  it("leaves the real session filesystem readable", async () => {
    installWorkerDouble();
    const path = registerSessionFile("a.jpg", new Uint8Array([1, 2, 3]));

    await executeInWorker({
      onStatus: () => undefined,
      params: params({ inputImages: [path] }),
      read: readVirtual,
      wasmBaseUrl: "http://localhost/wasm",
    });

    await expect(readVirtual(path)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    clearSessionFiles();
  });

  it("leaves a peeked RAW conversion in the cache", async () => {
    installWorkerDouble();
    // The cache hands out its own buffer, so transferring it evicts the frame
    // in all but name: the entry stays, sized zero, and every later reader
    // gets nothing.
    const cached = new Uint8Array([7, 8, 9, 10]);
    peekedTiff.mockResolvedValue(cached);
    const store = sessionStore({ "/session/1/a.CR2": [1, 2, 3] });

    await run(store, params({ inputImages: ["/session/1/a.CR2"] }));

    expect(Array.from(cached)).toEqual([7, 8, 9, 10]);
  });
});
