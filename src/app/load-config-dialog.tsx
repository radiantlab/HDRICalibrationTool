import { useEffect, useState } from "react";

// Modal used for loading a saved configuration
export default function LoadConfigDialog({ setConfig, toggleDialog }: any) {
  const defaultSelectMessage = "-- select a config --";

  const [configName, setConfigName] = useState<string>(defaultSelectMessage);
  const [showError, setShowError] = useState<boolean>(false);

  // // Loads configuration to localStorage with the specified name
  function handleLoadConfig() {
    // If the user did not make a choice and left default option selected, show error
    if (configName == defaultSelectMessage) {
      setShowError(true);
    }
    // Otherwise look up the selected config
    else {
      let selectedConfig = savedConfigs.find(
        (config: any) => config.name === configName
      );

      // Load saved config and close dialog
      if (selectedConfig) {
        setConfig(selectedConfig);
        toggleDialog();
      }
    }
  }

  // Close modal and reset error message
  function handleCloseModal() {
    // setShowError(false);
    toggleDialog();
  }

  const [savedConfigs, setSavedConfigs] = useState<any>([]);
  useEffect(() => {
    setSavedConfigs(JSON.parse(localStorage.getItem("configs") || "[]"));
  }, []);

  return (
    <>
      {/* ----->  Taken from Tailwind CSS example: https://tailwindui.com/components/application-ui/overlays/dialogs */}
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          {/* <-----  */}
          <div className="border border-black shadow-2xl bg-white p-10">
            {/* <h1 className="font-bold text-4xl text-center mt-10">Save Configuration</h1> */}
            <div>
              <h2 className="font-bold pr-5 mb-10 border-b-2 border-b-gray-900 w-fit pb-2 text-2xl">
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
                    defaultValue={defaultSelectMessage}
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
                      You must select a configuration to load.
                    </p>
                  )}
                </div>
              </div>
              <div>
                <button
                  type="button"
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
                  onClick={handleLoadConfig}
                >
                  Load
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
