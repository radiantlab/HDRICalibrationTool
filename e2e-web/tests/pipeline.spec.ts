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
  applyPreset,
  collectDownloads,
  configureRun,
  generate,
  loadJpegBracket,
  readDownload,
  savePreset,
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

/**
 * The reported sequence, start to finish: save a preset, generate, look at the
 * picture, come back, reapply the preset, generate again.
 *
 * The second run used to be impossible. Staging handed the worker the session
 * filesystem's own arrays and transferred them, and a transfer moves a buffer
 * rather than copying it, so the first run left every input reading as zero
 * bytes. Pressing Generate again threw `DataCloneError: An ArrayBuffer is
 * detached and could not be cloned` before the worker started, and the progress
 * dialog sat on "Processing set 1 of 1". Reapplying the preset also warned that
 * its calibration files had changed on disk, because the sources it hashes had
 * been emptied by the same transfer.
 *
 * Only a real browser can catch this. `postMessage` is where the detachment
 * happens, and a test double can imitate the move but not the message.
 *
 * The trip through the viewer is navigated rather than loaded. A browser's
 * session filesystem lives in the page, so `goto` would drop the very files
 * the second run has to find, and the bug would vanish with them.
 */
test("generates a second time after the preset is reapplied", async ({
  page,
}) => {
  // Two full runs in one test, and the default budget covers about one.
  test.setTimeout(RUN_TIMEOUT * 2);

  await page.goto("/home-page");
  await loadJpegBracket(page);
  await configureRun(page);

  const downloads = collectDownloads(page);

  await savePreset(page, "Bracket");
  await generate(page);
  await expect.poll(() => downloads.length, { timeout: RUN_TIMEOUT }).toBe(2);

  // The progress dialog stays up until it is closed, and while it is open the
  // rest of the page is inert.
  const progress = page.getByRole("dialog");
  await progress.getByRole("button", { name: "Close" }).click();
  await expect(progress).toBeHidden();

  await page.locator("nav").getByRole("link", { name: "Image Viewer" }).click();
  await expect(page).toHaveURL(/image-viewer/);
  await page
    .locator("nav")
    .getByRole("link", { name: "Image Generator" })
    .click();
  await expect(page).toHaveURL(/home-page/);

  await applyPreset(page, "Bracket");

  // Nothing has touched the calibration files, so nothing should say they have
  // changed. Soft, because this is the first of the two symptoms and aborting
  // here would leave the second one -- the run that could not start -- untested
  // in exactly the case that matters, the one where both are back.
  await expect.soft(page.getByText(/changed on disk/)).toHaveCount(0);

  await generate(page);
  await expect.poll(() => downloads.length, { timeout: RUN_TIMEOUT }).toBe(4);

  // A second run that produced two more files but wrote nothing into them
  // would satisfy the count and none of the point.
  for (const download of downloads.slice(2)) {
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
