import { describe, expect, it } from "@jest/globals";

/**
 * A preset stores the *contents* of its calibration files. It used to copy
 * them to disk beside a record pointing at them, and the two could disagree:
 * a copy that landed short still recorded the hash of what the source should
 * have contained, so the preset looked intact while the file behind it was
 * empty. An empty `.cal` turns its correction into a silent no-op, so runs
 * varied with nothing in the UI to explain it. That happened, with calibration
 * files kept on Google Drive, which copied as zero bytes.
 *
 * These tests pin the properties that stop it recurring.
 */

const sources = new Map<string, Uint8Array>();
const stored = new Map<string, Uint8Array>();

jest.mock("../src/lib/storage/kv", () => ({
  deleteFile: () => Promise.resolve(),
  fileKeys: () => Promise.resolve([]),
  getDocument: () => Promise.resolve(undefined),
  putDocument: () => Promise.resolve(),
  putFile: (key: string, bytes: Uint8Array) => {
    stored.set(key, bytes);
    return Promise.resolve();
  },
}));

declare const jest: typeof import("@jest/globals").jest;

import type { pipelineConfig } from "../src/app/home-page/(pipeline-configuration)/config-provider";
import { type PresetSourceIo, savePreset } from "../src/lib/presets";

const io: PresetSourceIo = {
  exists: (path) => Promise.resolve(sources.has(path)),
  readFile: (path) => {
    const file = sources.get(path);
    return file
      ? Promise.resolve(file)
      : Promise.reject(new Error(`ENOENT ${path}`));
  },
};

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

const IS_EMPTY = /is empty/;
const CLOUD_PLACEHOLDER = /downloaded rather than a placeholder/;

describe("savePreset", () => {
  it("stores the source bytes it hashed, under the preset's stable key", async () => {
    sources.clear();
    stored.clear();
    const bytes = new TextEncoder().encode("xc : xres/2;\nyc : yres/2;\n");
    sources.set("/drive/fisheye_corr.cal", bytes);

    const preset = await savePreset("p", "P", config(), null, io);

    // The key is derived from the preset id and the slot's fixed filename, so
    // it is the same string in every session -- which is what lets a preset
    // saved today still resolve its calibration tomorrow.
    expect(stored.get("presets/p/fisheye.cal")).toEqual(bytes);
    // The hash describes what was stored, not merely what the source held.
    expect(preset.files.fisheye?.sha256).toHaveLength(64);
  });

  it("refuses an empty source rather than saving a silent no-op", async () => {
    sources.clear();
    stored.clear();
    sources.set("/drive/fisheye_corr.cal", new Uint8Array(0));

    await expect(savePreset("p", "P", config(), null, io)).rejects.toThrow(
      IS_EMPTY
    );
    expect(stored.size).toBe(0);
  });

  it("mentions cloud placeholders, which is how this actually happens", async () => {
    sources.clear();
    sources.set("/drive/fisheye_corr.cal", new Uint8Array(0));

    await expect(savePreset("p", "P", config(), null, io)).rejects.toThrow(
      CLOUD_PLACEHOLDER
    );
  });
});
