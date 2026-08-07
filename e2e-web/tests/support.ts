/**
 * Shared fixtures and the two browser-specific seams the specs are built on.
 *
 * Input fixtures are read from the repository's `example/` directory rather
 * than copied. That directory is also what the README sends users to, so the
 * sample data people are told to look at is the sample data three test suites
 * exercise, and it cannot quietly stop working. Copying it per suite is how
 * two copies of `fisheye_corr.cal` ended up disagreeing about what to do
 * outside the lens circle, with the wrong one shipped as the example.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Download, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const inputsDirectory = fileURLToPath(
  new URL("../../example", import.meta.url)
);

export const jpegDirectory = path.join(inputsDirectory, "JPEG");

export const jpegFiles = readdirSync(jpegDirectory)
  .filter((name) =>
    [".jpg", ".jpeg"].includes(path.extname(name).toLowerCase())
  )
  .toSorted()
  .map((name) => path.join(jpegDirectory, name));

export const cr2Directory = path.join(inputsDirectory, "CR2");

export const cr2Files = readdirSync(cr2Directory)
  .filter((name) => path.extname(name).toLowerCase() === ".cr2")
  .toSorted()
  .map((name) => path.join(cr2Directory, name));

export const responseFunction = path.join(
  inputsDirectory,
  "response_function_files",
  "Response_function.rsp"
);

export const calibrationFiles = {
  calibrationFactor: path.join(
    inputsDirectory,
    "calibration_files",
    "CF_f8.cal"
  ),
  fisheye: path.join(inputsDirectory, "calibration_files", "fisheye_corr.cal"),
  neutralDensity: path.join(
    inputsDirectory,
    "calibration_files",
    "NDfilter_no_transform.cal"
  ),
  vignetting: path.join(
    inputsDirectory,
    "calibration_files",
    "vignetting_f8.cal"
  ),
};

export interface LensMask {
  radius: number;
  x: number;
  y: number;
}

/**
 * Reads the lens geometry the fixture records, converting the origin.
 *
 * The fixture states `ydown` from the bottom-left, which is Radiance's
 * convention. The mask overlay measures from the top-left. Converting here
 * rather than hardcoding the result keeps the fixture the single source of
 * truth, the same way the desktop suite does it.
 */
export function readLensMask(): LensMask {
  const raw = readFileSync(
    path.join(jpegDirectory, "ImageLensInformation.txt"),
    "utf8"
  );
  const value = (label: string): number => {
    const match = raw.match(new RegExp(`${label} <- (\\d+)`));
    if (!match?.[1]) {
      throw new Error(`expected "${label}" in ImageLensInformation.txt`);
    }
    return Number.parseInt(match[1], 10);
  };

  const origin = raw.match(/origin <- (bottom-left|top-left)/)?.[1];
  if (!origin) {
    throw new Error('expected "origin <- bottom-left" or "top-left"');
  }

  const diameter = value("diameter");
  const radius = diameter / 2;
  const ydown = value("ydown");

  return {
    radius,
    x: value("xleft") + radius,
    y:
      origin === "bottom-left"
        ? value("yres") - (ydown + radius)
        : ydown + radius,
  };
}

/**
 * Runs `trigger` and answers the file dialog it opens.
 *
 * This is *the* browser seam. `src/lib/host/pick.ts` builds an
 * `<input type=file>`, appends it, clicks it and throws it away, so there is
 * no element for `setInputFiles` to target -- the input does not exist before
 * the click and is gone after it. Playwright's `filechooser` event intercepts
 * the dialog itself, which is the only handle on a picker opened that way.
 *
 * The listener is attached before the click rather than after, because the
 * event fires synchronously with it and a late listener misses it entirely.
 */
export async function choose(
  page: Page,
  trigger: () => Promise<void>,
  files: string[]
): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    trigger(),
  ]);
  await chooser.setFiles(files);
}

/**
 * The "Select…" button belonging to a named file field.
 *
 * Scoped through the field wrapper rather than by position. The text input is
 * wrapped in its own div, so it has no sibling button at all -- a
 * `following-sibling::button` locator matches nothing and hangs, and a
 * `following::button` one would silently walk into the next field if this one
 * ever lost its button. `[data-slot="field"]` is the component's own boundary,
 * so it says what it means. `.last()` takes the innermost, in case fields nest.
 */
export function browseButtonFor(page: Page, fieldName: string) {
  return page
    .locator('[data-slot="field"]')
    .filter({ has: page.locator(`input[name="${fieldName}"]`) })
    .last()
    .getByRole("button", { name: "Select…" });
}

/** Fills a file field by opening its picker, as a user would. */
export async function chooseInto(
  page: Page,
  fieldName: string,
  file: string
): Promise<void> {
  await openSectionFor(page, fieldName);
  await choose(page, () => browseButtonFor(page, fieldName).click(), [file]);
  // The field holds a synthetic `/session/...` path in a browser, so the
  // assertion is that *something* landed, not that a real path did.
  await expect(page.locator(`input[name="${fieldName}"]`)).not.toHaveValue("");
}

/** Loads the JPEG bracket through the dropzone's picker and waits for previews. */
export async function loadJpegBracket(page: Page): Promise<void> {
  await choose(
    page,
    () => page.locator("#image-matrix-input").click(),
    jpegFiles
  );
  await expect(
    page.locator('[data-testid="image-set-preview"] .generic-image-container')
  ).toHaveCount(jpegFiles.length, { timeout: 30_000 });
}

/**
 * Loads the first `count` frames of the CR2 bracket and waits for thumbnails.
 *
 * A subset rather than all ten. Each frame is 21.7 MB and takes about 1.9 s to
 * demosaic, so the full bracket is ~290 MB and ~19 s -- more than this test
 * needs to say what it is asserting. Three frames is ~6 s of conversion, which
 * a main-thread implementation cannot hide from a 100 ms heartbeat.
 */
export async function loadCr2Frames(page: Page, count: number): Promise<void> {
  const frames = cr2Files.slice(0, count);
  await choose(page, () => page.locator("#image-matrix-input").click(), frames);
  await expect(
    page.locator('[data-testid="image-set-preview"] .generic-image-container')
  ).toHaveCount(frames.length, { timeout: 180_000 });
}

/**
 * Opens the accordion section a field lives in, if it is closed.
 *
 * Two things make this necessary rather than incidental. Radix keeps a
 * collapsed section's content **mounted**, so the field has a bounding box and
 * reads as present in the DOM while its own header paints over the top of it:
 * the picker is not hidden, it is covered, and clicking it waits forever on an
 * element that will never receive the pointer. And the accordion is
 * `type="single"`, so there is no "expand everything" state to arrange -- a
 * loop that tried would open one section, close the last, and oscillate.
 *
 * Found by walking the structure -- the field's `role="region"` content, then
 * up to the item that owns it, then the trigger inside -- rather than by
 * section title, so renaming a heading cannot silently break this. Note that
 * this Radix build does *not* put `aria-controls` on the trigger; it wires the
 * pair the other way, with `aria-labelledby` on the content, so a locator
 * built on `aria-controls` matches nothing at all.
 */
async function openSectionFor(page: Page, fieldName: string): Promise<void> {
  const region = page
    .locator('[role="region"]')
    .filter({ has: page.locator(`[name="${fieldName}"]`) })
    .last();

  if ((await region.count()) === 0) {
    // Not inside an accordion at all, so there is nothing to open.
    return;
  }

  // The trigger precedes the content inside the item, so the first
  // `aria-expanded` button under the item is the one that opens this section.
  const trigger = region
    .locator("xpath=..")
    .locator("button[aria-expanded]")
    .first();
  if ((await trigger.getAttribute("aria-expanded")) === "false") {
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  }
}

/**
 * Starts collecting downloads, returning the growing list.
 *
 * A persistent listener rather than `waitForEvent`, because two concurrent
 * `waitForEvent("download")` calls are two independent one-shot listeners on
 * one event, not a queue: both resolve on the *same* first download, and the
 * pair reads as one file delivered twice. Attach before the run starts, since
 * a download that lands before the listener does is simply lost.
 */
export function collectDownloads(page: Page): Download[] {
  const downloads: Download[] = [];
  page.on("download", (download) => downloads.push(download));
  return downloads;
}

/** Reads a completed download fully into memory. */
export async function readDownload(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * The header of a Radiance picture: everything before the first blank line.
 *
 * A picture is an ASCII header, a blank line, a resolution line, then binary
 * pixels, so this decodes only the part that is text. Worth keeping separate
 * from the pixels: a finished picture runs to tens of megabytes.
 */
export function radianceHeader(bytes: Buffer): string {
  const end = bytes.indexOf("\n\n");
  return (
    end === -1 ? bytes.subarray(0, 8192) : bytes.subarray(0, end)
  ).toString("latin1");
}

/**
 * Absolute paths named anywhere in a header.
 *
 * Every Radiance tool appends its own command line to the header of what it
 * writes, so a path handed to a tool is a path published in the picture. That
 * is #241: on the desktop the calibration file arrived as an absolute path
 * from the native dialog, and one reported case named a directory containing
 * the user's email address.
 *
 * Tokenised on whitespace, which is how an argv is echoed. A path containing
 * spaces is quoted and therefore splits, but its leading fragment still starts
 * with a slash, so it is still caught -- which is what matters, since this
 * exists to fail rather than to parse.
 */
export function absolutePathsIn(header: string): string[] {
  return header
    .split(/\s+/)
    .map((token) => token.replace(/^["']+/, ""))
    .filter((token) => token.startsWith("/"));
}

/**
 * `VIEW=` lines Radiance still honours.
 *
 * A tool that copies an inherited header indents it a tab deeper and prefixes
 * it with the file it came from, and an indented line is deactivated rather
 * than removed. hdrgen writes its own `VIEW=` from EXIF, so a finished picture
 * contains that one, deactivated, plus the one the pipeline wrote with
 * `getinfo -a`. Only a line at column 0 counts, and there must be exactly one:
 * Radiance resolves the last active one, so two would be ambiguous.
 */
export function activeViewLines(header: string): string[] {
  return header.split("\n").filter((line) => line.startsWith("VIEW="));
}

/**
 * Presses Generate and clicks through the confirmation if one appears.
 *
 * The confirmation only fires when something is missing, so a fully configured
 * run should not see it. Handling it anyway keeps a change to that dialog's
 * wording from failing the run itself.
 */
export async function generate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Generate HDR Image" }).click();
  const confirm = page.getByRole("button", { name: /Generate (anyway|all)/ });
  if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirm.click();
  }
}

/**
 * Saves the current configuration as a named preset.
 *
 * The dialog's own Save button is taken from inside the dialog, because the
 * preset bar behind it has one under the same name and an unscoped locator
 * matches both.
 */
export async function savePreset(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { exact: true, name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

/** Reapplies a saved preset through the preset bar. */
export async function applyPreset(page: Page, name: string): Promise<void> {
  const trigger = page
    .getByRole("combobox")
    .filter({ hasText: "No preset selected" });
  await trigger.click();
  await page.getByRole("option", { name }).click();
  await expect(trigger).toHaveCount(0);
}

/** Fills every calibration field and the lens mask, ready to generate. */
export async function configureRun(page: Page): Promise<void> {
  // The mask fields only render once a preview is chosen: `LensMaskInput`
  // shows "No image selected" until then, so they do not exist in the DOM yet.
  await page
    .locator('[data-testid="image-set-preview"] .generic-image-container')
    .first()
    .click();

  await chooseInto(page, "cameraResponseLocation", responseFunction);
  await chooseInto(page, "correctionFiles.fisheye", calibrationFiles.fisheye);
  await chooseInto(
    page,
    "correctionFiles.vignetting",
    calibrationFiles.vignetting
  );
  await chooseInto(
    page,
    "correctionFiles.neutralDensity",
    calibrationFiles.neutralDensity
  );
  await chooseInto(
    page,
    "correctionFiles.calibrationFactor",
    calibrationFiles.calibrationFactor
  );

  const mask = readLensMask();
  await openSectionFor(page, "lensMask.radius");
  await page.locator('input[name="lensMask.radius"]').fill(String(mask.radius));
  await page.locator('input[name="lensMask.x"]').fill(String(mask.x));
  await page.locator('input[name="lensMask.y"]').fill(String(mask.y));
}
