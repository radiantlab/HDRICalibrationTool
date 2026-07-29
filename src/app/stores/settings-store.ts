"use client";

/**
 * Settings store module for the HDRI Calibration Tool.
 *
 * This module defines a global state store using Zustand to manage application settings
 * such as paths to various binaries and tools needed for HDRI processing.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Interface defining the application settings
 *
 * @property radiancePath - Path to the Radiance binary directory
 * @property hdrgenPath - Path to the HDRGen binary
 * @property dcrawEmuPath - Path to the dcraw_emu binary
 * @property outputPath - Default path for output files
 * @property osPlatform - Operating system platform (windows, darwin, linux)
 */
interface Settings {
  dcrawEmuPath: string;
  hdrgenPath: string;
  osPlatform: string;
  outputPath: string;
  radiancePath: string;
  /**
   * Run the WebAssembly pipeline instead of the Rust one.
   *
   * Temporary, and off by default: it exists so the two can be compared on the
   * same image set before the Rust pipeline is removed
   * (radiantlab/HDRICalibrationTool#233). Once the WebAssembly path is proven
   * this setting goes, along with the three tool paths above -- which is the
   * change that actually resolves the "dependencies are hard to set up"
   * complaint.
   */
  useWasmPipeline: boolean;
}

/**
 * Interface defining the settings store structure
 *
 * @property settings - The current application settings
 * @property setSettings - Function to update the settings
 */
interface SettingsStore {
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  setSettings: (settings: Settings) => void;
  settings: Settings;
}

/**
 * Zustand store hook for managing application settings
 *
 * Usage example:
 * ```
 * const { settings, setSettings } = useSettingsStore();
 * ```
 */
export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      hasHydrated: false,
      setHasHydrated: (state) => set({ hasHydrated: state }),
      // Function to update the settings state
      setSettings: (settings) => set({ settings }),
      // Initial default empty settings
      settings: {
        dcrawEmuPath: "",
        hdrgenPath: "",
        osPlatform: "",
        outputPath: "",
        radiancePath: "",
        useWasmPipeline: false,
      },
    }),
    {
      // Zustand shallow-merges at the top level, so a persisted `settings`
      // object replaces the defaults wholesale. A field added after a user
      // last saved therefore arrives as undefined rather than its default,
      // which is why `useWasmPipeline` is read defensively at its use sites.
      // Safe here because undefined is falsy and the Rust pipeline is the
      // fallback; a setting whose default were `true` would need a migration.
      name: "hdr-settings",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({ settings: state.settings }),
      storage: createJSONStorage(() => localStorage),
    }
  )
);
