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

import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "../stores/settings-store";
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
  const [_experienceLevel, _setExperienceLevel] = useState("standard");
  const [_consoleInput, _setConsoleInput] = useState("");

  const [_appVersion, setAppVersion] = useState<string>("");
  const [_appName, setAppName] = useState<string>("");
  const [_tauriVersion, setTauriVersion] = useState<string>("");
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
  const dialog = async (id: string, label: string, isDirectory = false) => {
    const selectedPath = await open({
      directory: isDirectory,
      multiple: false,
      title: `Select${label}Path`,
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
    toast.success("Changes saved.");
  };

  return (
    <div className="grid min-h-screen grid-cols-4 bg-gray-300 text-black">
      <main className="col-span-4 m-8 mt-0 mb-10 border-gray-400 border-r border-l bg-white p-5">
        <div className="grid grid-cols-1 gap-6">
          {/* Left: External Utilities */}
          <div className="rounded-lg border border-gray-300 p-5">
            <h2 className="mb-4 flex items-center font-bold text-xl">
              Paths
            </h2>

            {/*
              Mapping through the settings fields to create input sections for each
            */}
            {[
              {
                id: "outputPath",
                label: "HDRI Output",
                placeholder: "This path is required",
                value: localSettings.outputPath,
              },
            ].map(({ id, label, value, placeholder }) => (
              <div className="mb-4" key={id}>
                <label className="mb-1 block font-semibold" htmlFor={id}>
                  {label}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    className="grow rounded border border-gray-400 px-2 py-1"
                    id={id}
                    name={id}
                    onChange={handleSettingsChange}
                    placeholder={placeholder}
                    type="text"
                    value={value}
                  />
                  <button
                    className="rounded bg-gray-300 px-2 py-1 font-semibold text-gray-700 hover:bg-gray-400"
                    onClick={() =>
                      setLocalSettings({ ...localSettings, [id]: "" })
                    }
                    type="button"
                  >
                    Clear
                  </button>
                  <button
                    className="rounded bg-gray-300 px-2 py-1 font-semibold text-gray-700 hover:bg-gray-400"
                    onClick={() => dialog(id, label, id === "outputPath")}
                    type="button"
                  >
                    Select
                  </button>
                </div>
                {id === "dcrawEmuPath" && (
                  <div className="mr-5 block h-full text-sm">
                    <span className="font-mono">dcraw_emu</span> is part of
                    LibRaw, which is licensed under{" "}
                    <a
                      className="underline hover:no-underline"
                      href="https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html"
                      onClick={(e) => {
                        e.preventDefault();
                        handleExternalLink(
                          "https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html"
                        );
                      }}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      LGPL-2.1
                    </a>
                    . The source code can be obtained from{" "}
                    <a
                      className="underline hover:no-underline"
                      href="https://www.libraw.org/"
                      onClick={(e) => {
                        e.preventDefault();
                        handleExternalLink("https://www.libraw.org/");
                      }}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      the LibRaw official website
                    </a>
                    .
                  </div>
                )}
                {id === "hdrgenPath" && (
                  <div className="mr-5 block h-full text-sm">
                    <span className="font-mono">hdrgen</span> is the work of
                    Gregory J. Ward and is licensed under{" "}
                    <a
                      className="underline hover:no-underline"
                      href="https://github.com/radiance-org/hdrgen/blob/main/LICENSE"
                      onClick={(e) => {
                        e.preventDefault();
                        handleExternalLink(
                          "https://github.com/radiance-org/hdrgen/blob/main/LICENSE"
                        );
                      }}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      BSD 3-Clause License
                    </a>
                    . The source code can be obtained from{" "}
                    <a
                      className="underline hover:no-underline"
                      href="https://github.com/radiance-org/hdrgen/"
                      onClick={(e) => {
                        e.preventDefault();
                        handleExternalLink(
                          "https://github.com/radiance-org/hdrgen/"
                        );
                      }}
                      rel="noopener noreferrer"
                      target="_blank"
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
