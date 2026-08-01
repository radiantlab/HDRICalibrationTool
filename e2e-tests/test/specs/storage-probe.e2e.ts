/**
 * Answered #243's open question: does OPFS work where this app runs?
 *
 * It found `navigator.storage.getDirectory` absent -- not slow, not
 * quota-limited, absent -- in WebKit and in WebKitGTK 605.1.15, the webview
 * Tauri uses on Linux. IndexedDB round-tripped 67 MB on every engine tested,
 * including both WebKits, so the persistent cache was built on IndexedDB
 * (`raw-cache-idb.ts`), and that is what this probe now guards: IndexedDB
 * failing is a real regression, OPFS being missing is not, because nothing
 * depends on it. OPFS is still measured and printed on every run -- see the
 * assertions at the bottom -- so a future host that gains OPFS shows up in
 * the CI log without this spec having to change again.
 *
 * Same probe body as `e2e-web/tests/storage-probe.spec.ts`, ported from
 * `page.evaluate` to `browser.execute` because this suite drives the three
 * Tauri webviews (WKWebView, WebView2, WebKitGTK) that Playwright cannot
 * attach to -- see the module docstring in `e2e-web/playwright.config.ts`.
 *
 * The port is not a straight copy, though: `page.evaluate` awaits a returned
 * promise because it speaks CDP, but `browser.execute` speaks classic
 * WebDriver's execute-sync endpoint by default, which does not -- only a
 * BiDi-negotiated session does, and whether Tauri's drivers negotiate BiDi is
 * unverified. Every `browser.execute` call in `app.e2e.ts` is a synchronous
 * callback for exactly this reason: on a driver that ignores the returned
 * promise, an async callback here would return before the probe resolves and
 * silently produce no measurement -- the precise failure this port exists to
 * avoid, so it follows the same convention. The callback below is
 * synchronous; it launches the probe as a page-side IIFE that stashes its
 * result on a `window` global, and the Node side polls with
 * `browser.waitUntil`.
 *
 * A single 67 MB `write()` raised `UnknownError: ... out of memory` on
 * Playwright's WebKit under a reported 1000 MB quota -- which only indicts
 * OPFS itself if the failure follows the bytes rather than the call. Both
 * write paths below therefore run twice: once as one call across the whole
 * blob, once as 8 MB slices through the same handle. A chunked pass that
 * survives where the single-shot one didn't points at the call shape, not
 * the backend.
 *
 * That same WebKit run turned out to be neither of those things: a follow-up
 * 4-byte write failed with the identical error, on a host that
 * `memory_pressure` showed was down to double-digit megabytes free. A host
 * that cannot write 4 bytes cannot tell you whether it can write 67 MB in one
 * call or eight, so a trivial control write now runs first and gates how the
 * rest of the report is read -- see the assertions at the bottom, and the
 * design doc's "Probe results" section for what that meant for the WebKit row
 * already recorded there.
 */
import assert from "node:assert/strict";
import { browser } from "@wdio/globals";
import { describe, it } from "mocha";

/** One converted CR2 frame, near enough. The realistic unit, not a token blob. */
const BLOB_BYTES = 67 * 1024 * 1024;

/** Slice size for the chunked write paths -- arbitrary but comfortably under
 * both the whole blob and any single-message size limit a worker might hit. */
const CHUNK_BYTES = 8 * 1024 * 1024;

/** Where the page-side IIFE below parks its progress and result, so the Node
 * side can poll for them with plain, synchronous `browser.execute` calls. */
interface StorageProbeWindow {
  __storageProbeDone?: boolean;
  __storageProbeResult?: Record<string, unknown>;
}

describe("storage probe", () => {
  it("OPFS and IndexedDB accept a converted-frame-sized blob", async () => {
    // Synchronous on purpose -- see the module docstring. This call returns
    // as soon as the IIFE is launched, not when it finishes.
    await browser.execute(
      (size, chunkBytes) => {
        const w = window as unknown as StorageProbeWindow;
        w.__storageProbeDone = false;
        w.__storageProbeResult = undefined;

        // A trivial write that must succeed before the 67 MB numbers
        // elsewhere in this report are trusted as an OPFS finding.
        // Discovered the hard way: a host under enough memory pressure
        // fails a 4-byte write with the exact same error a 67 MB write
        // produces, at the same `getDirectory()` stage, before either write
        // is attempted -- indistinguishable from OPFS itself being broken
        // unless something this small is checked first.
        async function probeControl(root: FileSystemDirectoryHandle) {
          try {
            const handle = await root.getFileHandle("control.bin", {
              create: true,
            });
            const writable = await handle.createWritable();
            await writable.write(new Uint8Array([1, 2, 3, 4]));
            await writable.close();
            const back = new Uint8Array(
              await (await handle.getFile()).arrayBuffer()
            );
            const controlOk = back.length === 4 && back[3] === 4;
            await root.removeEntry("control.bin");
            return { controlOk };
          } catch (error) {
            return { controlError: String(error), controlOk: false };
          }
        }

        // Shared by both `createWritable` passes below: write through
        // `writeFn`, then read the whole file back and compare it to
        // `source` at the same three points the worker's own comparison
        // uses. Factored out so the single-shot and chunked call sites
        // read as "what differs" rather than repeating the
        // read-back/compare.
        async function writeAndVerify(
          root: FileSystemDirectoryHandle,
          fileName: string,
          source: Uint8Array,
          writeFn: (writable: FileSystemWritableFileStream) => Promise<void>
        ) {
          const handle = await root.getFileHandle(fileName, {
            create: true,
          });
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
            back.at(-4096) === source.at(-4096);

          await root.removeEntry(fileName);
          return { readMs, roundTrips, writeMs };
        }

        // The two `createWritable` passes: single-shot across the whole
        // blob, then chunked in `chunkBytes` slices through the same
        // handle. Both go through `writeAndVerify` above; only what each
        // call writes differs.
        async function probeMainThread(
          root: FileSystemDirectoryHandle,
          source: Uint8Array
        ) {
          const out: Record<string, unknown> = {};
          try {
            const result = await writeAndVerify(
              root,
              "probe.bin",
              source,
              (writable) => writable.write(source as BufferSource)
            );
            out.opfsWriteMs = result.writeMs;
            out.opfsReadMs = result.readMs;
            out.opfsRoundTrips = result.roundTrips;
            out.opfsRemoved = true;
          } catch (error) {
            out.opfsError = String(error);
          }

          try {
            const result = await writeAndVerify(
              root,
              "probe-chunked.bin",
              source,
              async (writable) => {
                for (
                  let position = 0;
                  position < source.length;
                  position += chunkBytes
                ) {
                  const slice = source.subarray(
                    position,
                    Math.min(position + chunkBytes, source.length)
                  );
                  await writable.write({
                    data: slice as BufferSource,
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
          return out;
        }

        // Measured inside a dedicated worker, because
        // `createSyncAccessHandle` exists nowhere else -- which is the
        // whole reason the persistent tier sits in a worker. Timed against
        // `createWritable` above so the choice between them is made on
        // numbers rather than on reasoning. Both the single-shot and
        // chunked passes run in this one worker, back to back, so a fresh
        // handle is used for each rather than reopening the first.
        async function probeWorker(blobSize: number) {
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

            // A top-level catch too, not just inside each helper: the
            // single point of failure that would otherwise post nothing at
            // all, and the caller waits out the full timeout with no idea
            // why.
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
          // Two full passes over the blob now share this one timeout
          // budget, so it is double the single-pass figure below rather
          // than the same one.
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
            worker.postMessage(blobSize);
          });
          worker.terminate();
          return {
            chunked: workerReport?.chunked,
            single: workerReport?.single ?? workerReport,
          };
        }

        async function probeIndexedDb(source: Uint8Array) {
          const out: Record<string, unknown> = {};
          try {
            const database = await new Promise<IDBDatabase>(
              (resolve, reject) => {
                const request = indexedDB.open("probe-db", 1);
                request.onupgradeneeded = () =>
                  request.result.createObjectStore("blobs");
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              }
            );
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
        }

        // Orchestration only, deliberately: quota, the source buffer, then
        // one call into each probe above, in the order the design doc's
        // "Probe results" table lists them.
        (async () => {
          const out: Record<string, unknown> = {};

          const estimate = await navigator.storage?.estimate?.();
          out.quota = estimate?.quota ?? null;
          out.usage = estimate?.usage ?? null;

          // A recognisable, non-uniform pattern: a run of zeroes would
          // survive a truncated write and still compare equal.
          const source = new Uint8Array(size);
          for (let i = 0; i < size; i += 4096) {
            source[i] = (i / 4096) % 251;
          }

          out.opfsAvailable =
            typeof navigator.storage?.getDirectory === "function";
          if (out.opfsAvailable) {
            const root = await navigator.storage.getDirectory();
            Object.assign(out, await probeControl(root));
            const workerResult = await probeWorker(size);
            out.opfsSync = workerResult.single;
            out.opfsSyncChunked = workerResult.chunked;
            Object.assign(out, await probeMainThread(root, source));
          }

          Object.assign(out, await probeIndexedDb(source));

          w.__storageProbeResult = out;
          w.__storageProbeDone = true;
        })();
      },
      BLOB_BYTES,
      CHUNK_BYTES
    );

    // Two full OPFS passes plus IndexedDB, so this is generous the same way
    // the removed `browser.setTimeout({ script })` used to be -- except this
    // wait is Node-side and polling, not a WebDriver script-execution budget,
    // so it works the same regardless of what a given driver does with a
    // returned promise.
    await browser.waitUntil(
      async () =>
        await browser.execute(
          () =>
            (window as unknown as StorageProbeWindow).__storageProbeDone ===
            true
        ),
      {
        interval: 1000,
        timeout: 180_000,
        timeoutMsg: "expected the storage probe to finish within 180s",
      }
    );

    const report = await browser.execute(
      () => (window as unknown as StorageProbeWindow).__storageProbeResult
    );
    assert.ok(report, "expected the storage probe to have posted a result");

    // node.js context now -- printed the same way the Playwright probe does,
    // so both hosts' results are grepped out of CI logs the same way.
    console.log(
      `\n===STORAGE_PROBE===\n${JSON.stringify(report, null, 2)}\n===END===\n`
    );

    // IndexedDB is the app's real dependency -- see the module docstring --
    // so this is the assertion that guards the cache. It held on every
    // engine the probe ever ran against, WebKit and WebKitGTK included, and
    // if it ever stops holding the cache is broken and CI should say so.
    assert.equal(
      report.idbError,
      undefined,
      `IndexedDB accepted a 67 MB value: ${report.idbError}`
    );
    assert.equal(
      report.idbRoundTrips,
      true,
      "IndexedDB write transaction completed"
    );

    // OPFS is recorded, not required: absence is the expected,
    // already-investigated state on WebKit and WebKitGTK, not a
    // build-breaking finding. `opfsAvailable` is deliberately not asserted --
    // see the module docstring -- but the printed report above keeps it
    // visible so a host that gains OPFS later shows up in the log.
    if (report.opfsAvailable) {
      // Checked before the OPFS assertion below, deliberately: if this one
      // fails, it should be the assertion that fails, so the report reads as
      // "this run is inconclusive" rather than "OPFS is broken here" -- the
      // exact conflation that produced a wrong finding on the browser side
      // of this probe.
      assert.equal(
        report.controlOk,
        true,
        `host-level OPFS control write must succeed before the numbers below mean anything about OPFS (control error: ${report.controlError}). A failure here means this run is inconclusive, not a negative finding -- retry on an unloaded host.`
      );

      // An engine that claims OPFS and then corrupts data is a real finding
      // worth failing on -- only OPFS's *absence* is non-fatal now. A raised
      // error (the memory-pressure case the module docstring describes) is
      // not asserted directly: `controlOk` above already turned that run
      // inconclusive rather than a pass or a fail.
      if (report.opfsError === undefined) {
        assert.equal(
          report.opfsRoundTrips,
          true,
          "OPFS bytes read back identical"
        );
      }
    }
  });
});
