/**
 * F1: opening at a version lower than what's already on disk, in its own
 * file for the same module-registry-isolation reason as `kv-upgrade.test.ts`
 * -- every other test file that imports `./kv` opens the shared fake
 * database at `DATABASE_VERSION` as its first act, which would leave nothing
 * at a higher version left for this test to downgrade from.
 */
import "fake-indexeddb/auto";
import { describe, expect, it } from "@jest/globals";
import { DatabaseVersionError, getDocument } from "./kv";

describe("opening at a version lower than what's on disk", () => {
  it("rejects with DatabaseVersionError rather than a generic error", async () => {
    // Stands in for a rolled-back deploy, a stale HTTP-cached bundle, or a
    // reinstalled older desktop build: something else already upgraded this
    // database past DATABASE_VERSION (2) before this module's open() ever
    // runs.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("hdri-calibration", 3);
      request.onupgradeneeded = () => {
        // Nothing to create; only that the database ends up at version 3.
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const error = await getDocument("anything").catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(DatabaseVersionError);
    expect((error as Error).name).toBe("DatabaseVersionError");
  });
});
