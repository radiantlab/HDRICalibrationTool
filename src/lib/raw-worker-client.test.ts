/**
 * One worker, one queue.
 *
 * Conversions are serialised deliberately. `WasmToolRunner.clear()` keeps its
 * compiled modules, so a single worker converting ten frames in turn compiles
 * `dcraw_emu` once and peaks at one instance, where a pool would compile per
 * worker and multiply a 266 MiB peak by its width.
 *
 * The other two properties here are failure properties: a worker that dies
 * must reject the conversion waiting on it rather than leaving it suspended,
 * and must not poison the ones behind it.
 */

import { afterEach, describe, expect, it } from "@jest/globals";

import { convertRawInWorker, resetRawWorker } from "./raw-worker-client";

interface Pending {
  fail: () => void;
  respond: (tiff: Uint8Array) => void;
}

/** Every worker the client has constructed, in order. */
const built: FakeWorker[] = [];
const pending: Pending[] = [];

class FakeWorker {
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  posts = 0;
  terminated = false;

  constructor() {
    built.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((each) => each !== listener)
    );
  }

  postMessage(_message: unknown, transfer: Transferable[] = []) {
    for (const item of transfer) {
      (item as ArrayBuffer).transfer();
    }
    this.posts += 1;
    pending.push({
      fail: () => this.emit("error", { message: "worker died" }),
      respond: (tiff: Uint8Array) =>
        this.emit("message", { data: { kind: "done", tiff } }),
    });
  }

  terminate() {
    this.terminated = true;
  }

  private emit(type: string, event: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const realWorker = (globalThis as { Worker?: unknown }).Worker;

function install() {
  (globalThis as { Worker?: unknown }).Worker = FakeWorker;
}

/** Lets queued microtasks run, so a chained conversion reaches postMessage. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  resetRawWorker();
  built.length = 0;
  pending.length = 0;
  (globalThis as { Worker?: unknown }).Worker = realWorker;
});

describe("driving the RAW worker", () => {
  it("sends one frame at a time", async () => {
    install();

    const first = convertRawInWorker("/in/a.CR2", new Uint8Array([1]), "/wasm");
    const second = convertRawInWorker(
      "/in/b.CR2",
      new Uint8Array([2]),
      "/wasm"
    );
    await settle();

    // The second frame has not been sent: the whole point of the queue is that
    // two instances of a tool peaking at 266 MiB never exist at once.
    expect(built).toHaveLength(1);
    expect(built[0]?.posts).toBe(1);

    pending[0]?.respond(new Uint8Array([9]));
    await expect(first).resolves.toEqual(new Uint8Array([9]));
    await settle();
    expect(built[0]?.posts).toBe(2);

    pending[1]?.respond(new Uint8Array([8]));
    await expect(second).resolves.toEqual(new Uint8Array([8]));
  });

  it("leaves the caller's bytes intact", async () => {
    install();
    const bytes = new Uint8Array([1, 2, 3]);

    const conversion = convertRawInWorker("/in/a.CR2", bytes, "/wasm");
    await settle();
    pending[0]?.respond(new Uint8Array([9]));
    await conversion;

    // `readFile` hands back the session filesystem's own array, so a client
    // that transferred what it was given would empty it. Same defect as the
    // pipeline client's, and the same rule: copy before you transfer.
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it("rejects the frame a dying worker was holding", async () => {
    install();

    const conversion = convertRawInWorker(
      "/in/a.CR2",
      new Uint8Array([1]),
      "/wasm"
    );
    await settle();
    pending[0]?.fail();

    await expect(conversion).rejects.toThrow("worker died");
  });

  it("builds a fresh worker after one dies", async () => {
    install();

    const doomed = convertRawInWorker(
      "/in/a.CR2",
      new Uint8Array([1]),
      "/wasm"
    );
    await settle();
    pending[0]?.fail();
    await expect(doomed).rejects.toThrow("worker died");

    const next = convertRawInWorker("/in/b.CR2", new Uint8Array([2]), "/wasm");
    await settle();

    // Queueing behind a corpse would suspend every later frame forever, so an
    // OOM on one frame must cost that frame and nothing else.
    expect(built).toHaveLength(2);
    // And the corpse itself must not be left running: a dead worker still
    // holding its ~266 MiB runner is a leak, not a fallback.
    expect(built[0]?.terminated).toBe(true);
    pending[1]?.respond(new Uint8Array([7]));
    await expect(next).resolves.toEqual(new Uint8Array([7]));
  });

  it("keeps frames serialized when a worker dies mid-queue", async () => {
    install();

    const first = convertRawInWorker("/in/a.CR2", new Uint8Array([1]), "/wasm");
    const second = convertRawInWorker(
      "/in/b.CR2",
      new Uint8Array([2]),
      "/wasm"
    );
    await settle();

    pending[0]?.fail();
    await expect(first).rejects.toThrow("worker died");

    // `second` was already queued behind `first` before it died. Queued
    // three deep on purpose: if the chain's ordering breaks when a worker
    // dies mid-queue, this is where `third` would reach the fresh worker
    // alongside `second`, and two conversions sharing one `WasmToolRunner`
    // is exactly what serialising them exists to prevent -- the first's
    // `clear()` would wipe the second's staged input.
    const third = convertRawInWorker("/in/c.CR2", new Uint8Array([3]), "/wasm");
    await settle();

    expect(built).toHaveLength(2);
    expect(built[1]?.posts).toBe(1);

    pending[1]?.respond(new Uint8Array([8]));
    await expect(second).resolves.toEqual(new Uint8Array([8]));
    await settle();
    expect(built[1]?.posts).toBe(2);

    pending[2]?.respond(new Uint8Array([9]));
    await expect(third).resolves.toEqual(new Uint8Array([9]));
  });
});
