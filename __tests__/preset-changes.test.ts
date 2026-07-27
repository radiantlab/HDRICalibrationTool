import { describe, expect, it } from "@jest/globals";

const onDisk: Record<string, number[]> = {
  "/cal/fisheye.cal": [1, 2, 3],
  "/cal/vig.cal": [9, 9, 9],
};

jest.mock("@tauri-apps/api/path", () => ({
  appConfigDir: () => Promise.resolve("/cfg"),
  join: (...parts: string[]) => Promise.resolve(parts.join("/")),
}));

jest.mock("@tauri-apps/plugin-fs", () => ({
  copyFile: () => Promise.resolve(),
  exists: (path: string) => Promise.resolve(path in onDisk),
  mkdir: () => Promise.resolve(),
  readFile: (path: string) =>
    Promise.resolve(new Uint8Array(onDisk[path] ?? [])),
  readTextFile: () => Promise.resolve("{}"),
  stat: () => Promise.resolve({ size: 0 }),
  writeTextFile: () => Promise.resolve(),
}));

declare const jest: typeof import("@jest/globals").jest;

import { changedSources, type Preset, sha256Hex } from "../src/lib/presets";

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

    expect(await changedSources(preset)).toEqual(["vignetting"]);
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

    // Surviving a deleted original is the entire reason presets copy files.
    expect(await changedSources(preset)).toEqual([]);
  });
});
