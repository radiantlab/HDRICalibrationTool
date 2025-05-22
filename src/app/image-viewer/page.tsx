"use client";

import React, { useEffect, useState } from "react";
import { useSettingsStore } from "../stores/settings-store";
export const dynamic = "force-dynamic";

export default function ImageViewer() {
  const { settings } = useSettingsStore();
  const outputPath = settings.outputPath;

  const [error, setError] = useState<string | null>(null);
  const [isWindows, setIsWindows] = useState<boolean>(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [imageFullPaths, setImageFullPaths] = useState<string[]>([]);

  useEffect(() => {
    async function loadFiles() {
      // Dynamically import os and basename from Tauri.
      const os = await import("@tauri-apps/api/os");
      const platform: string = await os.platform();
      const files = await populateGrid(outputPath);
      const { basename } = await import("@tauri-apps/api/path");
      const relative_files = await Promise.all(files.map(file => basename(file)));
      setSelectedImages(relative_files);
      setImageFullPaths(files);
      if (platform === "win32") setIsWindows(true);
    }
    loadFiles();
  }, [outputPath]);

  async function browseAndOpen() {
    setError(null);
    try {
      // Dynamically import open from Tauri.
      const { open } = await import("@tauri-apps/api/dialog");
      const files = await open({
        multiple: true,
        defaultPath: outputPath,
        filters: [{ name: "HDR Images", extensions: ["hdr"] }],
      });
      if (files) {
        const images = Array.isArray(files) ? files : [files];
        console.log("Selected HDR images:", images);
        setSelectedImages((prev) => [...prev, ...images]);
      } else {
        console.log("No file selected.");
      }
    } catch (err) {
      console.error("Error during file selection:", err);
      setError("Failed to select an HDR image.");
    }
  }

  async function launchXimage(imagePath: string) {
    if (isWindows) return; // silently return on Windows
    try {
      // Dynamically import Command from Tauri.
      const { Command } = await import("@tauri-apps/api/shell");
      const cmd = new Command("ximage", [
        "-g",
        "2.2",
        "-e",
        "auto",
        imagePath,
      ]);
      await cmd.spawn();
      console.log("ximage launched for:", imagePath);
    } catch (spawnError) {
      console.error("Failed to spawn ximage for:", imagePath, spawnError);
      setError("Could not launch ximage.");
    }
  }

  async function populateGrid(dir: string): Promise<string[]> {
    try {
      // Dynamically import invoke from Tauri.
      const { invoke } = await import("@tauri-apps/api/tauri");
      const entries = await invoke("read_dynamic_dir", { path: dir });
      const hdrPaths: string[] = [];
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (typeof entry === "string" && entry.toLowerCase().endsWith(".hdr")) {
            hdrPaths.push(entry);
          }
        }
      }
      return hdrPaths;
    } catch (err) {
      console.error("Error reading directory:", err);
      return [];
    }
  }

  return (
    <div className="bg-gray-300 text-black grid grid-cols-4 min-h-screen">
      <main className="bg-white col-span-4 m-8 mt-0 p-5 border-l border-r border-b border-gray-400">
        {isWindows && (
          <label className="text-red-500">
            This feature is currently not supported on Windows
          </label>
        )}
        <h2 className="text-2xl font-bold mb-6">Open HDR Image</h2>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <button
          className="w-max bg-osu-beaver-orange hover:bg-osu-luminance text-white font-semibold py-1 px-2 border-gray-400 rounded"
          onClick={browseAndOpen}
        >
          Browse HDR Images
        </button>
        {selectedImages.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            {selectedImages.map((image, index) => {
              const imageName = image.split("/").pop();
              return (
                <div
                  key={index}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-2 rounded"
                  onClick={() => launchXimage(imageFullPaths[index])}
                >
                  <div className="w-12 h-12 bg-gray-200 flex items-center justify-center rounded">
                    <span className="text-lg font-bold">HDR</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{imageName}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}