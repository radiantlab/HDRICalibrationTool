import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/api/dialog";
import { Paths } from "./string_functions";
import { convertFileSrc } from "@tauri-apps/api/tauri";

export default function Images({
    devicePaths,
    setDevicePaths
}: any) {
    const DEBUG = true;

    // Represents the value of the checkbox for whether user wants to select directories instead of images
    const [directorySelected, setDirectorySelected] = useState<boolean>(false);
    // Holds the file paths for the frontend
    const [assetPaths, setAssetPaths] = useState<any[]>([]);
    const [images, setImages] = useState<File[]>([]);
    // Holds the temporary device file paths selected by the user during the dialog function
    let selected: any | any[] = [];
    // Holds the temporary asset paths selected by the user during the dialog function
    let assets: any[] = [];

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
    };

    function directory_checked() {
        setDirectorySelected((prev: any) => !prev);
        reset();
    };

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
                <div>
                    <div>Directory count: {devicePaths.length}</div>
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
