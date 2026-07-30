import { describe, expect, it } from "@jest/globals";
import {
  changedSources,
  type Preset,
  type PresetSourceIo,
  sha256Hex,
} from "../src/lib/presets";

const onDisk: Record<string, number[]> = {
  "/cal/fisheye.cal": [1, 2, 3],
  "/cal/vig.cal": [9, 9, 9],
};

// The host's file access is injected now, so this needs no module mocking and
// no Tauri at all.
const io: PresetSourceIo = {
  exists: (path) => Promise.resolve(path in onDisk),
  readFile: (path) => Promise.resolve(new Uint8Array(onDisk[path] ?? [])),
};

describe("changedSources", () => {
  it("reports only the slot whose source content differs", async () => {
    const preset = {
      files: {
        fisheye: {
          fileName: "fisheye.cal",
          sha256: await sha256Hex(new Uint8Array([1, 2, 3])),
          sourcePath: "/cal/fisheye.cal",
        },
        vignetting: {
          fileName: "vignetting.cal",
          // Saved against different bytes than are on disk now.
          sha256: await sha256Hex(new Uint8Array([0, 0, 0])),
          sourcePath: "/cal/vig.cal",
        },
      },
    } as unknown as Preset;

    expect(await changedSources(preset, io)).toEqual(["vignetting"]);
  });

  it("does not report a source that no longer exists", async () => {
    const preset = {
      files: {
        fisheye: {
          fileName: "fisheye.cal",
          sha256: await sha256Hex(new Uint8Array([7])),
          sourcePath: "/cal/deleted.cal",
        },
      },
    } as unknown as Preset;

    // Surviving a deleted original is the entire reason a preset stores its
    // calibration files rather than pointing at them.
    expect(await changedSources(preset, io)).toEqual([]);
  });
});
