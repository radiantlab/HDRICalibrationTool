import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/api/dialog";
import { Paths } from "./string_functions";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { Extensions } from "./string_functions";
import { useConfigStore } from "../stores/config-store";
import { readDir } from '@tauri-apps/api/fs';
import { FileEditor } from "./response-correction-files/file_editor"; 
import { EditingFileType } from "@/app/global-types";
import FileFieldRow from "./file-field-row";

export default function Images() {
  const { devicePaths, responsePaths, setConfig } = useConfigStore();
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);

  const setDevicePaths = (device: any) => {
    setConfig({ devicePaths: device });
  };
  
  const setResponsePaths = (response: string) => {
    setConfig({ responsePaths: response });
  };


  const DEBUG = true;
  const valid_extensions = [
    "jpg",
    "jpeg",
    "3fr",
    "ari",
    "arw",
    "bay",
    "braw",
    "crw",
    "cr2",
    "cr3",
    "cap",
    "data",
    "dcs",
    "dcr",
    "dng",
    "drf",
    "eip",
    "erf",
    "fff",
    "gpr",
    "iiq",
    "k25",
    "kdc",
    "mdc",
    "mef",
    "mos",
    "mrw",
    "nef",
    "nrw",
    "obm",
    "orf",
    "pef",
    "ptx",
    "pxn",
    "r3d",
    "raf",
    "raw",
    "rwl",
    "rw2",
    "rwz",
    "sr2",
    "srf",
    "srw",
    "tif",
    "tiff",
    "x3f",
  ];

  // Holds the file paths for the frontend
  const [assetPaths, setAssetPaths] = useState<any[]>([]);
  const [images, setImages] = useState<File[]>([]);
  // Holds the temporary device file paths selected by the user during the dialog function
  let selected: any | any[] = [];
  // Holds the temporary asset paths selected by the user during the dialog function
  let assets: any[] = [];
  // Error checking display
  const [image_error, set_image_error] = useState<boolean>(false);
  const [dirError, setDirError] = useState<boolean>(false);

  const [rawImagesSelected, setRawImagesSelected] = useState<boolean>(false);

  // Open a file dialog window using the tauri api and update the images array with the results 
  async function file_dialog() {
    selected = await open({
      multiple: true,
      filters: [{
        name: 'Image',
        extensions: valid_extensions
      }]
    });
    if (Array.isArray(selected)) {
      set_image_error(false);
      setDirError(false);
      let valid = false;
      for (let i = 0; i < selected.length; i++) {
        if ((valid_extensions.includes(Extensions(selected[i]).toLowerCase()))) {
          valid = true;
          assets = assets.concat(convertFileSrc(selected[i]));
        }
        else {
          set_image_error(true);
        }
      }
      setImages(images.concat(assets));
      setDevicePaths(devicePaths.concat(selected));
      setAssetPaths(assetPaths.concat(assets));
    } else if (selected !== null) {
      set_image_error(false);
      setDirError(false);
      if (valid_extensions.includes(Extensions(selected).toLowerCase())) {
        assets = [convertFileSrc(selected)];
        setImages(images.concat(assets));
        setDevicePaths(devicePaths.concat([selected]));
        setAssetPaths(assetPaths.concat(assets));
      } else {
        set_image_error(true);
      }
    }  

    if (DEBUG) {
      console.log("Dialog function called.");
      console.log("selected: ", selected);
      console.log("assets: ", assets);
    }
  }

  // Open file dialog window for directory selection
  async function dir_dialog() {
    selected = await open({
      directory: true,
    });
    if (selected != null) {
      set_image_error(false);
      setDirError(false);
      let check = false;
      let contents = await readDir(selected);
      for (let i = 0; i < contents.length; i++) {
        if (valid_extensions.includes(Extensions(contents[i].path).toLowerCase())) {
          check = true;
          break;
        }
        // See if input directory contains more LDR directories
        else  if (isDir(contents[i].path)) {
          let subContents = await readDir(contents[i].path);
          for (let j = 0; j < subContents.length; j++) {
            if (valid_extensions.includes(Extensions(subContents[j].path).toLowerCase())) {
              check = true;
              break;
            }
          }
          if (check) break;
        }
      }
      if (check) {
        assets = [convertFileSrc(selected)];
        setDevicePaths(devicePaths.concat([selected]));
        setAssetPaths(assetPaths.concat(assets));
      } else {
        setDirError(true);
      }
    }
    if (DEBUG) {
      console.log("Directory dialog function called.");
      console.log("selected: ", selected);
      console.log("assets: ", assets);
    }
  }

  function isDir(path: string) {
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i] == ".") {
        return false;
      }
      else if (path[i] == "/" || path[i] == "\\") {
        return true;
      }
    }
  }

  // Response file related state and functions
  const [response_error, set_response_error] = useState<boolean>(false);
  let response: any = "";
  
  async function dialogResponse() {
    response = await open({
      multiple: true,
    });
    if (response === null) {
      // user cancelled the selection
    } else {
      console.log("Extension " + Extensions(response[0]));
      set_response_error(false);
      if (Extensions(response[0]) !== "rsp") {
        set_response_error(true);
      } else {
        setConfig({ responsePaths: response[0] });
      }
    }
    if (DEBUG) {
      console.log("response: ", response);
    }
  }

  const handleResponseDelete = () => {
    setResponsePaths("");
  };

  if (DEBUG) {
    useEffect(() => {
      console.log("Updated devicePaths: ", devicePaths);
    }, [devicePaths]);

    useEffect(() => {
      console.log("Updated assetPaths: ", assetPaths);
    }, [assetPaths]);
  }

  function handleImageDelete(index: number) {
    const updatedImages = images.slice();
    const updatedDevicePaths = devicePaths.slice();
    const updatedAssetPaths = assetPaths.slice();
    updatedImages.splice(index, 1);
    updatedDevicePaths.splice(index, 1);
    updatedAssetPaths.splice(index, 1);
    setImages(updatedImages);
    setDevicePaths(updatedDevicePaths);
    setAssetPaths(updatedAssetPaths);
  }

  function reset() {
    setImages([]);
    setDevicePaths([]);
    setAssetPaths([]);
    set_image_error(false);
    setDirError(false);
  }

  // Update flag for whether raw images are selected (to determine whether to show image previews)
  useEffect(() => {
    setRawImagesSelected(false);
    for (let i = 0; i < images.length; i++) {
      const ext = Extensions(String(images[i])).toLowerCase();
      if (ext !== "jpeg" && ext !== "jpg" && ext !== "tif" && ext !== "tiff") {
        setRawImagesSelected(true);
      }
    }
  }, [images]);

  return (
    <div className="space-y-2">
      <h2 className="font-bold pt-5" id="image_selection">
        Image Selection
      </h2>
      <div className="flex flex-row gap-4">
        <button
          onClick={file_dialog}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
        >
          Select Files
        </button>
        <button
          onClick={dir_dialog}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
        >
          Select Directory
        </button>
      </div>
      {image_error && (
        <div>
          Please only enter valid image types: jpg, jpeg, tif, tiff, or raw
          image formats
        </div>
      )}
      {dirError && (
        <div>
          Could not find valid image types (jpg, jpeg, tif, tiff, or raw
          image formats) in any of the entered directories. 
        </div>
      )}
      {images.length > 0 && <div>Image count: {images.length}</div>}
      {devicePaths.length - images.length > 0 && <div>Directory count: {devicePaths.length - images.length}</div>}
      {devicePaths.length - images.length > 0 || rawImagesSelected ? (
        <div className="space-y-1">
          <div className="directory-preview flex flex-wrap flex-col">
            {devicePaths.map((path: any, index: any) => (
              <div
                key={index}
                className="directory-item flex flex-row space-x-3"
              >
                <p>{Paths(path)}</p>
                <button onClick={() => handleImageDelete(index)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="image-preview flex flex-wrap gap-2">
            {images.map((image: any, index: any) => (
              <div key={index} className="image-item">
                <div>
                  <img
                    src={String(image)}
                    alt={`Image ${index}`}
                    width={150}
                    height={150}
                  />
                  <button onClick={() => handleImageDelete(index)}>
                    Delete
                  </button>
                  <div>{image.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {devicePaths.length > 0 && (
        <div>
          <button
            onClick={reset}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
          >
            Delete All
          </button>
        </div>
      )}
      {/* Response File Field */}
      <h2 className="font-bold pt-5" id="fe">
        Response File
      </h2>
      <FileFieldRow
        label="Response File"
        value={responsePaths}
        onBrowse={dialogResponse}
        onClear={handleResponseDelete}
        onEdit={() => setIsEditorOpen(true)}
        errorMessage={response_error ? "Please only enter files ending in .rsp" : ""}
      />
      
      <FileEditor 
        filePath={responsePaths} 
        isOpen={isEditorOpen} 
        closeEditor={() => setIsEditorOpen(false)}
        editingFileType={EditingFileType.RESPONSE}
      />
    </div>
  );
}