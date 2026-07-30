/**
 * One-time import of presets and run history from the old on-disk files.
 *
 * Desktop only, and the only module in `storage/` that imports `@tauri-apps/*`.
 * Called once at startup; a browser build never reaches it.
 *
 * Storage moved to IndexedDB so the same code serves both hosts, and so a
 * preset's calibration files stop living somewhere other than the record that
 * describes them. Existing users have real presets and real run history under
 * the app config directory, and losing them silently would be worse than the
 * problem the move solves.
 */

import { appConfigDir, join } from "@tauri-apps/api/path";
import { exists, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { STORAGE_VERSION } from "../app-storage";
import { getDocument, putDocument, putFile } from "./kv";

/** Marks the import done, so it never runs twice. */
const MARKER = "migrations/tauri-files";

const PRESETS_KEY = "presets/presets.json";
const HISTORY_KEY = "history/runs.json";

interface LegacyPresetFile {
  fileName: string;
  sha256: string;
  sourcePath: string;
}

interface LegacyPreset {
  files?: Record<string, LegacyPresetFile>;
  id: string;
  name: string;
}

export interface MigrationReport {
  /** Slots whose stored copy was empty and was therefore not imported. */
  emptyFiles: string[];
  historyImported: boolean;
  presetsImported: number;
  ran: boolean;
}

export async function migrateTauriFiles(): Promise<MigrationReport> {
  const report: MigrationReport = {
    emptyFiles: [],
    historyImported: false,
    presetsImported: 0,
    ran: false,
  };

  if (await getDocument(MARKER)) {
    return report;
  }
  report.ran = true;

  const root = await appConfigDir();

  const history = await readLegacyJson(
    await join(root, "history", "runs.json")
  );
  if (history) {
    await putDocument(HISTORY_KEY, history);
    report.historyImported = true;
  }

  const presets = (await readLegacyJson(
    await join(root, "presets", "presets.json")
  )) as { presets?: LegacyPreset[] } | null;

  if (presets?.presets) {
    // Sequential on purpose: this runs once, at startup, before the UI is
    // usable, and reading a few small files in order is easier to reason about
    // than a concurrent import that half-succeeds.
    for (const preset of presets.presets) {
      for (const [slot, file] of Object.entries(preset.files ?? {})) {
        // biome-ignore lint/performance/noAwaitInLoops: a one-time startup import of a handful of small files; ordering keeps a partial failure comprehensible
        const source = await join(root, "presets", preset.id, file.fileName);
        if (!(await exists(source))) {
          continue;
        }
        const bytes = await readFile(source);
        // Two presets on the reporting machine hold zero-byte .cal files, from
        // the copy bug this move exists to prevent. An empty .cal turns its
        // correction into a silent no-op, so importing one would carry the
        // corruption forward wearing a valid-looking record. Skipped, and the
        // slot is reported so the user can re-save it.
        if (bytes.length === 0) {
          report.emptyFiles.push(`${preset.name}: ${slot}`);
          continue;
        }
        await putFile(presetFileKey(preset.id, file.fileName), bytes);
      }
    }
    await putDocument(PRESETS_KEY, presets);
    report.presetsImported = presets.presets.length;
  }

  await putDocument(MARKER, { at: new Date().toISOString() });
  return report;
}

/** Where a preset's calibration file lives in the blob store. */
export function presetFileKey(id: string, fileName: string): string {
  return `presets/${id}/${fileName}`;
}

async function readLegacyJson(path: string): Promise<object | null> {
  try {
    if (!(await exists(path))) {
      return null;
    }
    const parsed = JSON.parse(await readTextFile(path)) as {
      version?: number;
    };
    // Same check the old reader applied. A document from a future version is
    // not importable, and silently downgrading it would be worse than leaving
    // it on disk where it can still be recovered by hand.
    return parsed.version === STORAGE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}
