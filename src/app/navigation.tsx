import React from "react"
import { useState, useEffect } from "react"
import SaveConfigDialog from "./save-config-dialog"
import LoadConfigDialog from "./load-config-dialog"
import Settings from "./settings"
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/tauri"

export default function Navigation({
    responsePaths,
    fe_correctionPaths,
    v_correctionPaths,
    nd_correctionPaths,
    cf_correctionPaths,
    viewSettings,
    setConfig,
    settings,
    setSettings,
    handleSettingsChange,
    handleGenerateHDRImage
    
}: any) {
    const [showSaveConfigDialog, setShowSaveConfigDialog] = useState<boolean>(false);
    const [showLoadConfigDialog, setShowLoadConfigDialog] = useState<boolean>(false);
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [appVersion, setAppVersion] = useState<string>("");
    const [appName, setAppName] = useState<string>("");
    const [tauriVersion, setTauriVersion] = useState<string>("");
    const [savedConfigs, setSavedConfigs] = useState<[]>([]);

    
    // Loads the saved configurations from app config dir using a backend command
    async function getSavedConfigs() {
        const json: string = await invoke("get_saved_configs");
        const configs = JSON.parse(json).configurations;
        setSavedConfigs(configs);
    }

    useEffect(() => {
        // Retrieves app name, app version, and tauri version from Tauri API
        async function fetchAppInfo() {
        setAppVersion(await getVersion());
        setAppName(await getName());
        setTauriVersion(await getTauriVersion());
        }

        getSavedConfigs();
        fetchAppInfo();
    }, []);
    return(
        <div>
            <div className="pt-10 bg-gray-300 fixed left-0 w-1/4 h-full flex flex-col">
                <nav>
                    <div className="flex px-5 pb-5 items-center">
                    <img
                        src="SunApertureOrange.png"
                        className=" object-contain h-14 mr-3"
                    />
                    <h1 className="text-xl text h-max font-bold">{appName}</h1>
                    </div>
                    <ul>
                    <li className="font-bold pt-2 pl-5">Navigation</li>
                    <li className="pt-2 pl-5">
                        <a href="#image_selection">Image Selection</a>
                    </li>
                    <li className="pt-2 pl-5">
                        <a href="#response">Response File</a>
                    </li>
                    <li className="pt-2 pl-5">
                        <a href="#c_r_v">Cropping, Resizing, and View Settings</a>
                    </li>
                    <li className="pt-2 pl-5">
                        <a href="#v">Vignetting Correction</a>
                    </li>
                    <li className="pt-2 pl-5">
                        <a href="#nd">Neutral Density Correction</a>
                    </li>
                    <li className="pt-2 pl-5">
                        <a href="#cf">Calibration Factor Correction</a>
                    </li>
                    </ul>
                </nav>
                <div className="flex flex-col pt-24 pl-5 space-y-8">
                    <div className="space-y-3">
                    <button
                        onClick={() => setShowSaveConfigDialog((prev: any) => !prev)}
                        className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-4 border-gray-400 rounded"
                    >
                        Save Configuration
                    </button>
                    {showSaveConfigDialog && (
                        <SaveConfigDialog
                        config={{
                            response_paths: responsePaths,
                            fe_correction_paths: fe_correctionPaths,
                            v_correction_paths: v_correctionPaths,
                            nd_correction_paths: nd_correctionPaths,
                            cf_correction_paths: cf_correctionPaths,
                            diameter: viewSettings.diameter,
                            xleft: viewSettings.xleft,
                            ydown: viewSettings.ydown,
                            // xres: viewSettings.xres,
                            // yres: viewSettings.yres,
                            target_res: viewSettings.targetRes,
                            vh: viewSettings.vh,
                            vv: viewSettings.vv,
                        }}
                        savedConfigs={savedConfigs}
                        setSavedConfigs={setSavedConfigs}
                        toggleDialog={() =>
                            setShowSaveConfigDialog(!showSaveConfigDialog)
                        }
                        />
                    )}
                    <div></div>
                    <button
                        onClick={() => setShowLoadConfigDialog(!showLoadConfigDialog)}
                        className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-4 border-gray-400 rounded"
                    >
                        Load Configuration
                    </button>
                    {showLoadConfigDialog && (
                        <LoadConfigDialog
                        setConfig={setConfig}
                        savedConfigs={savedConfigs}
                        getSavedConfigs={getSavedConfigs}
                        toggleDialog={() =>
                            setShowLoadConfigDialog(!showLoadConfigDialog)
                        }
                        />
                    )}
                    </div>
                    <button
                    className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-14 border-gray-400 rounded"
                    onClick={() => setShowSettings(!showSettings)}
                    >
                    Settings
                    </button>
                    {showSettings && (
                    <Settings
                        settings={settings}
                        setSettings={setSettings}
                        handleChange={handleSettingsChange}
                        toggleDialog={() => setShowSettings(!showSettings)}
                    />
                    )}
                    <button
                    onClick={handleGenerateHDRImage}
                    className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-2 border-gray-400 rounded"
                    >
                    Generate HDR Image
                    </button>
                </div>
                <div className="pb-3 pl-3 pt-3 text-xs flex-grow flex flex-col justify-end">
                    <p>App version: {appVersion}</p>
                    <p>Tauri version: {tauriVersion}</p>
                </div>
                </div>
        </div>
    )
}
