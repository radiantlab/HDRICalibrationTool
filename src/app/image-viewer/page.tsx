/**
 * Image Viewer Component for the HDRI Calibration Tool.
 * 
 * This component allows users to browse and view HDR images from the file system.
 * It displays a grid of available HDR images in the output directory and offers
 * functionality to select and view these images using external viewers.
 * 
 * Note: The HDR viewing functionality is currently not supported on Windows platforms.
 */
"use client";

import React, { useEffect, useState } from "react";
import { useSettingsStore } from "../stores/settings-store";
import { invoke } from "@tauri-apps/api/core";
import { basename } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";

/**
 * Main Image Viewer component
 * 
 * @returns React component with image viewer interface
 */
export default function ImageViewer() {
  // Access global settings to get output path and platform information
  const { settings } = useSettingsStore();
  const outputPath = settings.outputPath;

  // Local state management
  const [error, setError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [evalglares, setEvalglares] = useState<(string | null)[]>([]);
  const [imageFullPaths, setImageFullPaths] = useState<string[]>([]);
  
  // Check if running on Windows (features limited on Windows)
  const isWindows = settings.osPlatform === "windows";
  /**
   * Load HDR image files from the output directory when outputPath changes
   */
  useEffect(() => {
    /**
     * Loads available HDR image files from the specified directory
     */
    async function loadFiles() {
      // Get the full paths of HDR files in the output directory
      const files = await populateGrid(outputPath);
      // Get all the associated evalglare values
      const evalglareValues: (string | null)[] = await Promise.all(files.map(
        async (file) => {
          try {
            return await invoke("read_header_value", {
              filePath: file,
              radiancePathString: settings.radiancePath,
              key: "EVALGLARE=",
            })
          } catch(error) {
            console.error(`ImageViewer: loadFiles: error getting evalglare value for file ${file}`);
            return null;
          }
        })
      );
      // Extract just the base filenames for display
      const relative_files = await Promise.all(files.map(file => basename(file)));
      // Update state with the file information
      setSelectedImages(relative_files);
      setEvalglares(evalglareValues);
      setImageFullPaths(files);
    }
    loadFiles();
  }, [outputPath]);
  /**
   * Opens a file browser dialog to select HDR images
   * 
   * Allows users to browse and select multiple HDR image files
   * Updates the selectedImages state with the chosen files
   */
  async function browseAndOpen() {
    setError(null);
    try {
      // Open file selection dialog
      const files = await open({
        multiple: true,
        defaultPath: outputPath,
        filters: [{ name: "HDR Images", extensions: ["hdr"] }],
      });
      
      if (files) {
        // Handle both single and multiple file selections
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
  /**
   * Launches the ximage viewer to display an HDR image
   * 
   * This function calls a Tauri command to display an HDR image using Radiance's ximage tool
   * Note: This functionality is not available on Windows platforms
   * 
   * @param imagePath - Full path to the HDR image file
   */
  async function launchXimage(imagePath: string) {
    // Early return on Windows as ximage isn't supported
    if (isWindows) return; 
    
    // Call the Tauri command to display the image using ximage
    await invoke("display_hdr_img", {
      radiancePath: settings.radiancePath, 
      imagePath: imagePath,
    })
      .catch((error: unknown) => {
        console.log(error);
        setError("Failed to open ximage");
      });
  }
  /**
   * Retrieves all HDR image files from a directory
   * 
   * Calls Tauri backend to read directory contents and filters for HDR files
   * 
   * @param dir - Directory path to search for HDR files
   * @returns Promise resolving to an array of HDR file paths
   */
  async function populateGrid(dir: string): Promise<string[]> {
    // Call Tauri backend to read directory contents
    try {
      const entries = await invoke<string[]>("read_dynamic_dir", { path: dir });
      const hdrPaths: string[] = [];
      
      // Filter entries for HDR files
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (typeof entry === "string" && entry.toLowerCase().endsWith(".hdr")) {
            hdrPaths.push(entry);
          }
        }
      }
      return hdrPaths;
    } catch (error) {
      console.error(`ImageViewer: populateGrid: error getting hdr files: ${error}`);
      return [];
    }
  }
  return (
    <div className="bg-gray-300 text-black grid grid-cols-4 min-h-screen">
      <main className="bg-white col-span-4 m-8 mt-0 p-5 border-l border-r border-b border-gray-400">
        {/* Warning message for Windows users */}
        {isWindows && (
          <label className="text-red-500">
            This feature is currently not supported on Windows
          </label>
        )}
        
        <h2 className="text-2xl font-bold mb-6">Open HDR Image</h2>
        
        {/* Error message display if present */}
        {error && <div className="text-red-500 mb-4">{error}</div>}
        
        {/* Button to browse for HDR images */}
        <button
          className="w-max bg-osu-beaver-orange hover:bg-osu-luminance text-white font-semibold py-1 px-2 border-gray-400 rounded"
          onClick={browseAndOpen}
        >
          Browse HDR Images
        </button>        {/* Grid display of available HDR images */}
        {selectedImages.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            {/* Map through images to create clickable image items */}
            {selectedImages.map((image, index) => {
              // Extract just the filename from the path and the associated evalglare value
              const imageName = image.split("/").pop();
              const evalGlare = evalglares[index];
              return (
                <div
                  key={index}
                  className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-2 rounded"
                  onClick={() => launchXimage(imageFullPaths[index])}
                >
                  {/* Image thumbnail placeholder */}
                  <div className="w-12 h-12 bg-gray-200 flex items-center justify-center rounded">
                    <span className="text-lg font-bold">HDR</span>
                  </div>
                  {/* Image name display */}
                  <div>
                    <p className="text-m font-medium">File: {imageName}</p>
                    <p className="text-m font-medium">Evalglare: {evalGlare} lx</p>
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