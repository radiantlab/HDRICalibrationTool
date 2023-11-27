"use client";

import React, { useState, ChangeEvent, useRef, useEffect } from "react";
import { open } from "@tauri-apps/api/dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";

const DEBUG = false;

export default function Home() {
  // Holds the file paths for the backend
  const [devicePaths, setDevicePaths] = useState<any[]>([]);

  // Holds the file paths for the frontend
  const [assetPaths, setAssetPaths] = useState<any[]>([]);


  // Holds the temporary device file paths selected by the user during the dialog function
  let selected: any | any[] = [];

  // Holds the temporary asset paths selected by the user during the dialog function
  let assets: any[] = [];

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

  const [images, setImages] = useState<File[]>([]);

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

  // const handleUploadClick = () => {
  //   invoke<string>("path", { name: "../../" })
  //     .then((result) => setPath(result))
  //     .catch(console.error);
  // };

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
      </div>
    </main>
  );
}
