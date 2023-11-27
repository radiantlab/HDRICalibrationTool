"use client";

import React, { useState, ChangeEvent, useRef, useEffect } from "react";
import { open } from "@tauri-apps/api/dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";

export default function Home() {
  // Holds the device file paths selected by the user during the dialog function - to be used by the backend
  let selected: any | any[] = [];

  // Holds the asset paths selected by the user - to be used by the frontend
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
    } else if (selected === null) {
      // user cancelled the selection
    } else {
      // user selected a single file
      assets[0] = convertFileSrc(selected);
      setImages(images.concat(assets));
    }
    console.log("selected: ", selected);
    console.log("assets: ", assets);
  }

  const [images, setImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // const [path, setPath] = useState("");

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedImages = Array.from(event.target.files as FileList);
    setImages(images.concat(selectedImages));
  };

  const handleImageDelete = (index: number) => {
    const updatedImages = images.slice();
    updatedImages.splice(index, 1);
    setImages(updatedImages);
  };

  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

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
        <input
          type="file"
          accept=".jpg, .jpeg"
          multiple
          onChange={handleImageSelect}
          ref={fileInputRef}
          className="hidden"
        />
        {/* <button
          onClick={handleClick}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Select Files
        </button> */}
        {/* <button
          onClick={handleUploadClick}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Upload Files
        </button> */}
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
