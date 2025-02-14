import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Paths } from "./string_functions";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Extensions } from "./string_functions";

export default function Images({
    devicePaths,
    setDevicePaths
}: any) {
    const DEBUG = true;
    const valid_extensions = [
        "jpg", "jpeg", "3fr", "ari", "arw", "bay", "braw", "crw", "cr2", "cr3", "cap", "data",
        "dcs", "dcr", "dng", "drf", "eip", "erf", "fff", "gpr", "iiq", "k25", "kdc", "mdc", "mef",
        "mos", "mrw", "nef", "nrw", "obm", "orf", "pef", "ptx", "pxn", "r3d", "raf", "raw", "rwl",
        "rw2", "rwz", "sr2", "srf", "srw", "tif", "tiff", "x3f",
    ];

    // Represents the value of the checkbox for whether user wants to select directories instead of images
    const [directorySelected, setDirectorySelected] = useState<boolean>(false);
    // Holds the file paths for the frontend
    const [assetPaths, setAssetPaths] = useState<any[]>([]);
    const [images, setImages] = useState<File[]>([]);
    // Holds the temporary device file paths selected by the user during the dialog function
    let selected: any | any[] = [];
    // Holds the temporary asset paths selected by the user during the dialog function
    let assets: any[] = [];
    // Error checking display
    const [image_error, set_image_error] = useState<boolean>(false);

    const [rawImagesSelected, setRawImagesSelected] = useState<boolean>(false);

    // Open a file dialog window using the tauri api and update the images array with the results
    async function dialog() {
        if (directorySelected == true) {
            selected = await open({
                multiple: true,
                directory: true,
            });
        } else {
            selected = await open({
                multiple: true
            });
        }
        if (Array.isArray(selected)) {
            set_image_error(false)
            let valid = false
            for (let i = 0; i < selected.length; i++) {
                for (let j = 0; j < valid_extensions.length; j++) {
                    if (Extensions(selected[i]).toLowerCase() == valid_extensions[j]) {
                        valid = true
                    }
                }
                if (valid) {
                    assets = assets.concat(convertFileSrc(selected[i]))
                } else {
                    set_image_error(true)
                }
            }
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
    };

    function reset() {
        setImages([]);
        setDevicePaths([]);
        setAssetPaths([]);
        set_image_error(false);
    };

    function directory_checked() {
        setDirectorySelected((prev: any) => !prev);
        reset();
    };

    // Update flag for whether raw images are selected (to determine whether to show image previews)
    useEffect(() => {
        setRawImagesSelected(false)
        for (let i = 0; i < images.length; i++) {
            const ext = Extensions(String(images[i])).toLowerCase()
            if (ext !== "jpeg" && ext !== "jpg" && ext !== "tif" && ext !== "tiff") {
                setRawImagesSelected(true)
            }
        }
    }, [images])

    return (
        <div>
            <button
                onClick={reset}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
            >
                Delete Images/Directories
            </button>
            <h2 className="font-bold pt-5" id="image_selection">
                Image Selection
            </h2>
            {image_error && !directorySelected && <div>Please only enter valid image types: jpg, jpeg, tif, tiff, or raw image formats</div>}
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
            {directorySelected || rawImagesSelected ? (
                <div>
                    {directorySelected && <div>Directory count: {devicePaths.length}</div>}
                    {rawImagesSelected && <div>Image count: {devicePaths.length}</div>}
                    <div className="directory-preview flex flex-wrap flex-col">
                        {devicePaths.map((path: any, index: any) => (
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
                </div>
            ) : (
                <div>
                    <div>Image count: {images.length}</div>
                    <div className="image-preview flex flex-wrap">
                        {images.map((image: any, index: any) => (
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
                </div>
            )}
        </div>
    )
}
