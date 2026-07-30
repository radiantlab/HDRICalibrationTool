import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { $, browser } from "@wdio/globals";
import { describe, it } from "mocha";

const E2E_DROP_EVENT = "__hdricalibrationtool_e2e_drop__";
const jpegInputDirectory = fileURLToPath(
  new URL("../inputs/JPEG", import.meta.url)
);
const responseFunctionPath = fileURLToPath(
  new URL(
    "../inputs/response_function_files/Response_function.rsp",
    import.meta.url
  )
);
const fisheyeCorrectionPath = fileURLToPath(
  new URL("../inputs/calibration_files/fisheye_corr.cal", import.meta.url)
);
const vignettingCorrectionPath = fileURLToPath(
  new URL("../inputs/calibration_files/vignetting_f8.cal", import.meta.url)
);
const neutralDensityCorrectionPath = fileURLToPath(
  new URL(
    "../inputs/calibration_files/NDfilter_no_transform.cal",
    import.meta.url
  )
);
const calibrationFactorPath = fileURLToPath(
  new URL("../inputs/calibration_files/CF_f8.cal", import.meta.url)
);
const lensInformationPath = fileURLToPath(
  new URL("../inputs/JPEG/ImageLensInformation.txt", import.meta.url)
);
// No tool paths. CI used to download Radiance and hdrgen from their GitHub
// releases and point E2E_RADIANCE_PATH / E2E_HDRGEN_PATH at the extracted bin
// directories, which is why the "generates an HDR image" case could never run
// reliably. Both tools are WebAssembly shipped in the repository now, so the
// download, the env vars and the fallback are all gone and the case runs
// unconditionally with nothing installed.
const expectedJpegFileCount = readdirSync(jpegInputDirectory).filter(
  (fileName) => [".jpg", ".jpeg"].includes(path.extname(fileName).toLowerCase())
).length;
const tempOutputDirectory = mkdtempSync(
  path.join(os.tmpdir(), "hdricalibrationtool-e2e-")
);
assert.deepEqual(
  readdirSync(tempOutputDirectory),
  [],
  `expected fresh temp output directory to start empty: ${tempOutputDirectory}`
);

const ORIGIN_REGEX = /origin <- (bottom-left|top-left)/;

function readLensInformation(lensInfoPath: string) {
  const raw = readFileSync(lensInfoPath, "utf8");
  const parseRequiredNumber = (label: string) => {
    const match = raw.match(new RegExp(`${label} <- (\\d+)`));
    assert.ok(match?.[1], `expected ${label} in ${lensInfoPath}`);
    return Number.parseInt(match[1], 10);
  };

  const originMatch = raw.match(ORIGIN_REGEX);
  assert.ok(
    originMatch,
    `expected "origin <- bottom-left" or "origin <- top-left" in ${lensInfoPath}`
  );
  const [, origin] = originMatch;

  const diameter = parseRequiredNumber("diameter");
  const xleft = parseRequiredNumber("xleft");
  const ydown = parseRequiredNumber("ydown");
  const yres = parseRequiredNumber("yres");
  const radius = diameter / 2;

  // The lens-mask overlay works from the top-left of the image. Fixtures
  // written in Radiance's bottom-left convention are flipped here.
  const y = origin === "bottom-left" ? yres - (ydown + radius) : ydown + radius;

  return {
    diameter,
    radius,
    x: xleft + radius,
    y,
  };
}

const lensInformation = readLensInformation(lensInformationPath);

// The fixture records ydown in Radiance's bottom-left origin; the lens-mask
// overlay works from the top-left. Restating the conversion independently here
// pins that readLensInformation honours the declared origin rather than passing
// the number through. For the JPEG fixture: 3744 - (74 + 1806) = 1864.
{
  const fixture = readFileSync(lensInformationPath, "utf8");
  const value = (label: string) =>
    Number(fixture.match(new RegExp(`${label} <- (\\d+)`))?.[1]);
  assert.equal(
    lensInformation.y,
    value("yres") - (value("ydown") + value("diameter") / 2),
    "expected the mask centre to be converted from the fixture's declared origin"
  );
}

async function selectFirstPreviewImage() {
  await browser.execute(() => {
    const container = document.querySelector<HTMLElement>(
      '[data-testid="image-set-preview"] .generic-image-container'
    );
    if (!container) {
      throw new Error("expected at least one preview image to select");
    }
    container.click();
  });
}

async function dispatchDrop(targetId: string, paths: string[]) {
  await browser.execute(
    (eventName, detail) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    },
    E2E_DROP_EVENT,
    {
      paths,
      targetId,
    }
  );
}

async function setTextInputValue(selector: string, value: string) {
  await browser.waitUntil(
    async () =>
      await browser.execute(
        (inputSelector) => Boolean(document.querySelector(inputSelector)),
        selector
      ),
    {
      timeout: 10_000,
      timeoutMsg: `expected input to exist: ${selector}`,
    }
  );
  await browser.execute(
    (inputSelector, nextValue) => {
      const element = document.querySelector<HTMLInputElement>(inputSelector);
      if (!element) {
        throw new Error(`Could not find input: ${inputSelector}`);
      }
      element.focus();
      element.value = nextValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.blur();
    },
    selector,
    value
  );
}

async function setPersistedSettings(nextSettings: { outputPath?: string }) {
  await browser.execute((settingsPatch) => {
    const storageKey = "hdr-settings";
    const fallback = {
      state: {
        settings: {
          osPlatform: "",
          outputPath: "",
        },
      },
      version: 0,
    };
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : fallback;
    const state = parsed.state ?? fallback.state;
    const settings = state.settings ?? fallback.state.settings;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...parsed,
        state: {
          ...state,
          settings: {
            ...settings,
            ...settingsPatch,
          },
        },
      })
    );
  }, nextSettings);
}

async function waitForPreviewImages() {
  await browser.waitUntil(
    async () => {
      const previewCount = await browser.execute(
        () =>
          document.querySelectorAll('[data-testid="image-set-preview"]').length
      );
      if (previewCount !== 1) {
        return false;
      }

      const previewImageCount = await browser.execute(
        () =>
          document.querySelectorAll(
            '[data-testid="image-set-preview"] .generic-image-container'
          ).length
      );
      return previewImageCount === expectedJpegFileCount;
    },
    {
      timeout: 10_000,
      timeoutMsg: `expected exactly ${expectedJpegFileCount} JPEG previews to render`,
    }
  );
}

/**
 * What the webview believes about itself and about the run in progress.
 *
 * The desktop and browser builds are the same code, told apart at runtime by
 * `isTauri()`. If that answers wrong under WebDriver, output is *downloaded*
 * rather than written to the chosen folder, and the only symptom is an empty
 * output directory -- identical to a pipeline that never ran. Worth reporting
 * the two apart.
 */
async function readPipelineState(): Promise<string> {
  return await browser.execute(() => {
    const tauri = "__TAURI_INTERNALS__" in window;
    const workers = typeof Worker !== "undefined";
    // `innerText` rather than a walk over `textContent`: it reports what is
    // rendered, so it excludes the `<style>` blocks that a textContent walk
    // drowns in and includes toast text, which is where a failed run says so.
    const shown = (document.body.innerText ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) =>
        /^\d\d:\d\d|merging|nullif|cropping|resizing|false colour|evalglare|complete|failed|error|could not|unable/i.test(
          line
        )
      )
      .slice(-8)
      .join(" || ");
    return `tauri=${tauri} workers=${workers} shown=${shown || "(nothing)"}`;
  });
}

function getPipelineFailureMessage(outputDir: string): string | null {
  const traceDir = path.join(outputDir, "pipeline-traces");
  if (!existsSync(traceDir)) {
    return null;
  }

  const traceFiles = readdirSync(traceDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const newestTraceFile = traceFiles.at(-1);
  if (!newestTraceFile) {
    return null;
  }

  const newestTracePath = path.join(traceDir, newestTraceFile);
  const traceContents = readFileSync(newestTracePath, "utf8");
  return `Pipeline trace detected at ${newestTracePath}\n${traceContents}`;
}

describe("HDRI Calibration Tool", () => {
  it("opens to the home page", async () => {
    await browser.waitUntil(
      async () => (await browser.getUrl()).endsWith("/home-page"),
      {
        timeout: 10_000,
        timeoutMsg: "expected the app to load to the home page",
      }
    );
  });

  it("accepts image file drops in the image input component", async () => {
    const imageInput = await $("#image-matrix-input");
    await imageInput.waitForDisplayed({ timeout: 5000 });

    await dispatchDrop("image-matrix-input", [jpegInputDirectory]);
    await waitForPreviewImages();
  });

  it("generates an HDR image", async () => {
    await setPersistedSettings({ outputPath: tempOutputDirectory });
    await browser.refresh();
    await browser.waitUntil(
      async () => (await browser.getUrl()).endsWith("/home-page"),
      {
        timeout: 10_000,
        timeoutMsg: "expected the app to return to the home page after refresh",
      }
    );

    const imageInput = await $("#image-matrix-input");
    await imageInput.waitForDisplayed({ timeout: 5000 });
    await dispatchDrop("image-matrix-input", [jpegInputDirectory]);
    await waitForPreviewImages();

    // The lens mask radius/x/y inputs only render once an image is selected
    // for the mask preview (LensMaskInput shows "No image selected"
    // otherwise), so a preview image must be clicked before those fields
    // exist in the DOM.
    await selectFirstPreviewImage();

    await setTextInputValue(
      'input[name="cameraResponseLocation"]',
      responseFunctionPath
    );
    await setTextInputValue(
      'input[name="correctionFiles.fisheye"]',
      fisheyeCorrectionPath
    );
    await setTextInputValue(
      'input[name="correctionFiles.vignetting"]',
      vignettingCorrectionPath
    );
    await setTextInputValue(
      'input[name="correctionFiles.neutralDensity"]',
      neutralDensityCorrectionPath
    );
    await setTextInputValue(
      'input[name="correctionFiles.calibrationFactor"]',
      calibrationFactorPath
    );
    await setTextInputValue(
      'input[name="lensMask.radius"]',
      lensInformation.radius.toString()
    );
    await setTextInputValue(
      'input[name="lensMask.x"]',
      lensInformation.x.toString()
    );
    await setTextInputValue(
      'input[name="lensMask.y"]',
      lensInformation.y.toString()
    );

    const generateHDRImageButton = await $(
      '//button[contains(normalize-space(.), "Generate HDR Image")]'
    );
    await generateHDRImageButton.waitForDisplayed({ timeout: 5000 });
    await browser.execute(() => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (element) => element.textContent?.includes("Generate HDR Image")
      );
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Could not find Generate HDR Image button");
      }
      button.click();
    });

    await browser.waitUntil(
      async () => {
        const failureMessage = getPipelineFailureMessage(tempOutputDirectory);
        if (failureMessage) {
          throw new Error(failureMessage);
        }

        // What the app itself says. Without this, a run that fails inside the
        // webview is indistinguishable from one that never started: the only
        // signal is an empty output directory, and the reason is on screen.
        console.log("[pipeline]", await readPipelineState());

        const outputFiles = readdirSync(tempOutputDirectory).filter(
          (fileName) => fileName.endsWith(".hdr")
        );
        return outputFiles.length >= 2;
      },
      {
        interval: 1000,
        timeout: 180_000,
        timeoutMsg: `expected HDR outputs to be written to ${tempOutputDirectory}`,
      }
    );

    const outputFiles = readdirSync(tempOutputDirectory).filter((fileName) =>
      fileName.endsWith(".hdr")
    );
    assert.ok(
      outputFiles.length >= 2,
      `expected at least 2 HDR output files in ${tempOutputDirectory}`
    );

    const hdrForViewer =
      outputFiles.find((fileName) => !fileName.endsWith("_fc.hdr")) ??
      outputFiles[0];
    assert.ok(hdrForViewer, "expected at least one HDR file for image viewer");

    await browser.url("http://tauri.localhost/image-viewer");
    await browser.waitUntil(
      async () => (await browser.getUrl()).endsWith("/image-viewer"),
      {
        timeout: 10_000,
        timeoutMsg: "expected the app to navigate to the image viewer page",
      }
    );

    const imageViewerInput = await $("#image-viewer-input");
    await imageViewerInput.waitForDisplayed({ timeout: 10_000 });
    const hdrFilePath = path.join(tempOutputDirectory, hdrForViewer);
    console.log("Dispatching drop for:", hdrFilePath);
    await dispatchDrop("image-viewer-input", [hdrFilePath]);

    await browser.waitUntil(
      async () => (await browser.getUrl()).includes("/image-viewer/view"),
      {
        timeout: 10_000,
        timeoutMsg: "expected the dropped HDR file to open in the image viewer",
      }
    );

    await browser.pause(30_000);
  });
});
