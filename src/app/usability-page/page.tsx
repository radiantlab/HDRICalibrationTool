"use client";

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
    <div className="bg-white text-black grid grid-cols-4 min-h-screen">
      <div className="col-span-1 bg-gray-300">
        {/* Empty div for the sidebar */}
      </div>
      <main className="col-span-3 p-4">
        <h1 className="text-2xl font-bold mb-5 pt-10">Usability Configuration</h1>

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

        {/* View Mode Section */}
        <div className="mb-5">
          <h2 className="text-xl font-semibold mb-2">View Mode</h2>
          <div className="flex space-x-4">
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
      </main>
    </div>
  );
}