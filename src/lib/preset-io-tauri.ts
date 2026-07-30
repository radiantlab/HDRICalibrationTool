/**
 * The desktop implementation of `PresetSourceIo`.
 *
 * Separate from `presets.ts` so that module imports no `@tauri-apps/*` and can
 * be given a browser file source instead. A preset reads its calibration files
 * once, at save time, from wherever the user chose them.
 */

import { exists, readFile } from "@tauri-apps/plugin-fs";
import { isVirtualPath, readVirtual, virtualExists } from "./vfs";
import type { PresetSourceIo } from "./presets";

export const tauriPresetIo: PresetSourceIo = {
  // A source can itself be a preset's own file, when one preset is applied and
  // re-saved under a new name. Those paths are virtual and have no disk entry.
  exists: (path) => (isVirtualPath(path) ? virtualExists(path) : exists(path)),
  readFile: (path) => (isVirtualPath(path) ? readVirtual(path) : readFile(path)),
};
