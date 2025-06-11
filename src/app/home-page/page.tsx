/**
 * Home Page Component for the HDRI Calibration Tool.
 * 
 * This component serves as the main page for configuring and generating HDR images.
 * It integrates various subcomponents for:
 * - Image selection
 * - View and cropping settings
 * - Response and correction files
 * - Luminance configuration
 * - Process control and execution
 * 
 * The component manages the main workflow for generating HDR images using the Tauri backend.
 */
"use client";

import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Images from "./images";
import CroppingResizingViewSettings from "./cropping-resizing-view-settings";
import LuminanceConfiguration from "./luminance-configuration";
import ButtonBar from "./button-bar/button-bar";
import Response_and_correction from "./response-correction-files/response_and_correction";
import Progress from "./progress";
import { exists } from "@tauri-apps/plugin-fs";
import { useSettingsStore } from "../stores/settings-store";
import { useConfigStore } from "../stores/config-store";

/** Enable debug logging */
const DEBUG = true;

/** Flag to use fake pipeline for testing */
const fakePipeline = false;

/**
 * Main Home page component for image configuration and processing
 * 
 * @returns React component with the main application interface
 */
export default function Home() {
  // Access application settings from global store
  const { settings } = useSettingsStore();

  // Access configuration state from global store
  const {
    viewSettings,         // Settings for cropping and view angle
    luminanceSettings,    // Settings for luminance visualization
    devicePaths,          // Paths to input image files
    responsePaths,        // Path to response function file
    fe_correctionPaths,   // Path to fisheye correction file
    v_correctionPaths,    // Path to vignetting correction file
    nd_correctionPaths,   // Path to neutral density correction file
    cf_correctionPaths,   // Path to calibration factor file
    filterImages,         // Flag to filter images or not
    setConfig,            // Function to update configuration
  } = useConfigStore();
  // HARD CODED PATHS FOR TESTING (used when fakePipeline is true)
  // These paths are only used for development and testing purposes

  /** Hardcoded path to Radiance binaries for testing */
  const fakeRadiancePath = "/usr/local/radiance/bin/";
  /** Hardcoded path to HDRGen binary for testing */
  const fakeHdrgenPath = "/usr/local/bin/";
  /** Hardcoded output path for testing */
  const fakeOutputPath = "../output/";

  /**
   * Handles the generation of HDR images
   * 
   * This function:
   * 1. Validates input files and settings
   * 2. Displays confirmation prompts for missing or problematic inputs
   * 3. Shows progress indicators
   * 4. Invokes the backend pipeline to process images
   */
  const handleGenerateHDRImage = async () => {
    // Check if image files exist
    if (!(await missingImage())) {
      alert("Image files are not found");
      return;
    }    // Check if all required inputs are provided
    const { isValid, missingInputs } = allInputsEntered();

    // Abort if no input images or directories are provided
    if (!isValid) {
      alert(
        "No input images or directories were provided. Please select at least one input image or directory to proceed."
      );
      return;
    }

    // If some optional inputs are missing, ask user for confirmation before proceeding
    if (missingInputs.length > 0) {
      const proceed = await confirm(
        `The following inputs are missing:\n\n- ${missingInputs.join(
          "\n- "
        )}\n\nThe HDR image generation may be inaccurate or incomplete without these inputs. Do you want to proceed anyway?`
      );
      if (!proceed) {
        return; // Abort if the user chooses not to proceed
      }
    } 
    
    // Warn about missing response function for JPEG images
    if (!responsePaths) {
      // If the user didn't select a response function,
      // display a warning that the output HDR image might be inaccurate if converting from JPEG
      // and ask for confirmation before proceeding with pipeline call
      let proceed = await confirm(
        "Warning: No response function selected. If you're converting JPEG images, the automatically generated response function may result in an inaccurate HDR image. Continue anyway?"
      );
      if (!proceed) {
        return;
      }
    }
    
    // Warn if vertical and horizontal view angles don't match
    if (viewSettings.vv !== viewSettings.vh) {
      let proceed = await confirm(
        "Warning: vv (Vertical Angle) and vh (Horizontal Angle) values do not match. Continue anyway?"
      );
      if (!proceed) {
        return;
      }
    }    // Show progress indicator
    setConfig({ showProgress: true });

    // Error if no output path exists
    if (settings.outputPath === "") {
      alert(
        "Error: no output path was given, please enter an output path in the settings"
      );
      return;
    }
    setConfig({ showProgress: true }); // show progress indicator

    // Call backend pipeline function with all parameters
    invoke<string>("pipeline", {
      // Paths to external tools
      radiancePath: settings.radiancePath,
      hdrgenPath: settings.hdrgenPath,
      dcrawEmuPath: settings.dcrawEmuPath,
      outputPath: settings.outputPath,
      
      // Input images and correction files
      inputImages: devicePaths,
      responseFunction: responsePaths,
      fisheyeCorrectionCal: fe_correctionPaths,
      vignettingCorrectionCal: v_correctionPaths,
      photometricAdjustmentCal: cf_correctionPaths,
      neutralDensityCal: nd_correctionPaths,
      diameter: viewSettings.diameter,
      xleft: viewSettings.xleft,
      ydown: viewSettings.ydown,
      xdim: viewSettings.targetRes,
      ydim: viewSettings.targetRes,
      verticalAngle: viewSettings.vv,
      horizontalAngle: viewSettings.vh,
      scaleLimit: luminanceSettings.scale_limit,
      scaleLabel: luminanceSettings.scale_label,
      scaleLevels: luminanceSettings.scale_levels,
      legendDimensions: luminanceSettings.legend_dimensions,
      filterImages: filterImages,
    })
      .then((result: any) => {
        console.log("Process finished. Result: ", result);
        if (!fakePipeline) {
          setConfig({ progressButton: true, outputPath: result });
        }
      })
      // .then((result: any) => console.log("Process finished. Result: ", result))
      // .then(() => {
      //   if (!fakePipeline) {
      //     setConfig({ progressButton: true });
      //   }
      // })
      .catch((error: any) => {
        console.error(error);
        alert(error);   // not all returned errors are related to the dcraw_emu or hdrgen paths
        if (!fakePipeline) {
          setConfig({ processError: true });
        }
      });
  };

  async function missingImage() {
    if (devicePaths.length === 0) {
      return false;
    }

    // Check if all provided paths exist
    for (const path of devicePaths) {
      const isValid = await exists(path);
      if (!isValid) {
        console.error("File not found");
        return false; 
      }
    }
    return true;
  }

  function allInputsEntered() {
    const missingInputs = [];

    if (devicePaths.length === 0) {
      return {
        isValid: false,
        missingInputs: ["Input images or directories (this is required)"],
      };
    }

    if (!fe_correctionPaths) missingInputs.push("Fisheye correction file");
    if (!v_correctionPaths) missingInputs.push("Vignetting correction file");
    if (!cf_correctionPaths) missingInputs.push("Calibration factor file");
    if (!nd_correctionPaths)
      missingInputs.push("Neutral density correction file");
    if (!viewSettings.diameter)
      missingInputs.push("Diameter in Cropping, Resizing, and View Settings");
    if (!viewSettings.xleft)
      missingInputs.push(
        "x-left coordinate in Cropping, Resizing, and View Settings"
      );
    if (!viewSettings.ydown)
      missingInputs.push(
        "y-down coordinate in Cropping, Resizing, and View Settings"
      );
      
    // This loop isn't the prettiest, but because the luminance map is optional, we have to check that they input at least one value but
    // didn't input the others; no inputs is fine.
    let enteredSetting = false;
    let name = "";
    Object.entries(luminanceSettings).forEach(([key, value]) => {
      if (value)
        enteredSetting = true;
      if (!value && enteredSetting) {
        // Just formatting the message to not use the snake case key name
        name = key
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        missingInputs.push(
          `${name} in Settings for Falsecolor Luminance Map`
        );
      }
    });

    return {
      isValid: true,
      missingInputs,
    };
  }

  return (
    <div className="bg-gray-300 text-black grid grid-cols-4 min-h-screen">
      <main className="bg-white col-span-4 m-8 mt-0 p-5 border-l border-r border-gray-400">
        {/* Progress Bar */}
        <Progress fakePipeline={fakePipeline} />
        {/* Section 1 and 2 side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Section 1 */}
          <div className="border border-gray-300 rounded-lg p-4 px-6">
            <h2 className="flex items-center font-semibold mb-4 text-lg">
              <span className="bg-gray-400 text-white rounded-full w-6 h-6 flex items-center justify-center mr-2 text-sm">
                1
              </span>
              Image Selection & Preview
            </h2>
            <Images />
          </div>

          {/* Section 2 */}
          <div className="border border-gray-300 rounded-lg p-4">
            <h2 className="flex items-center font-semibold mb-4 text-lg">
              <span className="bg-gray-400 text-white rounded-full w-6 h-6 flex items-center justify-center mr-2 text-sm">
                2
              </span>
              Geometry of Fisheye View
            </h2>
            <CroppingResizingViewSettings />
          </div>
        </div>

        {/* Section 3 below */}
       <div className="border border-gray-300 rounded-lg p-4 px-6 mt-5">
          <h2 className="flex items-center font-semibold mb-4 text-lg">
            <span className="bg-gray-400 text-white rounded-full w-6 h-6 flex items-center justify-center mr-2 text-sm">
              3
            </span>
            Correction Files
          </h2>
          <Response_and_correction />
        </div>

        {/* Section 4 */}
        <div className="border border-gray-300 rounded-lg p-4 px-6 mt-5 mb-10">
          <h2 className="flex items-center font-semibold mb-4 text-lg">
            <span className="bg-gray-400 text-white rounded-full w-6 h-6 flex items-center justify-center mr-2 text-sm">
              4
            </span>
            Other
          </h2>
          <LuminanceConfiguration />
        </div>
      </main>

      <ButtonBar handleGenerateHDRImage={handleGenerateHDRImage} />
    </div>
  );
}
