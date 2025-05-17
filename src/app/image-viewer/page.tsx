"use client";

import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { basename } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/api/dialog";
import { Command } from "@tauri-apps/api/shell";
import { useSettingsStore } from "../stores/settings-store";

export default function ImageViewer() {
  const { settings } = useSettingsStore();
  // Dynamically read the output path from settings.
  const outputPath = settings.outputPath;

  const [error, setError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [imageFullPaths, setImageFullPaths] = useState<string[]>([]);

  useEffect(() => {
    async function loadFiles() {
      const files = await populateGrid(outputPath);
      const relative_files = await Promise.all(files.map(file => basename(file)));
      setSelectedImages(relative_files);
      setImageFullPaths(files);
    }
    loadFiles();
  }, [outputPath]);

  async function browseAndOpen() {
    setError(null);
    try {
      const files = await open({
        multiple: true, // allow selecting multiple files
        defaultPath: outputPath,
        filters: [{ name: "HDR Images", extensions: ["hdr"] }],
      });

      // files can be a string, an array of strings, or null.
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
    try {
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
    const entries = await invoke("read_dynamic_dir", { path: dir });
    const hdrPaths: string[] = [];

    async function collectFiles(entries: any[]) {
      for (const entry of entries) {
        if (entry.toLowerCase().endsWith(".hdr")) {
          hdrPaths.push(entry);
        }
      }
    }

    await collectFiles(entries as any);
    return hdrPaths;
  }

  return (
    <div className="bg-gray-300 text-black grid grid-cols-4 min-h-screen">
      <main className="bg-white col-span-4 m-8 mt-0 p-5 border-l border-r border-gray-400">
        <h2 className="text-2xl font-bold mb-6">Open HDR Image</h2>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <button
          className="w-max bg-osu-beaver-orange hover:bg-osu-luminance text-white font-semibold py-1 px-2 border-gray-400 rounded"
          onClick={browseAndOpen}
        >
          Browse HDR Image
        </button>
        {/* Render a grid of icons for each selected image */}
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
                  {/* Icon placeholder */}
                  <div className="w-12 h-12 bg-gray-200 flex items-center justify-center rounded">
                    <span className="text-lg font-bold">HDR</span>
                  </div>
                  {/* Display the filename */}
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