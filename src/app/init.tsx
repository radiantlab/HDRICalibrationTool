/**
 * Initialization component for the HDRI Calibration Tool.
 *
 * This component is responsible for setting up the application's initial state.
 * It queries the operating system platform, sets default paths based on the platform,
 * and loads saved binary paths from storage.
 */
"use client";

import React, { useEffect } from "react";
import { documentDir, join } from "@tauri-apps/api/path";
import { mkdir } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";
import { useSettingsStore } from "./stores/settings-store";

// Debug flag to enable console logging
const DEBUG = true;

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

		const initialize = async () => {
			try {
				const osPlatform = platform();

				if (DEBUG) {
					console.log("OS platform successfully queried:", osPlatform);
				}

				const radianceDefaultPath =
					osPlatform === "windows"
						? "C:\\Radiance\\bin"
						: "/usr/local/radiance/bin";

				let outputDefaultPath = settings.outputPath;
				if (!outputDefaultPath) {
					try {
						const docsDir = await documentDir();
						const targetDir = await join(docsDir, "HDRICalibrationInterface");
						await mkdir(targetDir, { recursive: true });
						outputDefaultPath = targetDir;
					} catch (error) {
						console.error("Initialization: could not set output path:", error);
						alert(
							"There was a problem setting up the default output path, please enter a path in the settings before generating HDR images."
						);
					}
				}

				if (cancelled) {
					return;
				}

				const nextSettings = {
					...settings,
					radiancePath: settings.radiancePath || radianceDefaultPath,
					outputPath: outputDefaultPath || settings.outputPath,
					osPlatform,
				};
				const needsUpdate =
					nextSettings.radiancePath !== settings.radiancePath ||
					nextSettings.outputPath !== settings.outputPath ||
					nextSettings.osPlatform !== settings.osPlatform;

				if (needsUpdate) {
					setSettings(nextSettings);
				}
			} catch (error) {
				console.error(error);
			}
		};

		void initialize();

		return () => {
			cancelled = true;
		};
	}, [hasHydrated, setSettings, settings]);
	// This component doesn't render anything visible, it only performs initialization
	return null;
};

export default Initialization;
