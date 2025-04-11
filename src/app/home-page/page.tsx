"use client";

import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import Images from "./images";
import CroppingResizingViewSettings from "./cropping-resizing-view-settings";
import ButtonBar from "./button-bar/button-bar";
import Response_and_correction from "./config-files/response_and_correction";
import Progress from "./progress";
import { exists } from "@tauri-apps/api/fs";
import { useSettingsStore } from "../stores/settings-store";
import { useConfigStore } from "../stores/config-store";

const DEBUG = true;

const fakePipeline = false;

export default function Home() {
  const { settings } = useSettingsStore();

  const {
    viewSettings,
    devicePaths,
    responsePaths,
    fe_correctionPaths,
    v_correctionPaths,
    nd_correctionPaths,
    cf_correctionPaths,
    setConfig,
  } = useConfigStore();

  // HARD CODED PATHS FOR TESTING

  // Hardcoded radiance and hdrgen paths
  const fakeRadiancePath = "/usr/local/radiance/bin/";
  const fakeHdrgenPath = "/usr/local/bin/";
  // Hardcoded output path
  const fakeOutputPath = "../output/";

  // Calls the BE pipeline function with the input images the user
  // selected, and hardcoded data for the rest of the inputs
  const handleGenerateHDRImage = async () => {
    if (!(await missingImage())) {
      alert("Image files are not found");
      return;
    }

    const { isValid, missingInputs } = allInputsEntered();

    // Abort if no input images or directories are provided
    if (!isValid) {
      alert(
        "No input images or directories were provided. Please select at least one input image or directory to proceed."
      );
      return;
    }

    if (missingInputs.length > 0) {
      const proceed = await confirm(
        `The following inputs are missing:\n\n- ${missingInputs.join(
          "\n- "
        )}\n\nThe HDR image generation may be inaccurate or incomplete without these inputs. Do you want to proceed anyway?`
      );
      if (!proceed) {
        return; // Abort if the user chooses not to proceed
      }
    } else if (!responsePaths) {
      // If the user didn't select a response function,
      // display a warning that the output HDR image might be inaccurate if converting from JPEG
      // and ask for confirmation before proceeding with pipeline call
      let proceed = await confirm(
        "Warning: No response function selected. If you're converting JPEG images, the automatically generated response function may result in an inaccurate HDR image. Continue anyway?"
      );
      if (!proceed) {
        return;
      }
    } else if (viewSettings.vv !== viewSettings.vh) {
      let proceed = await confirm(
        "Warning: vv (Vertical Angle) and vh (Horizontal Angle) values do not match. Continue anyway?"
      );
      if (!proceed) {
        return;
      }
    }

    // Progress
    setConfig({ showProgress: true });

    // Call pipeline
    invoke<string>("pipeline", {
      radiancePath: settings.radiancePath,
      hdrgenPath: settings.hdrgenPath,
      dcrawEmuPath: settings.dcrawEmuPath,
      outputPath: settings.outputPath,
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
    })
      .then((result: any) => console.log("Process finished. Result: ", result))
      .then(() => {
        if (!fakePipeline) {
          setConfig({ progressButton: true });
        }
      })
      .catch((error: any) => {
        console.error;
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

    if (!responsePaths) missingInputs.push("Response path file");
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
    if (!viewSettings.targetRes)
      missingInputs.push(
        "Target resolution in Cropping, Resizing, and View Settings"
      );
    if (!viewSettings.vh)
      missingInputs.push(
        "Horizontal angle in Cropping, Resizing, and View Settings"
      );
    if (!viewSettings.vv)
      missingInputs.push(
        "Vertical angle in Cropping, Resizing, and View Settings"
      );

    return {
      isValid: true,
      missingInputs,
    };
  }

  return (
    <div className="bg-gray-300 text-black grid grid-cols-4 min-h-screen">
      <main className="bg-white col-span-4 m-8 mt-0 p-5 mb-10 border-l border-r border-gray-400">
        {/* <h1 className="text-2xl font-bold mb-5">Image Configuration</h1> */}
        <Progress fakePipeline={fakePipeline} />
        <Images />
        <div id="c_r_v">
          <CroppingResizingViewSettings />
          <Response_and_correction />
        </div>
      </main>
      <ButtonBar handleGenerateHDRImage={handleGenerateHDRImage} />
    </div>
  );
}
