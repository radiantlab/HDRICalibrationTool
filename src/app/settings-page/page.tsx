"use client";

import React, { useState } from "react";
import { useSettingsStore } from "../stores/SettingsStore";
import { open } from "@tauri-apps/api/dialog";
import { invoke } from "@tauri-apps/api/tauri";

export default function SettingsPage() {
  const { settings, setSettings } = useSettingsStore();
  const [saveDisabled, setSaveDisabled] = useState(true);
  const [experienceLevel, setExperienceLevel] = useState("standard");
  const [consoleInput, setConsoleInput] = useState("");

  // PLACEHOLDER FOR ACTUAL CONSOLE COMMAND
  const handleRunCommand = () => {
    console.log("Command:", consoleInput);
  };

  const handleSettingsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const updatedSettings = {
      ...settings,
      [event.currentTarget.name]: event.currentTarget.value,
    };
    setSettings(updatedSettings);
    setSaveDisabled(false);
  };

  const handleUpdateOutputPath = (directory: string) => {
    const updatedSettings = { ...settings, outputPath: directory };
    setSettings(updatedSettings);
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
    invoke("write_binary_paths", {
      hdrgenPath: settings.hdrgenPath,
      dcrawEmuPath: settings.dcrawEmuPath,
    }).catch(() => console.error);
    setSaveDisabled(true);
  };

  return (
    <div className="bg-white text-black grid grid-cols-4 min-h-screen">
      <div className="col-span-1 bg-gray-300">
        <div className="pt-10 bg-gray-300 fixed left-0 w-1/4 h-full flex flex-col">
          <div className="flex flex-col pt-24 gap-3 items-center">
            <button
              type="button"
              className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-4 border-gray-400 rounded"
              onClick={savePaths}
              disabled={saveDisabled}
            >
              Save
            </button>
            <button
              type="button"
              className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-4 border-gray-400 rounded"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      <main className="col-span-3 p-4">
        <h1 className="text-2xl font-bold mb-5 pt-10">Settings</h1>
        <div>
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
                value={settings.radiancePath}
                onChange={handleSettingsChange}
                className="flex-grow placeholder:text-right w-max shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
              ></input>
            </div>
            <div className="flex flex-row items-center justify-between">
              <label
                htmlFor="hdrgenPath"
                className="font-bold block h-full mr-5"
              >
                hdrgen path
              </label>
              <input
                id="hdrgenPath"
                name="hdrgenPath"
                type="text"
                value={settings.hdrgenPath}
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
                value={settings.dcrawEmuPath}
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
                value={settings.outputPath}
                onChange={(e) => handleUpdateOutputPath(e.target.value)}
                className="placeholder:text-right w-full shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
              ></input>
            </div>
          </div>
          <h2 id="external_utilities" className="my-6 text-2xl">
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
          </div>
        </div>
      </main>
    </div>
  );
}
