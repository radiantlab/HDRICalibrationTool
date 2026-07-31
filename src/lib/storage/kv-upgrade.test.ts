/**
 * The version 1 to 2 upgrade, in its own file.
 *
 * `kv.test.ts` and every other test that imports `./kv` opens the database at
 * the current `DATABASE_VERSION` as its first act, which would leave nothing
 * at version 1 left to upgrade from by the time this ran. Jest gives each
 * test file its own module registry, and `fake-indexeddb/auto` seeds a fresh
 * in-memory `indexedDB` per registry, so being alone in this file is what
 * guarantees the database does not already exist above version 1 when the
 * test below creates it.
 */
import "fake-indexeddb/auto";
import { describe, expect, it } from "@jest/globals";
import { blobKeys, getDocument, getFile, resetConnectionForTests } from "./kv";

describe("the version 1 to 2 upgrade", () => {
  it("keeps existing data and adds the blobs store", async () => {
    // Simulates a real user's database: created at version 1, holding a
    // document and a file, before this module ever opens it. The name is
    // hardcoded rather than imported, because it pins the address the big
    // comment above DATABASE in kv.ts says must never change -- if that
    // constant were ever edited, this test should still open the database
    // real users have on disk today.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("hdri-calibration", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore("documents");
        database.createObjectStore("files");
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(
          ["documents", "files"],
          "readwrite"
        );
        transaction.objectStore("documents").put({ name: "existing" }, "doc");
        transaction
          .objectStore("files")
          .put(new Uint8Array([1, 2, 3]).buffer, "file");
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });

    // kv.ts opens lazily on first call, not at module load, and nothing in
    // this file has called into it yet -- so there is no cached connection
    // for this to drop. It is kept anyway, defensively: it costs nothing,
    // and it stops this test from silently depending on being the first
    // caller if a later change adds one before it.
    resetConnectionForTests();

    await expect(getDocument("doc")).resolves.toEqual({ name: "existing" });
    await expect(getFile("file")).resolves.toEqual(new Uint8Array([1, 2, 3]));
    // Proves blobs was created on the upgrade path, not only the
    // fresh-database path every other test in this suite takes.
    await expect(blobKeys()).resolves.toEqual([]);
  });
});
