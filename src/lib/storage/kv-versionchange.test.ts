/**
 * Whether an existing connection yields to a newer tab's upgrade, in its own
 * file for the same module-registry-isolation reason as `kv-upgrade.test.ts`.
 */
import "fake-indexeddb/auto";
import { describe, expect, it } from "@jest/globals";
import { getDocument } from "./kv";

describe("onversionchange", () => {
  it("closes kv.ts's connection so a newer open() is not blocked", async () => {
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
  });
});
