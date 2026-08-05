import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "@jest/globals";
import { getDocument, putDocument, updateDocument } from "./kv";

// What aborts a transaction at commit time in the field is quota exhaustion,
// and there is no way to exhaust fake-indexeddb's quota. Aborting from a
// listener on the successful request reproduces the ordering that matters:
// the request succeeds, and the transaction goes away afterwards.
const realPut = IDBObjectStore.prototype.put;

// Aborting while the request is still pending is the other order: the abort
// settles every in-flight request with an AbortError before the transaction
// itself gives up, so the request never succeeds at all.
function abortDuringNextPut(): void {
  IDBObjectStore.prototype.put = function put(
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore["put"]>
  ) {
    IDBObjectStore.prototype.put = realPut;
    const request = realPut.apply(this, args);
    this.transaction.abort();
    return request;
  };
}

function abortAfterNextPut(): void {
  IDBObjectStore.prototype.put = function put(
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore["put"]>
  ) {
    IDBObjectStore.prototype.put = realPut;
    const request = realPut.apply(this, args);
    request.addEventListener("success", () => {
      request.transaction?.abort();
    });
    return request;
  };
}

afterEach(() => {
  IDBObjectStore.prototype.put = realPut;
});

describe("a write whose transaction aborts after the request succeeds", () => {
  it("rejects rather than reporting the write as durable", async () => {
    abortAfterNextPut();

    await expect(
      putDocument("aborted-preset", { name: "one" })
    ).rejects.toThrow();
  });

  it("leaves nothing behind to read", async () => {
    abortAfterNextPut();

    await putDocument("rolled-back-preset", { name: "two" }).catch(
      () => undefined
    );

    expect(await getDocument("rolled-back-preset")).toBeUndefined();
  });

  // `run`'s `onerror` path cannot be isolated from its `onabort` path through
  // this API: an unprevented request error aborts its own transaction anyway,
  // so both handlers fire and either one alone would reject. Removing
  // `request.onerror` was checked, and this still passes. What it does pin is
  // that a request which never succeeds settles the promise rather than
  // leaving it pending forever -- the failure mode that resolving on
  // `oncomplete` would introduce if the abort rejection went missing.
  it("rejects rather than hanging when the abort lands mid-flight", async () => {
    abortDuringNextPut();

    await expect(
      putDocument("abandoned-preset", { name: "three" })
    ).rejects.toThrow();
  });
});

describe("updateDocument", () => {
  it("rejects when the transaction aborts after its put succeeds", async () => {
    abortAfterNextPut();

    await expect(
      updateDocument<number[]>("aborted-counter", (current) => [
        ...(current ?? []),
        1,
      ])
    ).rejects.toThrow();
  });
});
