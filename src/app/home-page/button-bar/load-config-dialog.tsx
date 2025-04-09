import { useEffect, useState } from "react";
import { useConfigStore } from "../../stores/config-store";
import { invoke } from "@tauri-apps/api/tauri";

// Modal used for loading a saved configuration
export default function LoadConfigDialog({
  // savedConfigs,
  // getSavedConfigs,
  toggleDialog,
}: any) {
  const { setConfig } = useConfigStore();

  const defaultSelectMessage = "-- select a configuration --";

  const [configName, setConfigName] = useState<string>(defaultSelectMessage);
  const [showError, setShowError] = useState<boolean>(false);
  const [savedConfigs, setSavedConfigs] = useState<[]>([]);

  useEffect(() => {
    const fetchConfigs = async () => {
      const json: string = await invoke("get_saved_configs");
      const configs = JSON.parse(json).configurations;
      setSavedConfigs(configs);
    }
    fetchConfigs();
  }, []);

  // Loads configuration with the specified name
  function handleLoadConfig() {
    // If the user did not make a choice and left default option selected, show error
    if (configName == defaultSelectMessage) {
      setShowError(true);
    }
    // Otherwise look up the selected config
    else {
      let selectedConfig: any = savedConfigs.find(
        (config: any) => config.name === configName
      );

      // Load saved config and close dialog
      if (selectedConfig) {
        setConfig({
          responsePaths: selectedConfig.response_paths,
          fe_correctionPaths: selectedConfig.fe_correction_paths,
          v_correctionPaths: selectedConfig.v_correction_paths,
          nd_correctionPaths: selectedConfig.nd_correction_paths,
          cf_correctionPaths: selectedConfig.cf_correction_paths,
          viewSettings: {
            diameter: selectedConfig.diameter,
            xleft: selectedConfig.xleft,
            ydown: selectedConfig.ydown,
            targetRes: selectedConfig.target_res,
            vh: selectedConfig.vh,
            vv: selectedConfig.vv,
          },
        });
        toggleDialog();
      }
    }
  }

  // Delete config and close dialog
  function handleDeleteConfig() {
    // If the user did not make a choice and left default option selected, show error
    if (configName == defaultSelectMessage) {
      setShowError(true);
    }
    // Otherwise delete the selected config
    else {
      invoke("delete_config", { configName: configName })
        .catch((error) => console.log(error));
      toggleDialog();
    }
  }

  // Close modal and reset error message
  function handleCloseModal() {
    // setShowError(false);
    toggleDialog();
  }

  return (
    <>
      {/* ----->  Taken from Tailwind CSS example: https://tailwindui.com/components/application-ui/overlays/dialogs */}
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          {/* <-----  */}
          <div className="border border-black shadow-2xl bg-white p-10">
            {/* <h1 className="font-bold text-4xl text-center mt-10">Save Configuration</h1> */}
            <div>
              <h2 className="font-bold w-fit mb-4 text-2xl">
                Load Configuration
              </h2>
              <div className="flex flex-row space-x-5">
                <div className="mb-4">
                  <p className="text-left max-w-lg">
                    Load a saved configuration for camera settings and
                    calibration files.
                  </p>
                  <p className="text-left text-sm py-5 max-w-lg">
                    Note: This will only load the saved paths to the calibration
                    files, so the configuration will not load correctly if the
                    files have been moved.
                  </p>
                  <label className="font-bold block mb-2">
                    Select the configuration:
                  </label>
                  <select
                    value={configName}
                    onChange={(e) => {
                      setConfigName(e.target.value);
                    }}
                  >
                    <option value={defaultSelectMessage}>
                      {defaultSelectMessage}
                    </option>
                    {savedConfigs.map((config: any) => (
                      <option key={config.name} value={config.name}>
                        {config.name}
                      </option>
                    ))}
                  </select>
                  {showError && (
                    <p className=" text-red-600">
                      You must select a configuration.
                    </p>
                  )}
                </div>
              </div>
              <div className="space-x-5">
                <button
                  type="button"
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="bg-osu-beaver-orange hover:bg-osu-luminance text-white font-semibold py-1 px-2 border-gray-400 rounded"
                  onClick={handleLoadConfig}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="bg-red-700 hover:bg-red-900 text-white font-semibold py-1 px-2 border-gray-400 rounded"
                  onClick={handleDeleteConfig}
                >
                  Delete
                </button>
                <div className="pt-2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
