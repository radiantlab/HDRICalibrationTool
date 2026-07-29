import { describe, expect, it } from "@jest/globals";

/**
 * Preset calibration files are copied into the preset directory, and the
 * pipeline then reads them from there. A copy that lands short is invisible:
 * an empty `.cal` turns its correction into a no-op, so runs vary with no
 * visible cause while the preset still looks intact.
 *
 * That happened with calibration files kept on Google Drive, which copied as
 * zero bytes. These tests pin the two properties that stop it recurring.
 */

const sources = new Map<string, Uint8Array>();
const written = new Map<string, Uint8Array>();

jest.mock("@tauri-apps/api/path", () => ({
  appConfigDir: () => Promise.resolve("/cfg"),
  join: (...parts: string[]) => Promise.resolve(parts.join("/")),
}));

jest.mock("@tauri-apps/plugin-fs", () => ({
  exists: () => Promise.resolve(false),
  mkdir: () => Promise.resolve(),
  readFile: (path: string) => {
    const file = sources.get(path);
    if (!file) {
      return Promise.reject(new Error(`ENOENT ${path}`));
    }
    return Promise.resolve(file);
  },
  readTextFile: () => Promise.reject(new Error("not used")),
  remove: () => Promise.resolve(),
  writeFile: (path: string, data: Uint8Array) => {
    written.set(path, data);
    return Promise.resolve();
  },
  writeTextFile: () => Promise.resolve(),
}));

declare const jest: typeof import("@jest/globals").jest;

import type { pipelineConfig } from "../src/app/home-page/(pipeline-configuration)/config-provider";
import { savePreset } from "../src/lib/presets";

function config(overrides: Partial<pipelineConfig> = {}): pipelineConfig {
  return {
    cameraResponseLocation: null,
    correctionFiles: {
      calibrationFactor: null,
      fisheye: "/drive/fisheye_corr.cal",
      neutralDensity: null,
      vignetting: null,
    },
    fisheyeView: {
      horizontalViewDegrees: 180,
      projection: "vta",
      verticalViewDegrees: 180,
    },
    lensMask: { radius: 1834, x: 2835, y: 1845 },
    outputSettings: {
      filterIrrelevantSrcImages: true,
      targetRes: 1000,
    },
    validityCheck: { measuredVerticalIlluminanceLux: null },
    ...overrides,
  } as pipelineConfig;
}

describe("savePreset", () => {
  it("writes the source bytes it hashed", async () => {
    sources.clear();
    written.clear();
    const bytes = new TextEncoder().encode("xc : xres/2;\nyc : yres/2;\n");
    sources.set("/drive/fisheye_corr.cal", bytes);

    const preset = await savePreset("p", "P", config(), null);

    expect(written.get("/cfg/presets/p/fisheye.cal")).toEqual(bytes);
    // The hash describes what was written, not merely what the source held.
    expect(preset.files.fisheye?.sha256).toHaveLength(64);
  });

  it("refuses an empty source rather than saving a silent no-op", async () => {
    sources.clear();
    written.clear();
    sources.set("/drive/fisheye_corr.cal", new Uint8Array(0));

    await expect(savePreset("p", "P", config(), null)).rejects.toThrow(
      /is empty/
    );
    expect(written.size).toBe(0);
  });

  it("mentions cloud placeholders, which is how this actually happens", async () => {
    sources.clear();
    sources.set("/drive/fisheye_corr.cal", new Uint8Array(0));

    await expect(savePreset("p", "P", config(), null)).rejects.toThrow(
      /downloaded rather than a placeholder/
    );
  });
});
