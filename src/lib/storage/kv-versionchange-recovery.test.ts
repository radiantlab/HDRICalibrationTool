/**
 * F4: a call after onversionchange must succeed by reopening, not fail
 * forever. In its own file so this test's own trigger for onversionchange
 * (an explicit open at version 3) does not collide with the one in
 * `kv-versionchange.test.ts` -- each Jest test file gets its own
 * `fake-indexeddb` registry, so the database this test bumps to version 3
 * is not the same one another file already bumped.
 */
import "fake-indexeddb/auto";
import { describe, expect, it } from "@jest/globals";
import { getDocument, putDocument } from "./kv";

const TEST_TIMEOUT_MS = 5000;

describe("recovering from onversionchange", () => {
  it(
    "reopens rather than failing forever once the old connection is closed",
    async () => {
      // The fault this guards against: closing the database in
      // onversionchange without also clearing kv.ts's cached `connection`
      // leaves that module-level variable resolved to a closed handle. Every
      // call into kv.ts after that point would then reject with
      // InvalidStateError permanently -- not just the call that raced the
      // version change -- since nothing else ever clears the cache.
      // app-storage.ts's readJson swallows read errors and returns the
      // fallback, so that failure would not surface as an error to the
      // user; it would render as an empty app -- no presets, no settings,
      // no run history -- until the tab is reloaded.
      await putDocument("before", { survives: true });

      // Triggers this tab's onversionchange by opening at a higher version,
      // the same way kv-versionchange.test.ts does -- but aborts the
      // upgrade transaction rather than letting it complete. Per the
      // IndexedDB spec an aborted upgrade rolls the database's version back
      // to what it was; letting it complete would leave the shared fake
      // database at version 3 forever, and kv.ts always asks for
      // DATABASE_VERSION (2), so a later call in *this test* would fail with
      // VersionError for a reason that has nothing to do with what F4 is
      // about. The versionchange event this test cares about has already
      // fired on kv.ts's connection by the time onupgradeneeded runs here,
      // so aborting after that point still exercises the fix.
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("hdri-calibration", 3);
        request.onupgradeneeded = () => {
          request.transaction?.abort();
        };
        request.onsuccess = () => {
          request.result.close();
          reject(new Error("expected the upgrade to abort"));
        };
        request.onerror = () => resolve();
      });

      // The behaviour that actually matters is not that onversionchange
      // called close() -- it is that a caller on the other side of that
      // event still gets a working database, by reopening, rather than
      // InvalidStateError from a connection nothing ever replaced.
      await expect(getDocument("before")).resolves.toEqual({
        survives: true,
      });
      await expect(
        putDocument("after", { alsoWorks: true })
      ).resolves.toBeDefined();
    },
    TEST_TIMEOUT_MS
  );
});
