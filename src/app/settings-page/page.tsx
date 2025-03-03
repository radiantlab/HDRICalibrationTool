"use client";

import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settings-store";
import { open } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";

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
        <h1 className="text-2xl font-bold mb-5">Settings</h1>
        <h2 id="external_utilities" className="my-6 text-2xl">
          External Utilities
        </h2>
        <div className="flex flex-col space-y-5">
          <div className="flex flex-row items-center justify-between">
            <label
              htmlFor="radiancePath"
              className="font-bold block h-full mr-5"
            >
              radiance path (bin)
            </label>
            <input
              id="radiancePath"
              name="radiancePath"
              type="text"
              value={localSettings.radiancePath}
              onChange={handleSettingsChange}
              className="flex-grow placeholder:text-right w-max shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
            ></input>
          </div>
          <div className="flex flex-row items-center justify-between">
            <label htmlFor="hdrgenPath" className="font-bold block h-full mr-5">
              hdrgen path
            </label>
            <input
              id="hdrgenPath"
              name="hdrgenPath"
              type="text"
              value={localSettings.hdrgenPath}
              onChange={handleSettingsChange}
              className="flex-grow placeholder:text-right w-max shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
            ></input>
          </div>
          <div className="flex flex-row items-center justify-between">
            <label
              htmlFor="dcrawEmuPath"
              className="font-bold block h-full mr-5"
            >
              dcraw_emu path
            </label>
            <input
              id="dcrawEmuPath"
              name="dcrawEmuPath"
              type="text"
              value={localSettings.dcrawEmuPath}
              onChange={handleSettingsChange}
              className="flex-grow placeholder:text-right w-max shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
            ></input>
          </div>
        </div>
        <h2 id="output_directory" className="mt-6 mb-2 text-2xl">
          Output Directory
        </h2>
        <p className="mb-6 italic">
          Select the directory or type the path where the HDR images will be
          saved.
        </p>
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col flex-grow space-y-2">
            <button
              aria-label="Select Directory for Output"
              onClick={dialog}
              className="w-max bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
            >
              Select Directory
            </button>
            <input
              id="outputPathTextbox"
              name="outputPathTextbox"
              type="text"
              value={localSettings.outputPath}
              onChange={(e) => handleUpdateOutputPath(e.target.value)}
              className="placeholder:text-right w-full shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
            ></input>
          </div>
        </div>
        <h2 id="usability" className="my-6 text-2xl">
          Usability Settings
        </h2>
        {/* Experience Level Section */}
        <div className="mb-5">
          <h2 className="text-xl font-semibold mb-2">Experience Level</h2>
          <div className="flex space-x-4">
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

        {/* Console Debug Section */}
        <div className="mb-5">
          <h2 className="text-xl font-semibold mb-2">Console Debug</h2>
          <textarea
            value={consoleInput}
            onChange={(e) => setConsoleInput(e.target.value)}
            placeholder="Enter command here..."
            className="w-full p-2 border border-gray-300 rounded mb-2"
          />
          <button
            onClick={handleRunCommand}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            RUN
          </button>
          <h2 id="about" className="my-6 text-2xl">
            About
          </h2>
          <div className="mb-5">
            <div className="flex flex-col space-y-2">
              <div>
                <span className="font-semibold">App Name:</span> {appName}
              </div>
              <div>
                <span className="font-semibold">App Version:</span> {appVersion}
              </div>
              <div>
                <span className="font-semibold">Tauri Version:</span>{" "}
                {tauriVersion}
              </div>
            </div>
          </div>
        </div>
      </main>
      <div className="fixed bottom-0 left-0 w-full bg-gray-300 flex justify-around py-4 border-t border-gray-400">
        <button
          type="button"
          className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-4 border-gray-400 rounded"
        >
          Clear Changes
        </button>
        <button
          type="button"
          className={`w-max font-semibold py-1 px-2 border-gray-400 rounded ${
            saveDisabled
              ? "bg-gray-400 text-gray-700 cursor-not-allowed"
              : "bg-osu-beaver-orange hover:bg-osu-luminance text-white"
          }`}
          onClick={savePaths}
          disabled={saveDisabled}
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
}
