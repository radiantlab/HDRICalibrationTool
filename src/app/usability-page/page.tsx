"use client"

import React, { useState } from "react";

export default function Usability() {
  const [experienceLevel, setExperienceLevel] = useState("standard");
  const [viewMode, setViewMode] = useState("normal");
  const [consoleInput, setConsoleInput] = useState("");

  // PLACEHOLDER FOR ACTUAL CONSOLE COMMAND
  const handleRunCommand = () => {
    console.log("Command:", consoleInput);
  };

  return (
    <div>
      <main  className="bg-white flex min-h-screen flex-col justify-between text-black">
        <h1 className="text-2xl font-bold mb-5 pt-10">Usability Configuration</h1>

        {/* Experience Level Section */}
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Experience Level</h2>
          <div className="flex gap-5">
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

        {/* View Mode Section */}
        <div className="mb-10">
          <h2 className="text-xl font-semibold mb-3">View Mode</h2>
          <div className="flex gap-5">
            <label className="flex items-center">
              <input
                type="radio"
                name="viewMode"
                value="normal"
                checked={viewMode === "normal"}
                onChange={() => setViewMode("normal")}
                className="mr-2"
              />
              Normal
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="viewMode"
                value="fisheye"
                checked={viewMode === "fisheye"}
                onChange={() => setViewMode("fisheye")}
                className="mr-2"
              />
              Fisheye
            </label>
          </div>
        </div>

        {/* Console Debug Section */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Console Debug</h2>
          <textarea
            value={consoleInput}
            onChange={(e) => setConsoleInput(e.target.value)}
            className="w-full h-40 p-2 border border-gray-300 rounded mb-3"
            placeholder="Enter command here..."
          />
          <button
            onClick={handleRunCommand}
            className="bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-2 px-4 border-gray-400 rounded"
          >
            RUN
          </button>
        </div>
      </main>
    </div>
  );
}