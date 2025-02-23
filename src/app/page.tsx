"use client";

import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import Images from "./images";
import CroppingResizingViewSettings from "./cropping-resizing-view-settings";
import Navigation from "./navigation";
import Response_and_correction from "./response_and_correction";
import Progress from "./progress";
import { exists } from "@tauri-apps/api/fs";

const DEBUG = true;

const fakePipeline = false;

export default function Home() {
  // Get default binary paths to populate settings fields based on OS
  useEffect(() => {
    let osPlatform = "";
    // Make a call to the backend to get OS platform and set Radiance path
    invoke<string>("query_os_platform", {})
      .then(async (platform: any) => {
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
        if (contents) { contentsObject = JSON.parse(contents); }
        else { contentsObject = {hdrgenpath: "", dcrawemupath: "" }; }
        setSettings({
          radiancePath: radianceDefaultPath,
          hdrgenPath: contentsObject.hdrgenpath,
          dcrawEmuPath: contentsObject.dcrawemupath,
          outputPath: await invoke("get_default_output_path") // queries backend for suggested place to store files
        });
        if (!contentsObject.hdrgenpath || !contentsObject.dcrawemupath) 
          { alert("Please enter the paths to the HDRGen and dcraw_emu binaries in the settings before generating HDR images."); }
      })
      .catch(() => {
        console.error;
      });
  }, []);

  // Holds the fisheye coordinates and view settings
  const [viewSettings, setViewSettings] = useState({
    diameter: "",
    xleft: "",
    ydown: "",
    vv: "",
    vh: "",
    targetRes: "1000",
  });

  // display states
  const [progressButton, setProgressButton] = useState<boolean>(false);
  const [processError, setProcessError] = useState<boolean>(false);
  const [showProgress, setShowProgress] = useState<boolean>(false);

  // PATH AND FILE INFORMATION

  // const [imgDirs, setImgDirs] = useState<any[]>([]);
  let imgDirs: any | any[] = [];
  // Holds the file paths for the backend
  const [devicePaths, setDevicePaths] = useState<any[]>([]);
  const [responsePaths, setResponsePaths] = useState<string>("");
  // Correction files fe = fish eye, v= vignetting, nd = neutral density, cf = calibration factor
  const [fe_correctionPaths, set_fe_correctionPaths] = useState<string>("");
  const [v_correctionPaths, set_v_correctionPaths] = useState<string>("");
  const [nd_correctionPaths, set_nd_correctionPaths] = useState<string>("");
  const [cf_correctionPaths, set_cf_correctionPaths] = useState<string>("");

  const [settings, setSettings] = useState({
    radiancePath: "",
    hdrgenPath: "",
    dcrawEmuPath: "",
    outputPath: "",
  });

  // Used to disable the save button when no changes have been made to settings
  const [saveDisabled, setSaveDisabled] = useState(true)

  const handleSettingsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const updatedSettings = JSON.parse(JSON.stringify(settings));
    updatedSettings[event.currentTarget.name] = event.currentTarget.value;
    setSettings(updatedSettings);
    setSaveDisabled(false);
  };

  // Reset progress
  function ResetProgress() {
    setShowProgress(false);
    setProgressButton(false);
    setProcessError(false);
  }

  // Update view settings (for cropping, resizing, header editing)
  // when the user enters updates a number input
  const handleViewSettingsChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const updatedViewSettings = JSON.parse(JSON.stringify(viewSettings));
    updatedViewSettings[event.currentTarget.name] = event.currentTarget.value;
    setViewSettings(updatedViewSettings);
  };

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
    }

    // Progress
    setShowProgress(true);

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
          setProgressButton(true);
        }
      })
      .catch((error: any) => {
        console.error;
        if (!fakePipeline) {
          setProcessError(true);
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

  function setConfig(config: any) {
    setResponsePaths(config.response_paths);
    set_fe_correctionPaths(config.fe_correction_paths);
    set_v_correctionPaths(config.v_correction_paths);
    set_nd_correctionPaths(config.nd_correction_paths);
    set_cf_correctionPaths(config.cf_correction_paths);
    setViewSettings({
      diameter: config.diameter,
      xleft: config.xleft,
      ydown: config.ydown,
      targetRes: config.target_res,
      vh: config.vh,
      vv: config.vv,
    });
  }

  return (
    <main className="bg-white flex min-h-screen flex-col items-center justify-between text-black">
      <div>
        <Navigation
          responsePaths={responsePaths}
          fe_correctionPaths={fe_correctionPaths}
          v_correctionPaths={v_correctionPaths}
          nd_correctionPaths={nd_correctionPaths}
          cf_correctionPaths={cf_correctionPaths}
          viewSettings={viewSettings}
          setConfig={setConfig}
          settings={settings}
          setSettings={setSettings}
          saveDisabled={saveDisabled}
          setSaveDisabled={setSaveDisabled}
          handleSettingsChange={handleSettingsChange}
          handleGenerateHDRImage={handleGenerateHDRImage}
        />
        <div className="w-3/4 ml-auto pl-3">
          <h1 className="font-bold pt-10">Configuration</h1>
          <Progress
            showProgress={showProgress}
            fakePipeline={fakePipeline}
            setProgressButton={setProgressButton}
            setProcessError={setProcessError}
            progressButton={progressButton}
            processError={processError}
            ResetProgress={ResetProgress}
          />
          <Images devicePaths={devicePaths} setDevicePaths={setDevicePaths} />
          <div id="c_r_v">
            <CroppingResizingViewSettings
              viewSettings={viewSettings}
              handleChange={handleViewSettingsChange}
              setViewSettings={setViewSettings}
              devicePaths={devicePaths}
              dcrawEmuPath={settings.dcrawEmuPath}
            />
            <Response_and_correction
              responsePaths={responsePaths}
              fe_correctionPaths={fe_correctionPaths}
              v_correctionPaths={v_correctionPaths}
              nd_correctionPaths={nd_correctionPaths}
              cf_correctionPaths={cf_correctionPaths}
              setResponsePaths={setResponsePaths}
              set_fe_correctionPaths={set_fe_correctionPaths}
              set_v_correctionPaths={set_v_correctionPaths}
              set_nd_correctionPaths={set_nd_correctionPaths}
              set_cf_correctionPaths={set_cf_correctionPaths}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
