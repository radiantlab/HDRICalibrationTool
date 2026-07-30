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
 * No binary paths remain. Every tool the app runs -- the pipeline and the RAW
 * preview alike -- is WebAssembly shipped with it, so there is nothing to
 * locate and nothing for a user to configure. That is what resolves the
 * "dependencies are hard to set up" complaint.
 *
 * @property outputPath - Default path for output files
 * @property osPlatform - Operating system platform (windows, darwin, linux)
 */
interface Settings {
  osPlatform: string;
  outputPath: string;
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
        osPlatform: "",
        outputPath: "",
      },
    }),
    {
      // Zustand shallow-merges at the top level, so a persisted `settings`
      // object replaces the defaults wholesale. Two consequences worth
      // knowing, in opposite directions:
      //
      //  - A field *added* after a user last saved arrives as undefined rather
      //    than as its default, so anything new must either tolerate undefined
      //    or ship a migration.
      //  - A field *removed* stays in the persisted object indefinitely.
      //    `radiancePath`, `hdrgenPath`, `dcrawEmuPath` and `useWasmPipeline`
      //    are therefore still in existing users' localStorage. That is
      //    harmless -- nothing
      //    reads them and the extra keys are inert -- and deliberately not
      //    cleaned up, since a migration that rewrites stored settings is more
      //    risk than three dead strings.
      //
      // `useWasmPipeline` in particular must not be revived as a dispatch:
      // anyone who explicitly set it false still has false persisted, and
      // there is no longer another pipeline to fall back to.
      name: "hdr-settings",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({ settings: state.settings }),
      storage: createJSONStorage(() => localStorage),
    }
  )
);
