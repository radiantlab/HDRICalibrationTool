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
  const { 
    devicePaths, 
    responsePaths, 
    assetPaths,
    rawImagesSelected,
    setConfig 
  } = useConfigStore();
  const { settings } = useSettingsStore();
  
  // State for file editor visibility
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  
  // Error states
  const [image_error, set_image_error] = useState<boolean>(false);
  const [dirError, setDirError] = useState<boolean>(false);
  
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
  
  // Temporary variables used during file selection
  /** Temporary storage for selected device paths during file dialog */
  let selected: any | any[] = [];
  /** Temporary storage for selected asset paths during file dialog */
  let assets: any[] = [];
  
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
      // Update global store with new images
      setConfig({
        devicePaths: devicePaths.concat(selected),
        assetPaths: assetPaths.concat(assets)
      });
      // Check if any of the added images are RAW format
      checkForRawImages([...devicePaths, ...selected]);
    } else if (selected !== null) {
      set_image_error(false);
      setDirError(false);
      if (valid_extensions.includes(Extensions(selected).toLowerCase())) {
        assets = [convertFileSrc(selected)];
        setConfig({
          devicePaths: devicePaths.concat([selected]),
          assetPaths: assetPaths.concat(assets)
        });
        // Check if the added image is RAW format
        checkForRawImages([...devicePaths, selected]);
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
      console.log(selected);
      let contents = await readDir(selected);
      for (let i = 0; i < contents.length; i++) {
        if (valid_extensions.includes(Extensions(contents[i].name).toLowerCase())) {
          check = true;
          break;
        }
        // See if input directory contains more LDR directories
        // TODO: Fix pipeline to allow for such functionalities (misread batch processing)
        // else  if (contents[i].isDirectory) {
        //   let tst = "";
        //   if (settings.osPlatform === "windows") tst = selected + "\\" + contents[i].name;
        //   else tst = selected + "/" + contents[i].name;
        //   let subContents = await readDir(tst);
        //   for (let j = 0; j < subContents.length; j++) {
        //     if (valid_extensions.includes(Extensions(subContents[j].name).toLowerCase())) {
        //       check = true;
        //       break;
        //     }
        //   }
        //   if (check) break;
        // }
      }
      if (check) {
        assets = [convertFileSrc(selected)];
        setConfig({
          devicePaths: devicePaths.concat([selected]),
          assetPaths: assetPaths.concat(assets)
        });
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
    setConfig({ responsePaths: "" });
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
    const updatedDevicePaths = devicePaths.slice();
    const updatedAssetPaths = assetPaths.slice();
    updatedDevicePaths.splice(index, 1);
    updatedAssetPaths.splice(index, 1);
    
    setConfig({ 
      devicePaths: updatedDevicePaths,
      assetPaths: updatedAssetPaths
    });
    
    // Check if any remaining images are RAW format
    checkForRawImages(updatedDevicePaths);
  }

  function reset() {
    setConfig({
      devicePaths: [],
      assetPaths: [],
      rawImagesSelected: false
    });
    set_image_error(false);
    setDirError(false);
  }

  // Check if any images are in RAW format (to determine whether to show image previews)
  function checkForRawImages(paths: any[]) {
    let hasRawImages = false;
    for (let i = 0; i < paths.length; i++) {
      const ext = Extensions(String(paths[i])).toLowerCase();
      if (ext !== "jpeg" && ext !== "jpg" && ext !== "tif" && ext !== "tiff") {
        hasRawImages = true;
        break;
      }
    }
    setConfig({ rawImagesSelected: hasRawImages });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top section - Header and controls (25% height) */}
      <div className="flex-1">
        <div className="flex justify-between items-center">
          <h2 className="font-bold pt-5" id="image_selection">
            Image Selection
          </h2>
          {devicePaths.length > 0 && (
            <button
              onClick={reset}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold py-1 px-2 rounded h-fit"
            >
              Delete All
            </button>
          )}
        </div>
        
        <div className="flex flex-row gap-4 mt-2">
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
          <div className="text-red-500 mt-2">
            Please only enter valid image types: jpg, jpeg, tif, tiff, or raw
            image formats
          </div>
        )}
        {dirError && (
          <div className="text-red-500 mt-2">
            Could not find valid image types (jpg, jpeg, tif, tiff, or raw
            image formats) in any of the entered directories. 
          </div>
        )}
        
      </div>
      
      {/* Middle section - Image preview (50% height) */}
      <div className="flex-grow border border-gray-300 rounded-lg h-1/2 p-2 overflow-y-auto">
        {devicePaths.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 italic">No images selected.</p>
          </div>
        ) : (
          <div className="image-preview grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {assetPaths.map((image: any, index: any) => (
              <div key={index} className="relative">
                <div className="group rounded-lg overflow-hidden border border-gray-300 hover:border-gray-500">
                  <div className="relative">
                    <img
                      src={String(image)}
                      alt={`Image ${index}`}
                      className="w-full h-32 object-cover"
                    />
                    <button 
                      onClick={() => handleImageDelete(index)} 
                      className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-80 hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Bottom section - Response file field (25% height) */}
      <div className="flex-1 mt-4">
        <h2 className="font-bold pt-2" id="fe">
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
    </div>
  );
}