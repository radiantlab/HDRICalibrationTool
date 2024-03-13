import { useState } from "react";

// Modal used for saving the currently entered configuration to localStorage
export default function SaveConfigDialog({ config, toggleDialog }: any) {
  const [configName, setConfigName] = useState<string>("");
  const [showError, setShowError] = useState<boolean>(false);

  // Saves configuration to localStorage with the specified name
  async function saveConfig() {
    if (configName.trim() != "") {
      // If name field is not empty
      config["name"] = configName;
      let savedConfigs = JSON.parse(localStorage.getItem("configs") || "[]");

      // Search for existing config with this name
      let index = savedConfigs.findIndex((c: any) => c.name === configName);

      if (index != -1) {
        // If configuration already exists, confirm if user wants to overwrite it.
        let overwriteConfig = await confirm(
          `You already have a saved configuration with the name ${configName}. Do you want to overwrite this configuration?`
        );

        // User does not want to overwrite their previously saved config. Exit.
        if (!overwriteConfig) {
          return;
        }

        savedConfigs[index] = config;
      } else {
        savedConfigs.push(config);
      }
      localStorage.setItem("configs", JSON.stringify(savedConfigs));
      console.log(
        "Saved configs: ",
        JSON.parse(localStorage.getItem("configs") || "[]")
      );
      handleCloseModal();
    } else {
      // If name field is empty or contains only white space, show error message
      setShowError(true);
    }
  }

  // Close modal and reset error message
  function handleCloseModal() {
    setShowError(false);
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
              <h2 className="font-bold pr-5 mb-10 border-b-2 border-b-gray-900 w-fit pb-2 text-2xl">
                Save Configuration
              </h2>
              <div className="flex flex-row space-x-5">
                <div className="mb-4">
                  <p>
                    This will save the current configuration so it can be loaded
                    later.
                  </p>
                  <label className="font-bold block mb-2">Enter a name:</label>
                  <input
                    name="configName"
                    type="text"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                  ></input>
                  {showError && (
                    <p className=" text-red-600">
                      You must enter a name to save the configuration.
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
                  onClick={saveConfig}
                >
                  Save
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
