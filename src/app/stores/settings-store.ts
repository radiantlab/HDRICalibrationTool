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
	radiancePath: string;
	hdrgenPath: string;
	dcrawEmuPath: string;
	outputPath: string;
	osPlatform: string;
}

/**
 * Interface defining the settings store structure
 *
 * @property settings - The current application settings
 * @property setSettings - Function to update the settings
 */
interface SettingsStore {
	settings: Settings;
	setSettings: (settings: Settings) => void;
	hasHydrated: boolean;
	setHasHydrated: (state: boolean) => void;
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
			// Initial default empty settings
			settings: {
				radiancePath: "",
				hdrgenPath: "",
				dcrawEmuPath: "",
				outputPath: "",
				osPlatform: "",
			},
			// Function to update the settings state
			setSettings: (settings) => set({ settings }),
			hasHydrated: false,
			setHasHydrated: (state) => set({ hasHydrated: state }),
		}),
		{
			name: "hdr-settings",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({ settings: state.settings }),
			onRehydrateStorage: () => (state) => {
				state?.setHasHydrated(true);
			},
		}
	)
);
