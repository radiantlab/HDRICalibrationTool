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
 *
 * A single 67 MB `write()` raised `UnknownError: ... out of memory` on
 * Playwright's WebKit under a reported 1000 MB quota -- which only indicts
 * OPFS itself if the failure follows the bytes rather than the call. Both
 * write paths below therefore run twice: once as one call across the whole
 * blob, once as 8 MB slices through the same handle. A chunked pass that
 * survives where the single-shot one didn't points at the call shape, not
 * the backend. (The same Playwright run also showed the WebKit result can be
 * confounded by host memory pressure unrelated to OPFS -- see the design
 * doc's "Probe results" section before reading a WKWebView failure here as
 * decisive on its own.)
 */
import assert from "node:assert/strict";
import { browser } from "@wdio/globals";
import { describe, it } from "mocha";

/** One converted CR2 frame, near enough. The realistic unit, not a token blob. */
const BLOB_BYTES = 67 * 1024 * 1024;

/** Slice size for the chunked write paths -- arbitrary but comfortably under
 * both the whole blob and any single-message size limit a worker might hit. */
const CHUNK_BYTES = 8 * 1024 * 1024;

describe("storage probe", () => {
  it("OPFS and IndexedDB accept a converted-frame-sized blob", async () => {
    // WebDriver's own script timeout defaults far below what this needs: the
    // sync-access-handle path alone waits up to 60s internally, on top of
    // writing and reading 67 MB twice more through createWritable and
    // IndexedDB.
    await browser.setTimeout({ script: 180_000 });

    const report = await browser.execute(
      async (size, chunkBytes) => {
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

        // Shared by both `createWritable` passes below: write through
        // `writeFn`, then read the whole file back and compare it to
        // `source` at the same three points the worker's own comparison
        // uses. Factored out so the single-shot and chunked call sites read
        // as "what differs" rather than repeating the read-back/compare.
        async function writeAndVerify(
          root: FileSystemDirectoryHandle,
          fileName: string,
          writeFn: (writable: FileSystemWritableFileStream) => Promise<void>
        ) {
          const handle = await root.getFileHandle(fileName, { create: true });
          const writable = await handle.createWritable();
          const started = performance.now();
          await writeFn(writable);
          await writable.close();
          const writeMs = Math.round(performance.now() - started);

          const readStarted = performance.now();
          const back = new Uint8Array(
            await (await handle.getFile()).arrayBuffer()
          );
          const readMs = Math.round(performance.now() - readStarted);
          const roundTrips =
            back.length === source.length &&
            back[0] === source[0] &&
            back[size - 4096] === source[size - 4096];

          await root.removeEntry(fileName);
          return { readMs, roundTrips, writeMs };
        }

        out.opfsAvailable =
          typeof navigator.storage?.getDirectory === "function";
        if (out.opfsAvailable) {
          // Measured inside a dedicated worker, because `createSyncAccessHandle`
          // exists nowhere else -- which is the whole reason the persistent
          // tier sits in a worker. Timed against `createWritable` below so the
          // choice between them is made on numbers rather than on reasoning.
          // Both the single-shot and chunked passes run in this one worker,
          // back to back, so a fresh handle is used for each rather than
          // reopening the first.
          const workerSource = `
          const CHUNK_BYTES = ${chunkBytes};

          async function writeSingleShot(root, size) {
            try {
              const handle = await root.getFileHandle("probe-sync.bin", { create: true });
              if (typeof handle.createSyncAccessHandle !== "function") {
                return { available: false };
              }
              const access = await handle.createSyncAccessHandle();
              const bytes = new Uint8Array(size);
              const started = performance.now();
              access.write(bytes, { at: 0 });
              access.flush();
              const written = access.getSize();
              access.close();
              const result = {
                available: true,
                writeMs: Math.round(performance.now() - started),
                written,
              };
              await root.removeEntry("probe-sync.bin");
              return result;
            } catch (error) {
              return { available: true, error: String(error) };
            }
          }

          async function writeChunked(root, size) {
            try {
              const handle = await root.getFileHandle("probe-sync-chunked.bin", { create: true });
              if (typeof handle.createSyncAccessHandle !== "function") {
                return { available: false };
              }
              const access = await handle.createSyncAccessHandle();
              const started = performance.now();
              for (let position = 0; position < size; position += CHUNK_BYTES) {
                const chunkSize = Math.min(CHUNK_BYTES, size - position);
                access.write(new Uint8Array(chunkSize), { at: position });
              }
              access.flush();
              const written = access.getSize();
              access.close();
              const result = {
                available: true,
                writeMs: Math.round(performance.now() - started),
                written,
              };
              await root.removeEntry("probe-sync-chunked.bin");
              return result;
            } catch (error) {
              return { available: true, error: String(error) };
            }
          }

          // A top-level catch too, not just inside each helper: the single
          // point of failure that would otherwise post nothing at all, and
          // the caller waits out the full timeout with no idea why.
          self.onmessage = async (event) => {
            const size = event.data;
            try {
              const root = await navigator.storage.getDirectory();
              const single = await writeSingleShot(root, size);
              const chunked = await writeChunked(root, size);
              try {
                self.postMessage({ single, chunked });
              } catch (error) {
                self.postMessage({ stage: "postMessage", error: String(error) });
              }
            } catch (error) {
              self.postMessage({ stage: "getDirectory", error: String(error) });
            }
          };
        `;
          const worker = new Worker(
            URL.createObjectURL(
              new Blob([workerSource], { type: "text/javascript" })
            )
          );
          // Two full passes over the blob now share this one timeout budget,
          // so it is double the single-pass figure below rather than the
          // same one.
          const workerReport = await new Promise<{
            single?: Record<string, unknown>;
            chunked?: Record<string, unknown>;
            error?: string;
          }>((resolve) => {
            const timer = setTimeout(
              () => resolve({ error: "timed out after 120s" }),
              120_000
            );
            worker.onmessage = (event) => {
              clearTimeout(timer);
              resolve(event.data);
            };
            worker.postMessage(size);
          });
          out.opfsSync = workerReport?.single ?? workerReport;
          out.opfsSyncChunked = workerReport?.chunked;
          worker.terminate();

          try {
            const root = await navigator.storage.getDirectory();
            const result = await writeAndVerify(root, "probe.bin", (writable) =>
              writable.write(source)
            );
            out.opfsWriteMs = result.writeMs;
            out.opfsReadMs = result.readMs;
            out.opfsRoundTrips = result.roundTrips;
            out.opfsRemoved = true;
          } catch (error) {
            out.opfsError = String(error);
          }

          // Same comparison, chunked: 8 MB slices through one handle rather
          // than one call across the whole blob. See the module docstring for
          // why.
          try {
            const root = await navigator.storage.getDirectory();
            const result = await writeAndVerify(
              root,
              "probe-chunked.bin",
              async (writable) => {
                for (
                  let position = 0;
                  position < size;
                  position += chunkBytes
                ) {
                  const slice = source.subarray(
                    position,
                    Math.min(position + chunkBytes, size)
                  );
                  await writable.write({
                    data: slice,
                    position,
                    type: "write",
                  });
                }
              }
            );
            out.opfsChunkedWriteMs = result.writeMs;
            out.opfsChunkedReadMs = result.readMs;
            out.opfsChunkedRoundTrips = result.roundTrips;
            out.opfsChunkedRemoved = true;
          } catch (error) {
            out.opfsChunkedError = String(error);
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
            transaction
              .objectStore("blobs")
              .put(source.buffer.slice(0), "probe");
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
      },
      BLOB_BYTES,
      CHUNK_BYTES
    );

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
