/**
 * Initialization component for the HDRI Calibration Tool.
 * 
 * This component is responsible for setting up the application's initial state.
 * It queries the operating system platform, sets default paths based on the platform,
 * and loads saved binary paths from storage.
 */
"use client";

import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "./stores/settings-store"; 

// Debug flag to enable console logging
const DEBUG = true;

/**
 * Component that handles application initialization
 * It loads platform information and sets up default paths for the application
 */
const Initialization: React.FC = () => {
  const { setSettings } = useSettingsStore();

  useEffect(() => {
    let osPlatform = "";
    // Make a call to the backend to get OS platform and set Radiance path
    invoke<string>("query_os_platform", {})
      .then(async (platform: any) => {
        osPlatform = platform;
        if (DEBUG) {
          console.log("OS platform successfully queried:", platform);
        }
        // Default Radiance path for macOS and Linux
        let radianceDefaultPath = "/usr/local/radiance/bin";
        // If platform is windows, update default Radiance path
        if (osPlatform === "windows") {
          radianceDefaultPath = "C:\\Radiance\\bin";
        }        
        // Get the saved paths to binaries and update settings
        const contents = await invoke<string>("read_binary_paths", {});
        let contentsObject;
        if (contents) {
          // Parse the JSON response containing saved binary paths
          contentsObject = JSON.parse(contents);
        } else {
          // Set default empty values if no saved paths are found
          contentsObject = { hdrgenpath: "", dcrawemupath: "", outputpath: "", radiancepath: "", };
        }
        // Try and get the output path for application, error if something goes wrong because that really shouldn't happen
        let outputDefaultPath = "";
        try {
          outputDefaultPath = await invoke("get_default_output_path"); // queries backend for suggested place to store files
        } catch(error) {
          console.error("Initialization: could not get output path:", error);
          alert(
            "There was a problem setting up the default output path, please enter a path in the settings before generating HDR images."
          );
        }

        // Update the global settings store with all paths and platform information
        setSettings({
          radiancePath: (contentsObject.radiancepath === "" || !contentsObject.radiancepath) ? radianceDefaultPath : contentsObject.radiancepath,
          hdrgenPath: contentsObject.hdrgenpath,
          dcrawEmuPath: contentsObject.dcrawemupath,
          outputPath: (contentsObject.outputpath === "" || !contentsObject.outputpath) ? outputDefaultPath : contentsObject.outputpath, // queries backend for suggested place to store files
          osPlatform: osPlatform
        });
        // Show alert if HDRGen path is not set, which is required for operation
        if (!contentsObject.hdrgenpath) {
          alert(
            "Please enter the path to the HDRGen binary in the settings before generating HDR images."
          );
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }, [setSettings]);
  // This component doesn't render anything visible, it only performs initialization
  return null;
};

export default Initialization;