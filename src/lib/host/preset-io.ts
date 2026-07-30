/**
 * How a preset reads its source calibration files.
 *
 * A preset reads them once, at save time, from wherever the user chose them:
 * a real path on the desktop, a session path in a browser. A source can also
 * be another preset's stored file, when one is applied and re-saved under a
 * new name, and those are virtual with no disk entry at all.
 */

import { anyFileExists, readAnyFile } from "../host-fs-tauri";
import type { PresetSourceIo } from "../presets";

export const tauriPresetIo: PresetSourceIo = {
  exists: (path) => anyFileExists(path),
  readFile: (path) => readAnyFile(path),
};
