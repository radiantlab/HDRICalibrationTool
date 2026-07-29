import { join } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readFile,
  remove,
  writeFile,
} from "@tauri-apps/plugin-fs";
import type { pipelineConfig } from "@/app/home-page/(pipeline-configuration)/config-provider";
import { readJson, storagePath, writeJson } from "./app-storage";

export type PresetFileSlot =
  | "calibrationFactor"
  | "fisheye"
  | "neutralDensity"
  | "response"
  | "vignetting";

export interface PresetFile {
  fileName: string;
  sha256: string;
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
 * Copies every supplied calibration file into presets/<id>/ so the preset
 * survives the originals being moved or deleted, recording each source path and
 * content hash so a re-derived calibration can be detected later.
 */
export async function savePreset(
  id: string,
  name: string,
  config: pipelineConfig,
  lensMaskImageSize: [number, number] | null
): Promise<Preset> {
  const dir = await storagePath("presets", id);
  await mkdir(dir, { recursive: true });

  const slots = (
    Object.entries(sourcePaths(config)) as [PresetFileSlot, string | null][]
  ).filter((entry): entry is [PresetFileSlot, string] => entry[1] !== null);

  const copied = await Promise.all(
    slots.map(async ([slot, sourcePath]) => {
      const fileName = SLOT_FILENAMES[slot];
      // Read once, then write those same bytes and hash them.
      //
      // This replaced `copyFile` plus a separate hash of the source, which
      // could disagree: a copy that landed short still recorded the hash of
      // what the source *should* have contained. That is not hypothetical --
      // calibration files kept on Google Drive copied as zero bytes, and an
      // empty .cal silently turns its correction into a no-op, so runs varied
      // with no visible cause and the preset looked intact.
      const bytes = await readFile(sourcePath);
      if (bytes.length === 0) {
        throw new Error(
          `${sourcePath} is empty, so it cannot be saved as the ${slot} file. ` +
            "If it is stored in a cloud folder, open it once so the file is " +
            "downloaded rather than a placeholder, then save the preset again."
        );
      }
      await writeFile(await join(dir, fileName), bytes);
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
  preset: Preset
): Promise<PresetFileSlot[]> {
  const entries = Object.entries(preset.files) as [
    PresetFileSlot,
    PresetFile,
  ][];

  const results = await Promise.all(
    entries.map(async ([slot, file]) => {
      if (!(await exists(file.sourcePath))) {
        return null;
      }
      const current = await sha256Hex(await readFile(file.sourcePath));
      return current === file.sha256 ? null : slot;
    })
  );

  return results.filter((slot): slot is PresetFileSlot => slot !== null);
}

/** Removes a preset and the calibration files copied into it. */
export async function deletePreset(id: string): Promise<void> {
  const presets = await readPresets();
  await writeJson(PRESETS_FILE, {
    presets: presets.filter((entry) => entry.id !== id),
  });

  const dir = await storagePath("presets", id);
  if (await exists(dir)) {
    await remove(dir, { recursive: true });
  }
}

/**
 * Renames a preset in place.
 *
 * The directory keeps its original id, so the copied calibration files do not
 * have to move and nothing can be lost partway through.
 */
export async function renamePreset(id: string, name: string): Promise<void> {
  const presets = await readPresets();
  await writeJson(PRESETS_FILE, {
    presets: presets.map((entry) =>
      entry.id === id ? { ...entry, name } : entry
    ),
  });
}

/** Absolute path of a preset's stored copy, used when applying it. */
export async function presetFilePath(
  preset: Preset,
  slot: PresetFileSlot
): Promise<string | null> {
  const file = preset.files[slot];
  if (!file) {
    return null;
  }
  return await storagePath("presets", preset.id, file.fileName);
}
