/**
 * Benchmarks the web build against itself, served from two places.
 *
 * This exists because "the deployed site feels slower than the local build" is
 * not a question inspection can answer. The deployed static export and `../out`
 * are the same bytes, so any difference has to be delivery -- and the only way
 * to size delivery against compute is to run the same bracket through both and
 * measure. It is not part of the suite: it asserts almost nothing and reports
 * numbers instead, so it belongs on its own config and its own command.
 *
 * Run it through `perf.config.ts`, once per target:
 *
 *   npm --prefix e2e-web run bench                    # local, JPEG
 *   MODE=cr2 npm --prefix e2e-web run bench           # local, RAW import
 *   TARGET_URL=https://example.com npm --prefix e2e-web run bench
 *
 * Requests are counted through `page.on(...)` rather than the page's own
 * Resource Timing, because the pipeline and RAW converters fetch their `.wasm`
 * from inside a Worker and a worker's entries never land on the page's
 * performance timeline. The browser's network stack sees all of them.
 *
 * Reported timings are only comparable between targets measured the same way.
 * In particular, an agent sandbox or corporate proxy inflates every remote
 * fetch while leaving `127.0.0.1` untouched, which fakes exactly the result
 * this benchmark exists to test for. Check `HTTP_PROXY`/`HTTPS_PROXY` are unset
 * before believing a deployed number.
 */

import { expect, test } from "@playwright/test";
import {
  configureRun,
  cr2Files,
  generate,
  jpegFiles,
  loadCr2Frames,
  loadJpegBracket,
} from "./support";

const TARGET = process.env.TARGET_URL ?? "http://127.0.0.1:4321";
/** "jpeg" measures a full generate; "cr2" measures RAW import to thumbnails. */
const MODE = process.env.MODE === "cr2" ? "cr2" : "jpeg";
/** RAW frames to import. Fewer is faster; the default is the whole bracket. */
const FRAMES = Number(process.env.FRAMES ?? cr2Files.length);
const RUN_TIMEOUT = 280_000;

interface Req {
  bytes: number;
  ms: number;
  startedAt: number;
  status: number;
  url: string;
}

test(`${MODE} against ${TARGET}`, async ({ page }) => {
  // A benchmark that measured an empty fixture directory would report a very
  // fast run rather than a failure, so the inputs are checked before anything
  // is timed.
  expect(jpegFiles.length, "JPEG fixtures").toBeGreaterThan(0);
  expect(cr2Files.length, "CR2 fixtures").toBeGreaterThan(0);
  expect(FRAMES, "FRAMES").toBeGreaterThan(0);

  const requests: Req[] = [];
  const t0 = Date.now();

  page.on("requestfinished", async (request) => {
    const timing = request.timing();
    let status = 0;
    let bytes = 0;
    try {
      const response = await request.response();
      if (response) {
        status = response.status();
        bytes = (await response.request().sizes()).responseBodySize;
      }
    } catch {
      // A request torn down with the page; not interesting for timings.
    }
    requests.push({
      bytes,
      ms: timing.responseEnd - timing.requestStart,
      startedAt: Date.now() - t0,
      status,
      url: request.url(),
    });
  });

  // --- Cold load -----------------------------------------------------------
  const coldStart = Date.now();
  await page.goto(`${TARGET}/pipeline`, { waitUntil: "load" });
  const coldLoadMs = Date.now() - coldStart;

  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming;
    const paints = performance.getEntriesByType("paint");
    return {
      domContentLoaded: Math.round(
        entry.domContentLoadedEventEnd - entry.startTime
      ),
      firstContentfulPaint: Math.round(
        paints.find((p) => p.name === "first-contentful-paint")?.startTime ?? -1
      ),
      loadEvent: Math.round(entry.loadEventEnd - entry.startTime),
      ttfb: Math.round(entry.responseStart - entry.startTime),
    };
  });

  // --- Warm load (same context, so the HTTP cache is populated) ------------
  const warmStart = Date.now();
  await page.reload({ waitUntil: "load" });
  const warmLoadMs = Date.now() - warmStart;

  const requestsBeforeRun = requests.length;

  // --- The work itself -----------------------------------------------------
  let runMs: number;
  let runLabel: string;
  let secondImportMs: number | undefined;

  if (MODE === "cr2") {
    // The completion signal is the `<canvas>` each thumbnail appends once it
    // has converted *and* decoded, NOT the container div. `TiffImage` fires
    // `rawToTiff` from a `useMemo` and Suspends only the inner pixel view, so
    // the divs `loadCr2Frames` waits for mount in about 150 ms -- long before
    // any demosaic finishes. Counting them measured nothing at all: an earlier
    // draft of this file reported a 269 ms import of ten 21.7 MB frames with
    // zero `/wasm/` requests, because it exited before conversion had begun.
    // See the module docstring on `pipeline.spec.ts`, which documents the same
    // trap for the responsiveness test.
    const runStart = Date.now();
    await loadCr2Frames(page, FRAMES);
    await expect(
      page.locator(
        '[data-testid="image-set-preview"] .generic-image-container canvas'
      )
    ).toHaveCount(FRAMES, { timeout: RUN_TIMEOUT });
    runMs = Date.now() - runStart;
    runLabel = `import ${FRAMES} RAW frames to thumbnails`;

    // The point of #243, measured rather than asserted: reload, re-import the
    // same frames, and the conversion should not happen again. Same files, so
    // the content hash matches; a reload discards the JS realm, so
    // raw-preview.ts's module-level session cache and the RAW worker both
    // start fresh -- leaving the persistent tier as the only possible source
    // of a saving.
    await page.reload({ waitUntil: "load" });
    const secondStart = Date.now();
    await loadCr2Frames(page, FRAMES);
    await expect(
      page.locator(
        '[data-testid="image-set-preview"] .generic-image-container canvas'
      )
    ).toHaveCount(FRAMES, { timeout: RUN_TIMEOUT });
    secondImportMs = Date.now() - secondStart;
  } else {
    await loadJpegBracket(page);
    await configureRun(page);

    const downloads: string[] = [];
    page.on("download", (d) => downloads.push(d.suggestedFilename()));

    const runStart = Date.now();
    await generate(page);
    await expect.poll(() => downloads.length, { timeout: RUN_TIMEOUT }).toBe(2);
    runMs = Date.now() - runStart;
    runLabel = `generate from ${jpegFiles.length} JPEG frames`;
  }

  // --- Report --------------------------------------------------------------
  const wasmRequests = requests.filter((r) => r.url.includes("/wasm/"));
  const sum = (list: Req[], pick: (r: Req) => number) =>
    list.reduce((total, r) => total + pick(r), 0);

  const report = {
    coldLoadMs,
    mode: MODE,
    nav,
    requests: {
      duringRun: requests.length - requestsBeforeRun,
      total: requests.length,
      totalBytes: sum(requests, (r) => r.bytes),
      wasm: wasmRequests.length,
      wasmBytes: sum(wasmRequests, (r) => r.bytes),
      wasmTotalMs: Math.round(sum(wasmRequests, (r) => r.ms)),
    },
    runMs,
    secondImportMs,
    slowestRequests: [...requests]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 15)
      .map((r) => ({
        kb: Math.round(r.bytes / 1024),
        ms: Math.round(r.ms),
        url: r.url.replace(TARGET, ""),
      })),
    target: TARGET,
    warmLoadMs,
    // One line per tool load. More than one entry per tool would mean the
    // compiled-module cache in `wasm-runner.ts` is not holding.
    wasmRequestDetail: wasmRequests.map((r) => ({
      at: r.startedAt,
      kb: Math.round(r.bytes / 1024),
      ms: Math.round(r.ms),
      url: r.url.split("/").pop(),
    })),
    work: runLabel,
  };

  process.stdout.write(
    `\n===PERF_JSON===\n${JSON.stringify(report, null, 2)}\n===END===\n`
  );
});
