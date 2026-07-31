/**
 * Whether an existing connection yields to a newer tab's upgrade, in its own
 * file for the same module-registry-isolation reason as `kv-upgrade.test.ts`.
 * (The recovery half of this fix, F4, is in `kv-versionchange-recovery.test.ts`
 * rather than a second `it` here, because this test leaves the underlying
 * fake database bumped to version 3 -- a second test in this same registry
 * that needed kv.ts to reopen at version 2 would immediately fail with
 * VersionError, not because of anything under test, but because of the
 * version this test itself left behind.)
 *
 * A regression here tends to read as a hang rather than a failing assertion
 * -- the production `open()` promise this exercises simply never settles,
 * because it deadlocks on the newer tab's `onblocked`. That was verified by
 * hand while building this fix: removing `onversionchange` made this test
 * run past Jest's tool-level timeout with no output. The explicit per-test
 * timeout below turns that into a red test in a few seconds rather than a
 * run that has to be killed.
 */
import "fake-indexeddb/auto";
import { describe, expect, it } from "@jest/globals";
import { getDocument } from "./kv";

const TEST_TIMEOUT_MS = 5000;

describe("onversionchange", () => {
  it(
    "closes kv.ts's connection so a newer open() is not blocked",
    async () => {
      // Establishes kv.ts's cached connection at DATABASE_VERSION (2), the
      // same as an already-open tab.
      await getDocument("anything");

      // Stands in for a newer tab's kv.ts loading a build with a higher
      // DATABASE_VERSION. Without the fix, this hangs on onblocked, because
      // kv.ts's connection above never closes to let it proceed.
      const opened = await new Promise<{ blocked: boolean; version: number }>(
        (resolve, reject) => {
          let blocked = false;
          const request = indexedDB.open("hdri-calibration", 3);
          request.onupgradeneeded = () => {
            // Nothing to create; only whether the upgrade transaction starts
            // at all is under test here.
          };
          request.onblocked = () => {
            blocked = true;
          };
          request.onsuccess = () => {
            const database = request.result;
            database.close();
            resolve({ blocked, version: database.version });
          };
          request.onerror = () => reject(request.error);
        }
      );

      expect(opened.blocked).toBe(false);
      expect(opened.version).toBe(3);
    },
    TEST_TIMEOUT_MS
  );
});
