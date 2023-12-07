"use client";

import React, { useState, ChangeEvent, useRef, useEffect } from "react";
import { open } from "@tauri-apps/api/dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";

import CroppingResizingViewSettings from "./cropping-resizing-view-settings";
import { ResponseType } from "@tauri-apps/api/http";

const DEBUG = false;

export default function Home() {
  // Holds the fisheye coordinates and view settings
  const [viewSettings, setViewSettings] = useState({
    xres: "",
    yres: "",
    diameter: "",
    xleft: "",
    ydown: "",
    vv: "",
    vh: "",
    targetRes: "1000",
  });

  // Holds the file paths for the backend
  const [devicePaths, setDevicePaths] = useState<any[]>([]);

  // Holds the file paths for the frontend
  const [assetPaths, setAssetPaths] = useState<any[]>([]);

  // Holds the temporary device file paths selected by the user during the dialog function
  let selected: any | any[] = [];

  // Holds the temporary asset paths selected by the user during the dialog function
  let assets: any[] = [];

  let response: any | any[] = [];
  const [responsePaths, setResponsePaths] = useState<any[]>([]);

  let fe_correction: any | any[] = [];
  const [fe_correctionPaths, setfe_correctionPaths] = useState<any[]>([]);

  let v_correction: any | any[] = [];
  const [v_correctionPaths, setv_correctionPaths] = useState<any[]>([]);

  // Open a file dialog window using the tauri api and update the images array with the results
  async function dialog() {
    selected = await open({
      multiple: true,
      filters: [
        {
          name: "Image",
          extensions: ["jpg", "jpeg", "JPG", "JPEG"],
        },
      ],
    });
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

  async function dialogResponse() {
    response = await open({
      multiple: true})
    if (response === null) {
      // user cancelled the selection
    } else {
      // user selected a single file
      setResponsePaths(response);
    }
    if (DEBUG) {
      console.log("response: ", response);
    }
  }

  async function dialogFE() {
    fe_correction = await open({
      multiple: true})
    if (fe_correction === null) {
      // user cancelled the selection
    } else {
      // user selected a single file
      setfe_correctionPaths(fe_correction);
    }
    if (DEBUG) {
      console.log("fe_correction: ", fe_correction);
    }
  }

  async function dialogV() {
    v_correction = await open({
      multiple: true})
    if (v_correction === null) {
      // user cancelled the selection
    } else {
      // user selected a single file
      setv_correctionPaths(v_correction);
    }
    if (DEBUG) {
      console.log("v_correction: ", v_correction);
    }
  }

  const [images, setImages] = useState<File[]>([]);
  // const [paths, setPaths] = useState<File[]>([]);

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

  const handleResponseDelete = () => {
    const updatedResponsePaths = responsePaths.slice();
    updatedResponsePaths.splice(0, 1);
    setResponsePaths(updatedResponsePaths);
  };

  const handleFEDelete = () => {
    const updatedfe_correctionPaths = fe_correctionPaths.slice();
    updatedfe_correctionPaths.splice(0, 1);
    setfe_correctionPaths(updatedfe_correctionPaths);
  };

  const handleVDelete = () => {
    const updatedv_correctionPaths = v_correctionPaths.slice();
    updatedv_correctionPaths.splice(0, 1);
    setv_correctionPaths(updatedv_correctionPaths);
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

  // === Define hardcoded data for testing ===

  // Hardcoded radiance and hdrgen paths for testing
  const fakeRadiancePath = "/usr/local/radiance/bin/";
  const fakeHdrgenPath = "/usr/local/bin/";

  // Hardcoded camera response function path
  const fakeResponseFunction =
    "../examples/inputs/parameters/response_function_files/Response_function.rsp";

  // Hardcoded fisheye correction calibration file
  const fakeFisheyeCorrectionCal =
    "../examples/inputs/parameters/calibration_files/fisheye_corr.cal";

  // Hardcoded vignetting effect correction calibration file
  const fakeVignettingCorrectionCal =
    "../examples/inputs/parameters/calibration_files/vignetting_f5d6.cal";

  // Hardcoded output path
  const fakeOutputPath = "../output/";

  // Hardcoded temp path
  const fakeTempPath = "../tmp/";

  // Hardcoded fisheye diameter and coordinates of square around fisheye view
  // const fakeDiameter = "3612";
  // const fakeXleft = "1019";
  // const fakeYdown = "74";

  // Hardcoded HDR image resolution
  // const fakeXdim = "1000";
  // const fakeYdim = "1000";

  // Calls the BE pipeline function with the input images the user
  // selected, and hardcoded data for the rest of the inputs
  const handleGenerateHDRImage = () => {
    invoke<string>("pipeline", {
      radiancePath: fakeRadiancePath,
      hdrgenPath: fakeHdrgenPath,
      outputPath: fakeOutputPath,
      tempPath: fakeTempPath,
      inputImages: devicePaths,
      responseFunction: fakeResponseFunction,
      fisheyeCorrectionCal: fakeFisheyeCorrectionCal,
      vignettingCorrectionCal: fakeVignettingCorrectionCal,
      diameter: viewSettings.diameter,
      xleft: viewSettings.xleft,
      ydown: viewSettings.ydown,
      xdim: viewSettings.targetRes,
      ydim: viewSettings.targetRes,
    })
      .then((result) => console.log("Success. Result: ", result))
      .catch(console.error);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <h1>HDRICalibrationTool</h1>
      <div>
        <h2>Image Upload</h2>

        <button
          onClick={dialog}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Select Files
        </button>
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
                <button onClick={() => handleImageDelete(index)}>Delete</button>
                <div>{image.name}</div>
              </div>
            </div>
          ))}
        </div>
        <h2>Response Path Upload</h2>
        <button
          onClick={dialogResponse}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Select Response Files
        </button>
        <div>
          {responsePaths}
          <button onClick={() => handleResponseDelete()}>Delete Response File</button>
        </div>
        <h2>Fish Eye Correction Path Upload</h2>
        <button
          onClick={dialogFE}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Select Fish Eye Correction Files
        </button>
        <div>
          {fe_correctionPaths}
          <button onClick={() => handleFEDelete()}>Delete Fish Eye Correction File</button>
        </div>
        <h2>Vignetting Correction Path Upload</h2>
        <button
          onClick={dialogV}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Select Vignetting Correction Files
        </button>
        <div>
          {v_correctionPaths}
          <button onClick={() => handleVDelete()}>Delete Vignetting Correction File</button>
        </div>
        <CroppingResizingViewSettings handleChange={handleViewSettingsChange} />
        <button
          onClick={handleGenerateHDRImage}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Generate HDR Image
        </button>
      </div>
    </main>
  );
}
