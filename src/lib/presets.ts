import type { pipelineConfig } from "@/app/home-page/(pipeline-configuration)/config-provider";
import { readJson, writeJson } from "./app-storage";
import { deleteFile, fileKeys, putFile } from "./storage/kv";
import { presetPath, storedKey } from "./vfs";

/**
 * Reads a source calibration file.
 *
 * Injected so this module imports no `@tauri-apps/*`: the desktop build reads
 * the user's chosen path off disk, and the browser build resolves it through
 * the virtual filesystem. Both hand back bytes, which is all a preset needs.
 */
export interface PresetSourceIo {
  exists: (path: string) => Promise<boolean>;
  readFile: (path: string) => Promise<Uint8Array>;
}

export type PresetFileSlot =
  | "calibrationFactor"
  | "fisheye"
  | "neutralDensity"
  | "response"
  | "vignetting";

export interface PresetFile {
  fileName: string;
  sha256: string;
  /**
   * Where the file came from when the preset was saved.
   *
   * Kept for `changedSources`, which reports a calibration that has been
   * re-derived since. It is a record, not a dependency: the contents live in
   * storage, so a preset still applies when the original is gone. In a browser
   * build there may be no meaningful source path, and that is fine.
   */
  sourcePath: string;
}

export interface Preset {
  files: Partial<Record<PresetFileSlot, PresetFile>>;
  fisheyeView: pipelineConfig["fisheyeView"];
  id: string;
  lensMask: pipelineConfig["lensMask"] | null;
  /** The image dimensions the mask was drawn against, so it can be checked. */
  lensMaskImageSize: [number, number] | null;
  name: string;
  outputSettings: pipelineConfig["outputSettings"];
}

const PRESETS_FILE = "presets/presets.json";

const SLOT_FILENAMES: Record<PresetFileSlot, string> = {
  calibrationFactor: "calibration.cal",
  fisheye: "fisheye.cal",
  neutralDensity: "nd.cal",
  response: "response.rsp",
  vignetting: "vignetting.cal",
};

const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

/**
 * Turns a preset name into a directory name.
 *
 * Strictly alphanumeric-and-hyphen: the id becomes a directory under the
 * presets folder, so anything that could act as a path separator or a parent
 * reference has to be stripped rather than escaped.
 */
export function presetId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(NON_SLUG, "-")
    .replace(EDGE_DASHES, "");
  return slug || "preset";
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The equipment half of the configuration.
 *
 * A preset holds the tutorial's one-time setup material (response function,
 * calibration files, view angles, projection, target resolution, lens mask) and
 * never the per-capture material (the image set and the measured illuminance),
 * which changes every time.
 */
export function presetFields(config: pipelineConfig) {
  return {
    fisheyeView: config.fisheyeView,
    lensMask: config.lensMask,
    outputSettings: config.outputSettings,
  };
}

export async function readPresets(): Promise<Preset[]> {
  const stored = await readJson<{ presets: Preset[] }>(PRESETS_FILE, {
    presets: [],
  });
  return stored.presets ?? [];
}

function sourcePaths(
  config: pipelineConfig
): Record<PresetFileSlot, string | null> {
  return {
    calibrationFactor: config.correctionFiles.calibrationFactor,
    fisheye: config.correctionFiles.fisheye,
    neutralDensity: config.correctionFiles.neutralDensity,
    response: config.cameraResponseLocation,
    vignetting: config.correctionFiles.vignetting,
  };
}

/**
 * Stores the contents of every supplied calibration file with the preset.
 *
 * The contents, not a copy on disk beside a record pointing at it. That
 * arrangement let the two disagree: a copy that landed short still recorded
 * the hash of what the source should have contained, so the preset looked
 * intact while the file behind it was empty. Calibration files kept on a cloud
 * drive did exactly that, and an empty `.cal` turns its correction into a
 * silent no-op, so runs varied with nothing in the UI to explain it.
 *
 * Every calibration file in the reference set totals about 3 KB, so a preset
 * carrying all five slots inline is on the order of 10 KB. It also makes a
 * preset self-contained, which is what it always claimed to be.
 */
export async function savePreset(
  id: string,
  name: string,
  config: pipelineConfig,
  lensMaskImageSize: [number, number] | null,
  io: PresetSourceIo
): Promise<Preset> {
  const slots = (
    Object.entries(sourcePaths(config)) as [PresetFileSlot, string | null][]
  ).filter((entry): entry is [PresetFileSlot, string] => entry[1] !== null);

  const copied = await Promise.all(
    slots.map(async ([slot, sourcePath]) => {
      const fileName = SLOT_FILENAMES[slot];
      // Read once, then store those same bytes and hash them. Reading twice
      // is what allowed the stored copy and its recorded hash to describe
      // different content.
      const bytes = await io.readFile(sourcePath);
      if (bytes.length === 0) {
        throw new Error(
          `${sourcePath} is empty, so it cannot be saved as the ${slot} file. ` +
            "If it is stored in a cloud folder, open it once so the file is " +
            "downloaded rather than a placeholder, then save the preset again."
        );
      }
      await putFile(storedKey(presetPath(id, fileName)), bytes);
      const file: PresetFile = {
        fileName,
        sha256: await sha256Hex(bytes),
        sourcePath,
      };
      return [slot, file] as const;
    })
  );

  const files: Partial<Record<PresetFileSlot, PresetFile>> = {};
  for (const [slot, file] of copied) {
    files[slot] = file;
  }

  const preset: Preset = {
    files,
    id,
    lensMaskImageSize,
    name,
    ...presetFields(config),
  };
  const presets = await readPresets();
  await writeJson(PRESETS_FILE, {
    presets: [
      // Drop by name as well as id: an id produced by an older slug rule would
      // otherwise leave a second entry with the same name behind.
      ...presets.filter((entry) => entry.id !== id && entry.name !== name),
      preset,
    ],
  });
  return preset;
}

/**
 * Slots whose source file still exists but no longer matches the copy taken
 * when the preset was saved, meaning that calibration has been re-derived.
 *
 * A source that has been moved or deleted is not reported: surviving that is
 * why presets copy their files in the first place.
 */
export async function changedSources(
  preset: Preset,
  io: PresetSourceIo
): Promise<PresetFileSlot[]> {
  const entries = Object.entries(preset.files) as [
    PresetFileSlot,
    PresetFile,
  ][];

  const results = await Promise.all(
    entries.map(async ([slot, file]) => {
      if (!(await io.exists(file.sourcePath))) {
        return null;
      }
      let current: string;
      try {
        current = await sha256Hex(await io.readFile(file.sourcePath));
      } catch {
        // A source that exists but cannot be read is in the same position as
        // one that has been moved: there is nothing to compare against, and
        // the preset carries its own copy regardless. Reporting it as changed
        // would tell the user to re-save from a file that cannot be read.
        return null;
      }
      return current === file.sha256 ? null : slot;
    })
  );

  return results.filter((slot): slot is PresetFileSlot => slot !== null);
}

/** Removes a preset and the calibration files stored with it. */
export async function deletePreset(id: string): Promise<void> {
  const presets = await readPresets();
  await writeJson(PRESETS_FILE, {
    presets: presets.filter((entry) => entry.id !== id),
  });

  // The index is written first. A crash between the two leaves orphaned blobs,
  // which are inert; the reverse order would leave a preset that lists files
  // it can no longer resolve.
  const keys = await fileKeys(storedKey(presetPath(id, "")));
  await Promise.all(keys.map((key) => deleteFile(key)));
}

/**
 * Renames a preset in place.
 *
 * The id is unchanged, so the stored calibration files keep their keys and
 * nothing can be lost partway through.
 */
export async function renamePreset(id: string, name: string): Promise<void> {
  const presets = await readPresets();
  await writeJson(PRESETS_FILE, {
    presets: presets.map((entry) =>
      entry.id === id ? { ...entry, name } : entry
    ),
  });
}

/**
 * The path a preset's calibration file is applied under.
 *
 * Virtual: nothing is on disk. It is derived from the preset id and the slot's
 * fixed filename, so it is the same string in every session, which is what
 * lets a preset saved today still resolve tomorrow.
 */
export function presetFilePath(
  preset: Preset,
  slot: PresetFileSlot
): string | null {
  const file = preset.files[slot];
  return file ? presetPath(preset.id, file.fileName) : null;
}
