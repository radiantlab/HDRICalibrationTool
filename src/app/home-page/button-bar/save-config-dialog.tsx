import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useConfigStore } from "../../stores/config-store";

// Modal used for saving the currently entered configuration to localStorage
export default function SaveConfigDialog({
  //savedConfigs,
  //setSavedConfigs,
  toggleDialog,
  loaded,
  setLoaded
}: any) {
  const [configName, setConfigName] = useState<string>("");
  const [showError, setShowError] = useState<boolean>(false);
  const [saveNew, setSaveNew] = useState<boolean>(!loaded); // flag to indicate whether user wants to save a new config or edit a loaded one

  const {
    viewSettings,
    responsePaths,
    fe_correctionPaths,
    v_correctionPaths,
    nd_correctionPaths,
    cf_correctionPaths,
    luminanceSettings,
  } = useConfigStore();

  async function getSavedConfigs(): Promise<any> {
      const json: string = await invoke("get_saved_configs");
      const configs = JSON.parse(json).configurations;
      return configs;
    }

  // Saves configuration to app's config directory using backend command
  async function saveConfig() {
    const config: any = {
      response_paths: responsePaths,
      fe_correction_paths: fe_correctionPaths,
      v_correction_paths: v_correctionPaths,
      nd_correction_paths: nd_correctionPaths,
      cf_correction_paths: cf_correctionPaths,
      diameter: viewSettings.diameter,
      xleft: viewSettings.xleft,
      ydown: viewSettings.ydown,
      target_res: viewSettings.targetRes,
      vh: viewSettings.vh,
      vv: viewSettings.vv,
      scale_limit: luminanceSettings.scale_limit,
      scale_label: luminanceSettings.scale_label,
      scale_levels: luminanceSettings.scale_levels,
      legend_dimensions: luminanceSettings.legend_dimensions,
    };

    const savedConfigs = await getSavedConfigs();
    const chosenName = saveNew ? configName : loaded;
    if (chosenName.trim() != "") {
      // If name field is not empty
      config["name"] = chosenName;

      // Search for existing config with this name
      let index = saveNew ? savedConfigs.findIndex((c: any) => c.name === configName) : -1;

      if (index != -1) {
        // If configuration already exists, confirm if user wants to overwrite it.
        let overwriteConfig = await confirm(
          `You already have a saved configuration with the name ${configName}. Do you want to overwrite this configuration?`
        );

        // User does not want to overwrite their previously saved config. Exit.
        if (!overwriteConfig) {
          return;
        }
      } 

      // Save configuration locally
      //setSavedConfigs(updatedSavedConfigs);

      // Save configuration to the file system for retrieval later
      invoke("save_config", config)
        .then((result) => {
          alert(result);
          console.log(result);
        })
        .catch((e) => {
          alert("An error occured while saving the configuration.");
          console.error(e);
        });

      setLoaded(chosenName);
      handleCloseModal();
    } else {
      // If name field is empty or contains only white space, show error message
      setShowError(true);
    }
  }

  // Close modal and reset error message
  function handleCloseModal() {
    setShowError(false);
    if (loaded) { setSaveNew(true) }
    toggleDialog();
  }

  return (
    <>
      {/* ----->  Taken from Tailwind CSS example: https://tailwindui.com/components/application-ui/overlays/dialogs */}
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          {/* <-----  */}
          <div className="border border-black shadow-2xl bg-white p-6">
            {/* <h1 className="font-bold text-4xl text-center mt-10">Save Configuration</h1> */}
            <div>
              <h2 className="font-bold my-4 w-fit text-2xl">
                Save Configuration
              </h2>
              <div className="flex flex-row space-x-5">
                <div className="mb-4">
                  <p className="text-left">
                    This will save the current configuration so it can be loaded
                    later.
                  </p>
                  <p className="text-left text-sm py-5 max-w-lg">
                    Note: This will only save paths to the calibration files, so
                    the configuration will not work correctly if the files are
                    moved.
                  </p>
                  {saveNew && <span>
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
                  </span>}
                  {!saveNew && <span>
                    <p className=" text-red-600 m-4">
                      Save changes to "{loaded}"?
                    </p>
                  </span>}
                </div>
              </div>
              <div className="space-x-5">
                <button
                  type="button"
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
                  onClick={() => !saveNew ? setSaveNew(!saveNew) : handleCloseModal()}
                >
                  {!saveNew ? "No" : "Cancel"}
                </button>
                <button
                  type="button"
                  className="bg-osu-beaver-orange hover:bg-osu-luminance text-white font-semibold py-1 px-2 border-gray-400 rounded"
                  onClick={saveConfig}
                >
                  {!saveNew ? "Save Changes" : "Save"}
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
