/**
 * Answers #243's open question: does OPFS work where this app runs?
 *
 * Not a regression test. It reports a table and asserts only that the
 * webview did not lie -- bytes written must read back identical. Run it once
 * per host and record the result in the design doc; it decides whether the
 * persistent cache stores blobs in OPFS or in IndexedDB.
 *
 * Same probe body as `e2e-web/tests/storage-probe.spec.ts`, ported from
 * `page.evaluate` to `browser.execute` because this suite drives the three
 * Tauri webviews (WKWebView, WebView2, WebKitGTK) that Playwright cannot
 * attach to -- see the module docstring in `e2e-web/playwright.config.ts`.
 */
import assert from "node:assert/strict";
import { browser } from "@wdio/globals";
import { describe, it } from "mocha";

/** One converted CR2 frame, near enough. The realistic unit, not a token blob. */
const BLOB_BYTES = 67 * 1024 * 1024;

describe("storage probe", () => {
  it("OPFS and IndexedDB accept a converted-frame-sized blob", async () => {
    // WebDriver's own script timeout defaults far below what this needs: the
    // sync-access-handle path alone waits up to 60s internally, on top of
    // writing and reading 67 MB twice more through createWritable and
    // IndexedDB.
    await browser.setTimeout({ script: 180_000 });

    const report = await browser.execute(async (size) => {
      const out: Record<string, unknown> = {};

      const estimate = await navigator.storage?.estimate?.();
      out.quota = estimate?.quota ?? null;
      out.usage = estimate?.usage ?? null;

      // A recognisable, non-uniform pattern: a run of zeroes would survive a
      // truncated write and still compare equal.
      const source = new Uint8Array(size);
      for (let i = 0; i < size; i += 4096) {
        source[i] = (i / 4096) % 251;
      }

      out.opfsAvailable = typeof navigator.storage?.getDirectory === "function";
      if (out.opfsAvailable) {
        // Measured inside a dedicated worker, because `createSyncAccessHandle`
        // exists nowhere else -- which is the whole reason the persistent
        // tier sits in a worker. Timed against `createWritable` below so the
        // choice between them is made on numbers rather than on reasoning.
        const workerSource = `
          self.onmessage = async (event) => {
            const size = event.data;
            try {
              const root = await navigator.storage.getDirectory();
              const handle = await root.getFileHandle("probe-sync.bin", { create: true });
              if (typeof handle.createSyncAccessHandle !== "function") {
                self.postMessage({ available: false });
                return;
              }
              const access = await handle.createSyncAccessHandle();
              const bytes = new Uint8Array(size);
              const started = performance.now();
              access.write(bytes, { at: 0 });
              access.flush();
              const written = access.getSize();
              access.close();
              self.postMessage({
                available: true,
                writeMs: Math.round(performance.now() - started),
                written,
              });
              await root.removeEntry("probe-sync.bin");
            } catch (error) {
              self.postMessage({ available: true, error: String(error) });
            }
          };
        `;
        const worker = new Worker(
          URL.createObjectURL(
            new Blob([workerSource], { type: "text/javascript" })
          )
        );
        out.opfsSync = await new Promise((resolve) => {
          const timer = setTimeout(
            () => resolve({ error: "timed out after 60s" }),
            60_000
          );
          worker.onmessage = (event) => {
            clearTimeout(timer);
            resolve(event.data);
          };
          worker.postMessage(size);
        });
        worker.terminate();

        try {
          const root = await navigator.storage.getDirectory();
          const handle = await root.getFileHandle("probe.bin", {
            create: true,
          });
          const writable = await handle.createWritable();
          const started = performance.now();
          await writable.write(source);
          await writable.close();
          out.opfsWriteMs = Math.round(performance.now() - started);

          const readStarted = performance.now();
          const back = new Uint8Array(
            await (await handle.getFile()).arrayBuffer()
          );
          out.opfsReadMs = Math.round(performance.now() - readStarted);
          out.opfsRoundTrips =
            back.length === source.length &&
            back[0] === source[0] &&
            back[size - 4096] === source[size - 4096];

          await root.removeEntry("probe.bin");
          out.opfsRemoved = true;
        } catch (error) {
          out.opfsError = String(error);
        }
      }

      try {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("probe-db", 1);
          request.onupgradeneeded = () =>
            request.result.createObjectStore("blobs");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const started = performance.now();
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction("blobs", "readwrite");
          transaction.objectStore("blobs").put(source.buffer.slice(0), "probe");
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
        });
        out.idbWriteMs = Math.round(performance.now() - started);
        out.idbRoundTrips = true;
        database.close();
        indexedDB.deleteDatabase("probe-db");
      } catch (error) {
        out.idbError = String(error);
      }

      return out;
    }, BLOB_BYTES);

    // node.js context now -- printed the same way the Playwright probe does,
    // so both hosts' results are grepped out of CI logs the same way.
    console.log(
      `\n===STORAGE_PROBE===\n${JSON.stringify(report, null, 2)}\n===END===\n`
    );

    // Absence fails loudly rather than passing quietly. A green test on a
    // host with no OPFS would read as "verified" when nothing was verified at
    // all, and this run exists precisely to find out which hosts those are.
    // A failure here is a result to record, not a bug to fix.
    assert.equal(report.opfsAvailable, true, "OPFS is available on this host");
    assert.equal(
      report.opfsError,
      undefined,
      `OPFS write/read raised nothing: ${report.opfsError}`
    );
    assert.equal(report.opfsRoundTrips, true, "OPFS bytes read back identical");
    assert.equal(
      report.idbError,
      undefined,
      `IndexedDB accepted a 67 MB value: ${report.idbError}`
    );
  });
});
