/**
 * Initialization component for the HDRI Calibration Tool.
 *
 * This component is responsible for setting up the application's initial state.
 * It queries the operating system platform and sets up the default output
 * directory. It used to guess where Radiance had been installed as well; the
 * pipeline is WebAssembly now, so there is nothing to locate.
 */
"use client";

import { documentDir, join } from "@tauri-apps/api/path";
import { mkdir } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";
import type React from "react";
import { useEffect } from "react";
import { toast } from "sonner";
import { migrateTauriFiles } from "@/lib/storage/migrate-tauri-files";
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
        // Presets and run history moved from JSON files under the app config
        // directory into IndexedDB, so one implementation serves the desktop
        // app and the browser build. Existing users have real presets and real
        // history on disk; this imports them once. It runs before anything
        // reads storage, and reports rather than swallowing what it skipped.
        try {
          const report = await migrateTauriFiles();
          if (report.presetsImported > 0 || report.historyImported) {
            console.log("Imported existing presets and run history", report);
          }
          if (report.emptyFiles.length > 0) {
            toast.warning(
              "These preset calibration files were empty and were not imported, " +
                "so those corrections would have done nothing: " +
                `${report.emptyFiles.join(", ")}. Re-save the preset from an ` +
                "intact source file."
            );
          }
        } catch (error) {
          console.error("Initialization: storage migration failed:", error);
        }

        const osPlatform = platform();

        if (DEBUG) {
          console.log("OS platform successfully queried:", osPlatform);
        }

        let outputDefaultPath = settings.outputPath;
        if (!outputDefaultPath) {
          try {
            const docsDir = await documentDir();
            const targetDir = await join(docsDir, "HDRICalibrationInterface");
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
