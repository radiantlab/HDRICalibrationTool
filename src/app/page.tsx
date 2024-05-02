"use client";

import React, { useState, ChangeEvent, useRef, useEffect } from "react";
import { open } from "@tauri-apps/api/dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
import CroppingResizingViewSettings from "./cropping-resizing-view-settings";
import Navigation from "./navigation";
import Response_and_correction from "./response_and_correction";
import { Paths } from "./string_functions";

const DEBUG = true;
const fakePipeline = false;

export default function Home() {
  // Get default binary paths to populate settings fields based on OS
  useEffect(() => {
    let osPlatform = "";

    // Make a call to the backend to get OS platform
    invoke<string>("query_os_platform", {})
      .then((platform: any) => {
        if (DEBUG) {
          console.log("OS platform successfully queried:", platform);
        }
        // Default path for macOS and Linux
        let defaultPath = "/usr/local/bin";
        // If platform is windows, update default path
        if (osPlatform === "windows") {
          defaultPath = "C:\\bin";
        }
        // Update settings
        setSettings({
          radiancePath: defaultPath,
          hdrgenPath: defaultPath,
          raw2hdrPath: defaultPath,
          outputPath: settings.outputPath,
        });
      })
      .catch(() => {
        console.error;
      });
  }, []);

  // Holds the fisheye coordinates and view settings
  const [viewSettings, setViewSettings] = useState({
    // xres: "",
    // yres: "",
    diameter: "",
    xleft: "",
    ydown: "",
    vv: "",
    vh: "",
    targetRes: "1000",
  });

  // DISPLAY STATES

  // to enable the progress set this to false
  const [progressButton, setProgressButton] = useState<boolean>(false);
  const [processError, setProcessError] = useState<boolean>(false);

  // PATH AND FILE INFORMATION

  // const [imgDirs, setImgDirs] = useState<any[]>([]);
  let imgDirs: any | any[] = [];
  // Represents the value of the checkbox for whether user wants to select directories instead of images
  const [directorySelected, setDirectorySelected] = useState<boolean>(false);
  // Holds the file paths for the backend
  const [devicePaths, setDevicePaths] = useState<any[]>([]);
  // Holds the file paths for the frontend
  const [assetPaths, setAssetPaths] = useState<any[]>([]);
  // Holds the temporary device file paths selected by the user during the dialog function
  let selected: any | any[] = [];
  // Holds the temporary asset paths selected by the user during the dialog function
  let assets: any[] = [];
  const [responsePaths, setResponsePaths] = useState<string>("");
  // Correction files fe = fish eye, v= vignetting, nd = neutral density, cf = calibration factor
  const [fe_correctionPaths, set_fe_correctionPaths] = useState<string>("");
  const [v_correctionPaths, set_v_correctionPaths] = useState<string>("");
  const [nd_correctionPaths, set_nd_correctionPaths] = useState<string>("");
  const [cf_correctionPaths, set_cf_correctionPaths] = useState<string>("");
  const [images, setImages] = useState<File[]>([]);

  const [showProgress, setShowProgress] = useState<boolean>(false);

  const [settings, setSettings] = useState({
    radiancePath: "",
    hdrgenPath: "",
    raw2hdrPath: "",
    outputPath: "/home/hdri-app/",
  });

  const handleSettingsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const updatedSettings = JSON.parse(JSON.stringify(settings));
    updatedSettings[event.currentTarget.name] = event.currentTarget.value;
    setSettings(updatedSettings);
  };

  // Reset progress
  function ResetProgress() {
    setShowProgress(false);
    setProgressButton(false);
    setProcessError(false);
  }

  // DIALOG FUNCTIONS

  // Open a file dialog window using the tauri api and update the images array with the results
  async function dialog() {
    if (directorySelected == true) {
      selected = await open({
        multiple: true,
        directory: true,
      });
    } else {
      selected = await open({
        multiple: true,
        filters: [
          {
            name: "Image",
            extensions: ["jpg", "jpeg", "JPG", "JPEG", "CR2"],
          },
        ],
      });
    }
    if (Array.isArray(selected)) {
      assets = selected.map((item: any) => convertFileSrc(item));
      setImages(images.concat(assets));
      setDevicePaths(devicePaths.concat(selected));
      setAssetPaths(assetPaths.concat(assets));
    } else if (selected === null) {
      // user cancelled the selection
    } else {
      // user selected a single file
      assets = [convertFileSrc(selected)];
      setImages(images.concat(assets));
      setDevicePaths(devicePaths.concat([selected]));
      setAssetPaths(assetPaths.concat(assets));
    }
    if (DEBUG) {
      console.log("Dialog function called.");
      console.log("selected: ", selected);
      console.log("assets: ", assets);
    }
  }

  // DELETE FUNCTIONS

  const reset = () => {
    setImages([]);
    setDevicePaths([]);
    setAssetPaths([]);
  };

  const directory_checked = () => {
    setDirectorySelected((prev) => !prev);
    reset();
  };

  const handleImageDelete = (index: number) => {
    const updatedImages = images.slice();
    const updatedDevicePaths = devicePaths.slice();
    const updatedAssetPaths = assetPaths.slice();
    updatedImages.splice(index, 1);
    updatedDevicePaths.splice(index, 1);
    updatedAssetPaths.splice(index, 1);
    setImages(updatedImages);
    setDevicePaths(updatedDevicePaths);
    setAssetPaths(updatedAssetPaths);
  };

  if (DEBUG) {
    useEffect(() => {
      console.log("Updated devicePaths: ", devicePaths);
    }, [devicePaths]);

    useEffect(() => {
      console.log("Updated assetPaths: ", assetPaths);
    }, [assetPaths]);
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

  // Hardcoded radiance and hdrgen paths for testing
  const fakeRadiancePath = "/usr/local/radiance/bin/";
  const fakeHdrgenPath = "/usr/local/bin/";
  // Hardcoded output path
  const fakeOutputPath = "../output/";

  // Calls the BE pipeline function with the input images the user
  // selected, and hardcoded data for the rest of the inputs
  const handleGenerateHDRImage = () => {
    // Progress
    setShowProgress(true);
    invoke<string>("pipeline", {
      radiancePath: settings.radiancePath,
      hdrgenPath: settings.hdrgenPath,
      raw2hdrPath: settings.raw2hdrPath,
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

  function setConfig(config: any) {
    setResponsePaths(config.responsePaths);
    set_fe_correctionPaths(config.fe_correctionPaths);
    set_v_correctionPaths(config.v_correctionPaths);
    set_nd_correctionPaths(config.nd_correctionPaths);
    set_cf_correctionPaths(config.cf_correctionPaths);
    setViewSettings({
      diameter: config.diameter,
      xleft: config.xleft,
      ydown: config.ydown,
      // xres: viewSettings.xres,
      // yres: viewSettings.yres,
      targetRes: config.targetRes,
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
          handleSettingsChange={handleSettingsChange}
          handleGenerateHDRImage={handleGenerateHDRImage}
          showProgress={showProgress}
          fakePipeline={fakePipeline}
          setProgressButton={setProgressButton}
          setProcessError={setProcessError}
          progressButton={progressButton}
          processError={processError}
          ResetProgress={ResetProgress} />
        <div className="w-3/4 ml-auto pl-3">
          <h1 className="font-bold pt-10">Configuration</h1>
          <button
            onClick={reset}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
          >
            Delete Images/Directories
          </button>
          <h2 className="font-bold pt-5" id="image_selection">
            Image Selection
          </h2>
          <div className="flex flex-row">
            <button
              onClick={dialog}
              className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
            >
              Select Files
            </button>
            <div className="flex flex-row items-center space-x-4 pl-20">
              <input
                type="checkbox"
                checked={directorySelected}
                onChange={directory_checked}
              />
              <label>Select directories</label>
            </div>
          </div>
          {directorySelected ? (
            <>
              <div>Directory count: {devicePaths.length}</div>
              <div className="directory-preview flex flex-wrap flex-col">
                {devicePaths.map((path, index) => (
                  <div
                    key={index}
                    className="directory-item flex flex-row space-x-3"
                  >
                    <p>{Paths(path)}</p>
                    <button onClick={() => handleImageDelete(index)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div>Image count: {images.length}</div>
              <div className="image-preview flex flex-wrap">
                {images.map((image, index) => (
                  <div key={index} className="image-item">
                    <div>
                      <img
                        src={String(image)}
                        alt={`Image ${index}`}
                        width={200}
                        height={200}
                      />
                      <button onClick={() => handleImageDelete(index)}>
                        Delete
                      </button>
                      <div>{image.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div id="c_r_v">
            <CroppingResizingViewSettings
              viewSettings={viewSettings}
              handleChange={handleViewSettingsChange}
            />
            <Response_and_correction
                  responsePaths = {responsePaths}
                  fe_correctionPaths = {fe_correctionPaths}
                  v_correctionPaths = {v_correctionPaths}
                  nd_correctionPaths = {nd_correctionPaths}
                  cf_correctionPaths = {cf_correctionPaths}
                  setResponsePaths = {setResponsePaths}
                  set_fe_correctionPaths = {set_fe_correctionPaths}
                  set_v_correctionPaths = {set_v_correctionPaths}
                  set_nd_correctionPaths = {set_nd_correctionPaths}
                  set_cf_correctionPaths = {set_cf_correctionPaths}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
