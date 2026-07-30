/**
 * The whole thing, in a browser, with nothing installed.
 *
 * This is the case the desktop suite cannot cover and the one the port exists
 * for: pick a bracket through a file dialog, run twelve WebAssembly stages in
 * a worker, and get two Radiance pictures out as downloads. No Radiance on the
 * runner, no hdrgen, no paths configured, no server.
 */

import { expect, test } from "@playwright/test";
import {
  collectDownloads,
  configureRun,
  loadJpegBracket,
  readDownload,
} from "./support";

/** Long enough for a cold WebAssembly compile plus the full stage sequence. */
const RUN_TIMEOUT = 280_000;

test("generates two HDR pictures from the JPEG bracket", async ({ page }) => {
  await page.goto("/home-page");
  await loadJpegBracket(page);
  await configureRun(page);

  // Attached before the click: a download that lands first would otherwise be
  // gone before anything was listening.
  const downloads = collectDownloads(page);

  await page.getByRole("button", { name: "Generate HDR Image" }).click();

  // The confirmation only appears when something is missing. Everything is
  // supplied here, so this should not fire -- but clicking through it if it
  // does keeps a wording change from failing the run itself.
  const confirm = page.getByRole("button", { name: /Generate (anyway|all)/ });
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirm.click();
  }

  await expect.poll(() => downloads.length, { timeout: RUN_TIMEOUT }).toBe(2);

  const names = downloads.map((download) => download.suggestedFilename());

  // One picture and one false-colour map, in whichever order they landed.
  expect(
    names.filter((name) => name.endsWith("_fc.hdr")),
    `expected one false-colour output among: ${names.join(", ")}`
  ).toHaveLength(1);
  expect(
    names.filter((name) => /(?<!_fc)\.hdr$/.test(name)),
    `expected one picture among: ${names.join(", ")}`
  ).toHaveLength(1);

  // Non-empty and actually a Radiance picture. A zero-byte download would
  // still satisfy the event, and a failed stage that wrote a stub would too.
  for (const download of downloads) {
    const bytes = await readDownload(download);
    expect(bytes.byteLength).toBeGreaterThan(1024);
    expect(bytes.subarray(0, 10).toString("latin1")).toContain("#?RADIANCE");
  }
});

test("the page stays responsive while the pipeline runs", async ({ page }) => {
  // The pipeline used to run inline on the main thread. `callMain` is
  // synchronous and blocks its thread for a whole tool, so the tab froze for
  // the length of an hdrgen merge -- no repaints, no clicks, and eventually
  // the browser's "page is not responding" prompt. It runs in a Web Worker
  // now, and this is what would notice if it ever moved back.
  await page.goto("/home-page");
  await loadJpegBracket(page);
  await configureRun(page);

  await page.evaluate(() => {
    const w = window as unknown as { __beats: number[] };
    w.__beats = [];
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      w.__beats.push(now - last);
      last = now;
    }, 100);
  });

  const downloads = collectDownloads(page);
  await page.getByRole("button", { name: "Generate HDR Image" }).click();
  await expect.poll(() => downloads.length, { timeout: RUN_TIMEOUT }).toBe(2);

  const { beats, worst } = await page.evaluate(() => {
    const w = window as unknown as { __beats: number[] };
    return { beats: w.__beats.length, worst: Math.max(...w.__beats) };
  });

  // A 100ms heartbeat, so anything under ~1s of gap is scheduler noise rather
  // than a blocked thread. A main-thread pipeline produced single gaps of tens
  // of seconds, so the margin here is enormous and the check is still sharp.
  expect(beats).toBeGreaterThan(20);
  expect(worst).toBeLessThan(1000);
});
