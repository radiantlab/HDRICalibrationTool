/**
 * Settings Page Component for the HDRI Calibration Tool.
 *
 * This component allows users to configure application settings including:
 * - External utility paths (Radiance, hdrgen, dcraw_emu)
 * - Output file location
 * - User experience level
 * - Debug console access
 *
 * Settings are saved to persistent storage via Tauri API calls.
 */
"use client";

import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settings-store";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import SettingsButtonBar from "./settings-button-bar";

const handleExternalLink = async (url: string) => {
	await openPath(url);
};

/**
 * Main Settings Page component
 *
 * @returns React component with settings interface
 */
export default function SettingsPage() {
	const { settings, setSettings } = useSettingsStore();
	const [localSettings, setLocalSettings] = useState(settings);
	const [saveDisabled, setSaveDisabled] = useState(true);
	const [experienceLevel, setExperienceLevel] = useState("standard");
	const [consoleInput, setConsoleInput] = useState("");

	const [appVersion, setAppVersion] = useState<string>("");
	const [appName, setAppName] = useState<string>("");
	const [tauriVersion, setTauriVersion] = useState<string>("");
	useEffect(() => {
		/**
		 * Retrieves app name, app version, and tauri version from Tauri API
		 * and updates the component state
		 */
		async function fetchAppInfo() {
			setAppVersion(await getVersion());
			setAppName(await getName());
			setTauriVersion(await getTauriVersion());
		}

		fetchAppInfo();
	}, []);

	// Update local settings when global settings change
	useEffect(() => {
		setLocalSettings(settings);
	}, [settings]);
	/**
	 * Handles changes to input fields in the settings form
	 *
	 * @param event - Input change event
	 */
	const handleSettingsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const updatedSettings = {
			...localSettings,
			[event.currentTarget.name]: event.currentTarget.value,
		};
		setLocalSettings(updatedSettings);
		setSaveDisabled(false); // Enable the save button since changes were made
	};

	/**
	 * Updates a specific path setting
	 *
	 * @param id - ID of the setting to update
	 * @param path - New path value
	 */
	const handleUpdatePath = (id: string, path: string) => {
		setLocalSettings({ ...localSettings, [id]: path });
		setSaveDisabled(false); // Enable the save button since changes were made
	};

	/**
	 * Opens a file/directory selection dialog
	 *
	 * @param id - ID of the setting to update
	 * @param label - Label for the dialog title
	 * @param isDirectory - Whether to select a directory (true) or a file (false)
	 */
	const dialog = async (
		id: string,
		label: string,
		isDirectory: boolean = false
	) => {
		let selectedPath = await open({
			title: "Select" + label + "Path",
			multiple: false,
			directory: isDirectory,
		});
		if (selectedPath !== null) {
			handleUpdatePath(id, selectedPath as string);
		}
	};
	/**
	 * Saves the current settings to global store and persistent storage
	 *
	 * Updates the global settings store with the local settings
	 * Writes binary paths to persistent storage via Tauri API
	 * Disables the save button and displays a confirmation message
	 */
	const savePaths = () => {
		setSettings(localSettings);
		setSaveDisabled(true);
		alert("Changes saved.");
	};

	return (
		<div className="bg-gray-300 text-black grid grid-cols-4 min-h-screen">
			<main className="bg-white col-span-4 m-8 mt-0 p-5 mb-10 border-l border-r border-gray-400">
				<div className="grid grid-cols-1 gap-6">
					{/* Left: External Utilities */}
					<div className="border border-gray-300 rounded-lg p-5">
						<h2 className="text-xl font-bold mb-4 flex items-center">
							External Utilities
							{/* <span className="ml-2 text-gray-500 text-sm">ⓘ</span> */}
						</h2>

						{/*
              Mapping through the settings fields to create input sections for each
            */}
						{[
							{
								id: "radiancePath",
								label: "Radiance",
								value: localSettings.radiancePath,
								placeholder: "This path is required",
							},
							{
								id: "hdrgenPath",
								label: "hdrgen (optional)",
								value: localSettings.hdrgenPath,
								placeholder:
									"This path is optional, only enter a new path if you wish to override the included hdrgen binary",
							},
							{
								id: "dcrawEmuPath",
								label: "dcraw_emu (optional)",
								value: localSettings.dcrawEmuPath,
								placeholder:
									"This path is optional, only enter a new path if you wish to override the included dcraw_emu binary",
							},
							{
								id: "outputPath",
								label: "HDRI Output",
								value: localSettings.outputPath,
								placeholder: "This path is required",
							},
						].map(({ id, label, value, placeholder }) => (
							<div key={id} className="mb-4">
								<label htmlFor={id} className="font-semibold block mb-1">
									{label}
								</label>
								<div className="flex items-center gap-2">
									<input
										id={id}
										name={id}
										type="text"
										value={value}
										placeholder={placeholder}
										onChange={handleSettingsChange}
										className="grow border border-gray-400 rounded px-2 py-1"
									/>
									<button
										onClick={() =>
											setLocalSettings({ ...localSettings, [id]: "" })
										}
										className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
									>
										Clear
									</button>
									<button
										onClick={() => dialog(id, label, id === "outputPath")}
										className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
									>
										Select
									</button>
								</div>
								{id == "dcrawEmuPath" && (
									<div className="block h-full mr-5 text-sm">
										<span className="font-mono">dcraw_emu</span> is part of
										LibRaw, which is licensed under{" "}
										<a
											className="underline hover:no-underline"
											target="_blank"
											rel="noopener noreferrer"
											href="https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html"
											onClick={(e) => {
												e.preventDefault();
												handleExternalLink(
													"https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html"
												);
											}}
										>
											LGPL-2.1
										</a>
										. The source code can be obtained from{" "}
										<a
											className="underline hover:no-underline"
											target="_blank"
											rel="noopener noreferrer"
											href="https://www.libraw.org/"
											onClick={(e) => {
												e.preventDefault();
												handleExternalLink("https://www.libraw.org/");
											}}
										>
											the LibRaw official website
										</a>
										.
									</div>
								)}
								{id == "hdrgenPath" && (
									<div className="block h-full mr-5 text-sm">
										<span className="font-mono">hdrgen</span> is the work of
										Gregory J. Ward and is licensed under{" "}
										<a
											className="underline hover:no-underline"
											target="_blank"
											rel="noopener noreferrer"
											href="https://github.com/radiance-org/hdrgen/blob/main/LICENSE"
											onClick={(e) => {
												e.preventDefault();
												handleExternalLink(
													"https://github.com/radiance-org/hdrgen/blob/main/LICENSE"
												);
											}}
										>
											BSD 3-Clause License
										</a>
										. The source code can be obtained from{" "}
										<a
											className="underline hover:no-underline"
											target="_blank"
											rel="noopener noreferrer"
											href="https://github.com/radiance-org/hdrgen/"
											onClick={(e) => {
												e.preventDefault();
												handleExternalLink(
													"https://github.com/radiance-org/hdrgen/"
												);
											}}
										>
											the GitHub repository
										</a>
										.
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			</main>

			<SettingsButtonBar saveDisabled={saveDisabled} savePaths={savePaths} />
		</div>
	);
}
