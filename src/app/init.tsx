/**
 * Initialization component for the LumiLab.
 *
 * This component is responsible for setting up the application's initial state.
 * It queries the operating system platform and sets up the default output
 * directory. It used to guess where Radiance had been installed as well; the
 * pipeline is WebAssembly now, so there is nothing to locate.
 */
"use client";

import type React from "react";
import { useEffect } from "react";
import { toast } from "sonner";
import { isTauri, platformName } from "@/lib/host/env";
import { persistStorageBestEffort } from "@/lib/raw-cache-quota";
import { DatabaseVersionError, getDocument } from "@/lib/storage/kv";
import { useSettingsStore } from "./stores/settings-store";

// Debug flag to enable console logging
const DEBUG: boolean = true;

/**
 * Component that handles application initialization
 * It loads platform information and sets up default paths for the application
 */
const Initialization: React.FC = () => {
  const { settings, setSettings, hasHydrated } = useSettingsStore();

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    let cancelled = false;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: app-startup sequencing logic; restructuring risks behavior changes that can't be verified without exercising the actual Tauri startup path.
    const initialize = async () => {
      try {
        // F1: opening the database at all is what can fail permanently -- a
        // rolled-back web deploy, a browser still serving an old bundle from
        // its HTTP cache, or a reinstalled older desktop build can each leave
        // this browser holding data a *newer* build wrote, which IndexedDB
        // refuses to open at a lower version. Left undetected, every read
        // this app makes afterwards fails the same way and, via
        // `app-storage.ts`'s `readJson`, renders as an empty app -- no
        // presets, no settings, no run history -- with nothing to explain
        // why. Probed once here, unconditionally (not gated on `isTauri()`
        // the way the migration below is; a plain browser reload needs this
        // exactly as much as a desktop reinstall), because this component is
        // the one thing mounted on every page.
        try {
          await getDocument("__startup-probe__");
        } catch (error) {
          if (error instanceof DatabaseVersionError) {
            // Not dismissed on a timer: the underlying data is untouched, but
            // nothing in this app works correctly until the user reloads or
            // updates, so the message should stay until they act rather than
            // vanish the way a normal error toast would.
            toast.error(error.message, { duration: Number.POSITIVE_INFINITY });
          }
          // Any other open failure is left to whichever storage read actually
          // hits it -- an `onblocked` race with another tab is transient in a
          // way a version mismatch is not, and every caller already has its
          // own handling for "storage didn't work this time."
        }

        // F2: best-effort and fire-and-forget. The persistent RAW cache can
        // add up to a couple of gigabytes to this origin (`raw-cache.ts`),
        // and an origin that has never asked not to be reclaimed is a more
        // attractive target for the browser's storage-pressure eviction --
        // presets and settings included, not just those blobs. Also called
        // from `raw-worker.ts` on first use; kept here too because
        // `persist()`, unlike `estimate()`, has a history of being
        // unavailable from a worker on some engines, and this call costs
        // nothing extra if the worker's succeeds first.
        persistStorageBestEffort();

        // Presets and run history moved from JSON files under the app config
        // directory into IndexedDB, so one implementation serves the desktop
        // app and the browser build. Existing users have real presets and real
        // history on disk; this imports them once. It runs before anything
        // reads storage, and reports rather than swallowing what it skipped.
        //
        // Desktop only, and imported dynamically: it is the one module in
        // storage/ that touches @tauri-apps, and there is nothing on a browser
        // filesystem to import from.
        try {
          const { migrateTauriFiles } = isTauri()
            ? await import("@/lib/storage/migrate-tauri-files")
            : { migrateTauriFiles: null };
          const report = await migrateTauriFiles?.();
          if (report) {
            if (report.presetsImported > 0 || report.historyImported) {
              console.log("Imported existing presets and run history", report);
            }
            if (report.emptyFiles.length > 0) {
              toast.warning(
                "These preset calibration files were empty and were not " +
                  "imported, so those corrections would have done nothing: " +
                  `${report.emptyFiles.join(", ")}. Re-save the preset from ` +
                  "an intact source file."
              );
            }
          }
        } catch (error) {
          console.error("Initialization: storage migration failed:", error);
        }

        const osPlatform = await platformName();

        if (DEBUG) {
          console.log("OS platform successfully queried:", osPlatform);
        }

        // A browser has no default output directory and no way to create one:
        // where a download lands is the browser's decision, not the app's.
        // Leaving it empty is what tells the rest of the UI to offer downloads
        // rather than ask for a path.
        let outputDefaultPath = settings.outputPath;
        if (!outputDefaultPath && isTauri()) {
          try {
            const { documentDir, join } = await import("@tauri-apps/api/path");
            const { mkdir } = await import("@tauri-apps/plugin-fs");
            const docsDir = await documentDir();
            const targetDir = await join(docsDir, "LumiLab");
            await mkdir(targetDir, { recursive: true });
            outputDefaultPath = targetDir;
          } catch (error) {
            console.error("Initialization: could not set output path:", error);
            toast.error(
              "There was a problem setting up the default output path, please enter a path in the settings before generating HDR images."
            );
          }
        }

        if (cancelled) {
          return;
        }

        const nextSettings = {
          ...settings,
          osPlatform,
          outputPath: outputDefaultPath || settings.outputPath,
        };
        const needsUpdate =
          nextSettings.outputPath !== settings.outputPath ||
          nextSettings.osPlatform !== settings.osPlatform;

        if (needsUpdate) {
          setSettings(nextSettings);
        }
      } catch (error) {
        console.error(error);
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated, setSettings, settings]);
  // This component doesn't render anything visible, it only performs initialization
  return null;
};

export default Initialization;
