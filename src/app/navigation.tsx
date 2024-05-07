import React from "react"
import { useState, useEffect } from "react"
import SaveConfigDialog from "./save-config-dialog"
import LoadConfigDialog from "./load-config-dialog"
import Settings from "./settings"
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { appConfigDir, join } from "@tauri-apps/api/path"
import { readTextFile } from "@tauri-apps/api/fs"

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
    handleGenerateHDRImage,
    showProgress,
    fakePipeline,
    setProgressButton,
    setProcessError,
    progressButton,
    processError,
    ResetProgress
    
}: any) {
    const [showSaveConfigDialog, setShowSaveConfigDialog] = useState<boolean>(false);
    const [showLoadConfigDialog, setShowLoadConfigDialog] = useState<boolean>(false);
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [appVersion, setAppVersion] = useState<string>("");
    const [appName, setAppName] = useState<string>("");
    const [tauriVersion, setTauriVersion] = useState<string>("");
    const [configFilePath, setConfigFilePath] = useState<string>("")
    const [savedConfigs, setSavedConfigs] = useState<[]>()

    // Retrieves app name, app version, and tauri version from Tauri API
    useEffect(() => {
        async function fetchAppInfo() {
        setAppVersion(await getVersion());
        setAppName(await getName());
        setTauriVersion(await getTauriVersion());
        }

        async function getSavedConfigs() {
            let configFile = await join(await appConfigDir(), "configurations.json");
            let configFileData = JSON.parse(await readTextFile(configFile))
            setConfigFilePath(configFile)
            setSavedConfigs(configFileData)
        }

        fetchAppInfo();
        getSavedConfigs();
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
                    <h1 className="text-xl text h-max">{appName}</h1>
                    </div>
                    <ul>
                    <li className="font-bold pt-5 pl-5">Navigation</li>
                    <li className="pt-5 pl-5">
                        <a href="#image_selection">Image Selection</a>
                    </li>
                    <li className="pt-5 pl-5">
                        <a href="#response">Response File</a>
                    </li>
                    <li className="pt-5 pl-5">
                        <a href="#c_r_v">Cropping, Resizing, and View Settings</a>
                    </li>
                    <li className="pt-5 pl-5">
                        <a href="#v">Vignetting Correction</a>
                    </li>
                    <li className="pt-5 pl-5">
                        <a href="#nd">Neutral Density Correction</a>
                    </li>
                    <li className="pt-5 pl-5">
                        <a href="#cf">Calibration Factor Correction</a>
                    </li>
                    </ul>
                </nav>
                <div className="flex flex-col pt-10 pl-5 space-y-8">
                    <div className="space-y-3">
                    <button
                        onClick={() => setShowSaveConfigDialog((prev: any) => !prev)}
                        className="w-max bg-gray-700 hover:bg-gray-400 text-gray-300 font-semibold py-1 px-2 border-gray-400 rounded"
                    >
                        Save Configuration
                    </button>
                    {showSaveConfigDialog && (
                        <SaveConfigDialog
                        config={{
                            responsePaths: responsePaths,
                            fe_correctionPaths: fe_correctionPaths,
                            v_correctionPaths: v_correctionPaths,
                            nd_correctionPaths: nd_correctionPaths,
                            cf_correctionPaths: cf_correctionPaths,
                            diameter: viewSettings.diameter,
                            xleft: viewSettings.xleft,
                            ydown: viewSettings.ydown,
                            // xres: viewSettings.xres,
                            // yres: viewSettings.yres,
                            targetRes: viewSettings.targetRes,
                            vh: viewSettings.vh,
                            vv: viewSettings.vv,
                        }}
                        configFilePath={configFilePath}
                        savedConfigs={savedConfigs}
                        toggleDialog={() =>
                            setShowSaveConfigDialog(!showSaveConfigDialog)
                        }
                        />
                    )}
                    <button
                        onClick={() => setShowLoadConfigDialog(!showLoadConfigDialog)}
                        className="w-max bg-gray-700 hover:bg-gray-400 text-gray-300 font-semibold py-1 px-2 border-gray-400 rounded"
                    >
                        Load Configuration
                    </button>
                    {showLoadConfigDialog && (
                        <LoadConfigDialog
                        setConfig={setConfig}
                        savedConfigs={savedConfigs}
                        toggleDialog={() =>
                            setShowLoadConfigDialog(!showLoadConfigDialog)
                        }
                        />
                    )}
                    </div>
                    <button
                    className="w-max bg-gray-700 hover:bg-gray-400 text-gray-300 font-semibold py-1 px-2 border-gray-400 rounded"
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
                    className="w-max bg-gray-700 hover:bg-gray-400 text-gray-300 font-semibold py-1 px-2 border-gray-400 rounded"
                    >
                    Generate HDR Image
                    </button>
                </div>
                <div className="pb-3 pl-3 pt-3 text-xs flex-grow flex flex-col justify-end">
                    <p>App version: {appVersion}</p>
                    <p>Tauri version: {tauriVersion}</p>
                </div>
                </div>
                <div className="w-3/4 ml-auto pl-3">
                {showProgress && (
                    <div className="bg-gray-300 fixed w-6/12 h-56 top-56 text-center text-xl p-10">
                    {fakePipeline && (
                        <div>
                        <button
                            className="bg-gray-700 hover:bg-gray-400 text-gray-300 font-semibold py-1 px-2 border-gray-400 rounded"
                            onClick={() => setProgressButton(true)}
                        >
                            Process completed
                        </button>
                        <button
                            className="bg-gray-700 hover:bg-gray-400 text-gray-300 font-semibold py-1 px-2 border-gray-400 rounded"
                            onClick={() => setProcessError(true)}
                        >
                            Error
                        </button>
                        </div>
                    )}
                    {!progressButton && <h2>Your Images Are Being Generated</h2>}
                    {progressButton && !processError && (
                        <div>
                        <h2>Process Finished</h2>
                        <button
                            onClick={() => ResetProgress()}
                            className="bg-gray-700 hover:bg-gray-400 text-gray-300 font-semibold py-1 px-2 border-gray-400 rounded"
                        >
                            Okay
                        </button>
                        </div>
                    )}
                    {!progressButton && processError && (
                        <div>
                        <h2>Error</h2>
                        <button
                            onClick={() => ResetProgress()}
                            className="bg-gray-700 hover:bg-gray-400 text-gray-300 font-semibold py-1 px-2 border-gray-400 rounded"
                        >
                            Okay
                        </button>
                        </div>
                    )}
                </div>
            )}
            </div>
        </div>
    )
}
