"use client";

import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settings-store";
import { open } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import SettingsButtonBar from "./settings-button-bar";

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
    // Retrieves app name, app version, and tauri version from Tauri API
    async function fetchAppInfo() {
      setAppVersion(await getVersion());
      setAppName(await getName());
      setTauriVersion(await getTauriVersion());
    }

    fetchAppInfo();
  }, []);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleRunCommand = () => {
    console.log("Command:", consoleInput);
  };

  const handleSettingsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const updatedSettings = {
      ...localSettings,
      [event.currentTarget.name]: event.currentTarget.value,
    };
    setLocalSettings(updatedSettings);
    setSaveDisabled(false);
  };

  const handleUpdateOutputPath = (directory: string) => {
    const updatedSettings = { ...localSettings, outputPath: directory };
    setLocalSettings(updatedSettings);
  };

  const dialog = async () => {
    let directory = await open({
      multiple: false,
      directory: true,
    });
    if (directory !== null) {
      handleUpdateOutputPath(directory as string);
    }
  };

  const savePaths = () => {
    setSettings(localSettings);
    invoke("write_binary_paths", {
      hdrgenPath: localSettings.hdrgenPath,
      dcrawEmuPath: localSettings.dcrawEmuPath,
    }).catch(() => console.error);
    setSaveDisabled(true);
    alert("Changes saved.");
  };

  return (
   <div className="bg-gray-300 text-black grid grid-cols-4 min-h-screen">
      <main className="bg-white col-span-4 m-8 mt-0 p-5 mb-10 border-l border-r border-gray-400">
        <div className="grid grid-cols-2 gap-6">
          {/* Left: External Utilities */}
          <div className="border border-gray-300 rounded-lg p-5">
            <h2 className="text-xl font-bold mb-4 flex items-center">
              External Utilities
              <span className="ml-2 text-gray-500 text-sm">ⓘ</span>
            </h2>

            {[
              { id: "radiancePath", label: "Radiance Path", value: localSettings.radiancePath },
              { id: "hdrgenPath", label: "hdrgen Path", value: localSettings.hdrgenPath },
              { id: "dcrawEmuPath", label: "dcraw_emu Path", value: localSettings.dcrawEmuPath },
            ].map(({ id, label, value }) => (
              <div key={id} className="mb-4">
                <label htmlFor={id} className="font-semibold block mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    id={id}
                    name={id}
                    type="text"
                    value={value}
                    onChange={handleSettingsChange}
                    className="flex-grow border border-gray-400 rounded px-2 py-1"
                  />
                  <button
                    onClick={() => setLocalSettings({ ...localSettings, [id]: "" })}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => console.log(`Select for ${id}`)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}

            {/* Output path */}
            <div className="mb-4">
              <label htmlFor="outputPath" className="font-semibold block mb-1">
                HDRI Output
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="outputPath"
                  name="outputPath"
                  type="text"
                  value={localSettings.outputPath}
                  onChange={(e) => handleUpdateOutputPath(e.target.value)}
                  className="flex-grow border border-gray-400 rounded px-2 py-1"
                />
                <button
                  onClick={() => handleUpdateOutputPath("")}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
                >
                  Clear
                </button>
                <button
                  onClick={dialog}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
                >
                  Select
                </button>
              </div>
            </div>
          </div>

          {/* Right: Usability Preferences */}
          <div className="border border-gray-300 rounded-lg p-5">
            <h2 className="text-xl font-bold mb-4 flex items-center">
              Usability Preferences
              <span className="ml-2 text-gray-500 text-sm">ⓘ</span>
            </h2>

            {/* Experience Level */}
            <div className="mb-6">
              <label className="font-semibold block mb-2">Experience Level</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="experienceLevel"
                    value="standard"
                    checked={experienceLevel === "standard"}
                    onChange={() => setExperienceLevel("standard")}
                    className="mr-2"
                  />
                  Standard
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="experienceLevel"
                    value="advanced"
                    checked={experienceLevel === "advanced"}
                    onChange={() => setExperienceLevel("advanced")}
                    className="mr-2"
                  />
                  Advanced
                </label>
              </div>
            </div>

            {/* Console Input */}
            <div className="mb-6">
              <label className="font-semibold block mb-2">Console Debug</label>
              <textarea
                value={consoleInput}
                onChange={(e) => setConsoleInput(e.target.value)}
                placeholder="Enter command here..."
                className="w-full p-2 border border-gray-300 rounded mb-2"
              />
              <button
                onClick={handleRunCommand}
                className="w-max bg-osu-beaver-orange hover:bg-osu-luminance text-white font-semibold py-1 px-2 border-gray-400 rounded"
              >
                RUN
              </button>
            </div>

            {/* About */}
            <div className="mt-6">
              <h2 className="font-semibold mb-2">About</h2>
              <div className="space-y-1 text-sm">
                <div><strong>App Name:</strong> {appName}</div>
                <div><strong>App Version:</strong> {appVersion}</div>
                <div><strong>Tauri Version:</strong> {tauriVersion}</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SettingsButtonBar saveDisabled={saveDisabled} savePaths={savePaths} />
    </div>
  );
}
