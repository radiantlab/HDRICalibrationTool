"use client";

import React from "react";

export default function SettingsPage() {
  return (
    <div className="bg-white text-black grid grid-cols-4 min-h-screen">
      <div className="col-span-1 bg-gray-300">
        <div className="pt-10 bg-gray-300 fixed left-0 w-1/4 h-full flex flex-col">
          <nav>
            <ul>
              <li className="pt-2 ml-5">
                <a href="#external_utilities">External Utilities</a>
              </li>
              <li className="pt-2 ml-5">
                <a href="#output_directory">Output Directory</a>
              </li>
            </ul>
          </nav>
          <div className="flex flex-col pt-24 gap-3 items-center">
            <button
              type="button"
              className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-4 border-gray-400 rounded"
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
          <h2 id="external_utilities" className="my-6 text-2xl">External Utilities</h2>
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
                className="flex-grow placeholder:text-right w-max shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
              ></input>
            </div>
          </div>
          <h2 id="output_directory" className="mt-6 mb-2 text-2xl">Output Directory</h2>
          <p className="mb-6 italic">
            Select the directory or type the path where the HDR images
            will be saved.
          </p>
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-col flex-grow space-y-2">
              <button
                aria-label="Select Directory for Output"
                className="w-max bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
              >
                Select Directory
              </button>
              <input
                id="outputPathTextbox"
                name="outputPathTextbox"
                type="text"
                className="placeholder:text-right w-full shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
              ></input>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}