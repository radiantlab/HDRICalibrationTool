/**
 * Images Component for the HDRI Calibration Tool.
 * 
 * This component handles the selection and management of input images for HDR processing.
 * It provides UI for:
 * - Selecting image files and directories
 * - Displaying selected images
 * - Managing response function files
 * - Validating file types and displaying errors
 * 
 * It integrates with the global configuration store to maintain state across the application.
 */
import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Paths } from "./string_functions";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Extensions } from "./string_functions";
import { useConfigStore } from "../stores/config-store";
import { readDir } from '@tauri-apps/plugin-fs';
import { FileEditor } from "./response-correction-files/file_editor"; 
import { EditingFileType } from "@/app/global-types";
import FileFieldRow from "./file-field-row";
import { useSettingsStore } from "../stores/settings-store";

/**
 * Component for managing image selection and related files
 * 
 * @returns React component with image selection interface
 */
export default function Images() {
  // Access global configuration
  const { devicePaths, responsePaths, setConfig } = useConfigStore();
  const { settings } = useSettingsStore();
  
  // State for file editor visibility
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);

  /**
   * Updates the device paths in global configuration
   * 
   * @param device - Array of image file paths
   */
  const setDevicePaths = (device: any) => {
    setConfig({ devicePaths: device });
  };
  
  /**
   * Updates the response function path in global configuration
   * 
   * @param response - Path to response function file
   */
  const setResponsePaths = (response: string) => {
    setConfig({ responsePaths: response });
  };

  /** Enable debug logging */
  const DEBUG = true;
  
  /**
   * List of valid image file extensions that the application can process
   * Includes JPEG/JPG and various RAW format extensions from different camera manufacturers
   */
  const valid_extensions = [
    // Common formats
    "jpg", "jpeg", "tif", "tiff",
    
    // RAW formats by manufacturer
    // Canon
    "crw", "cr2", "cr3",
    // Nikon 
    "nef", "nrw",
    // Sony
    "arw", "sr2", "srf",
    // Fujifilm
    "raf",
    // Olympus
    "orf", 
    // Pentax
    "pef", "ptx",
    // Panasonic/Leica
    "raw", "rw2", "rwl",
    // Samsung
    "srw",
    // Sigma
    "x3f",
    // Other camera manufacturers
    "3fr", "ari", "bay", "braw", "cap", "data", "dcs", "dcr", 
    "dng", "drf", "eip", "erf", "fff", "gpr", "iiq", "k25", 
    "kdc", "mdc", "mef", "mos", "mrw", "obm", "pxn", "r3d",
    "rwz"
  ];
  // State for managing file paths and UI state
  /** Paths to preview images */
  const [assetPaths, setAssetPaths] = useState<any[]>([]);
  /** Selected image files */
  const [images, setImages] = useState<File[]>([]);
  
  // Temporary variables used during file selection
  /** Temporary storage for selected device paths during file dialog */
  let selected: any | any[] = [];
  /** Temporary storage for selected asset paths during file dialog */
  let assets: any[] = [];
  
  // Error states
  /** Flag for image file errors */
  const [image_error, set_image_error] = useState<boolean>(false);
  /** Flag for directory errors */
  const [dirError, setDirError] = useState<boolean>(false);
  
  /** Flag indicating if RAW images are selected (affects UI behavior) */
  const [rawImagesSelected, setRawImagesSelected] = useState<boolean>(false);
  /**
   * Opens a file dialog to select image files
   * 
   * Uses the Tauri dialog API to open a file selection dialog filtered for supported image types.
   * Updates the component state with selected images and clears any previous errors.
   */
  async function file_dialog() {
    // Open file selection dialog with filter for supported image formats
    selected = await open({
      multiple: true,
      filters: [{
        name: 'Image',
        extensions: valid_extensions
      }]
    });
    
    // Process selected files
    if (Array.isArray(selected)) {
      // Clear any previous errors
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
      multiple: true
    });
    if (Array.isArray(selected)) {
      set_image_error(false);
      setDirError(false);
      let check = false;
      for (let k = 0; k < selected.length; k++) {
        let contents = await readDir(selected[k]);
        for (let i = 0; i < contents.length; i++) {
          if (valid_extensions.includes(Extensions(contents[i].name).toLowerCase())) {
            check = true;
            break;
          }
        }
        if (check) {
          setDevicePaths(devicePaths.concat([selected[k]]));
        } else {
          setDirError(true);
        }
      }
    }
    else if (selected != null) {
      set_image_error(false);
      setDirError(false);
      let check = false;
      let contents = await readDir(selected);
      for (let i = 0; i < contents.length; i++) {
        if (valid_extensions.includes(Extensions(contents[i].name).toLowerCase())) {
          check = true;
          break;
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
          Select Directories
        </button>
        {devicePaths.length > 0 && (
        <div>
          <button
            onClick={reset}
            className="bg-red-600 hover:bg-red-800 text-white font-semibold py-1 px-2 border-gray-400 rounded h-fit"
          >
            Delete All
          </button>
        </div>
      )}
      </div>
      {image_error && (
        <div>
          Please only enter valid image types: jpg, jpeg, tif, tiff, or raw
          image formats
        </div>
      )}
      {dirError && (
        <div>
          All entered directories must contain at least 1 valid image type: jpg, jpeg, tif, tiff, or raw
          image formats  
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