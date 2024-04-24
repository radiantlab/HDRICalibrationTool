import { open } from "@tauri-apps/api/dialog";

export default function Settings({
  settings,
  setSettings,
  handleChange,
  toggleDialog,
}: any) {
  // Open a file dialog window using the tauri api and update the output path in settings with user selection
  async function dialog() {
    let directory = await open({
      multiple: false,
      directory: true,
    });
    if (directory === null) {
      // user cancelled the selection
    } else {
      handleUpdateOutputPath(directory);
    }
  }

  // Update the output path of settings
  const handleUpdateOutputPath = (directory: any) => {
    const updatedSettings = JSON.parse(JSON.stringify(settings));
    updatedSettings["outputPath"] = directory;
    setSettings(updatedSettings);
  };

  return (
    <>
      {/* ----->  Taken from Tailwind CSS example: https://tailwindui.com/components/application-ui/overlays/dialogs */}
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          {/* <-----  */}
          <div className="border border-black shadow-2xl bg-white p-10">
            <h1 className="font-bold text-4xl text-center mt-10">Settings</h1>
            <div>
              <h2 className="font-bold pr-5 my-10 border-b-2 border-b-gray-900 w-fit pb-2 text-2xl">
                External Utilities Settings
              </h2>
              <div>
                <div className="flex flex-col space-y-5">
                  <div className="flex flex-row items-center justify-between">
                    <label
                      htmlFor="radiancePath"
                      className="font-bold block h-full mr-5"
                    >
                      Radiance Path (binary)
                    </label>
                    <input
                      id="radiancePath"
                      name="radiancePath"
                      type="text"
                      value={settings.radiancePath}
                      onChange={handleChange}
                      className="flex-grow placeholder:text-right w-max shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                    ></input>
                  </div>
                  <div className="flex flex-row items-center justify-between">
                    <label
                      htmlFor="hdrgenPath"
                      className="font-bold block h-full mr-5"
                    >
                      HDRgen Path
                    </label>
                    <input
                      id="hdrgenPath"
                      name="hdrgenPath"
                      type="text"
                      value={settings.hdrgenPath}
                      onChange={handleChange}
                      className="flex-grow placeholder:text-right w-max shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                    ></input>
                  </div>
                  <div className="flex flex-row items-center justify-between">
                    <label
                      htmlFor="raw2hdrPath"
                      className="font-bold block h-full mr-5"
                    >
                      raw2hdr Path
                    </label>
                    <input
                      id="raw2hdrPath"
                      name="raw2hdrPath"
                      type="text"
                      value={settings.raw2hdrPath}
                      onChange={handleChange}
                      className="flex-grow placeholder:text-right w-max shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                    ></input>
                  </div>
                  <div>
                    <p className="pb-2 pt-8">
                      Select the directory or type the path where the HDR images
                      will be saved.
                    </p>
                    <div className="flex flex-row items-center justify-between">
                      <label
                        htmlFor="outputPathTextbox"
                        className="font-bold block h-full mr-5"
                      >
                        Output Path
                      </label>
                      <div className="flex flex-col flex-grow space-y-2">
                        <button
                          aria-label="Select Directory for Output"
                          onClick={dialog}
                          className="w-max bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
                        >
                          Select Directory
                        </button>
                        <input
                          id="outputPathTextbox"
                          name="outputPathTextbox"
                          type="text"
                          value={settings.outputPath}
                          onChange={(e) => handleUpdateOutputPath(e.target.value)}
                          className="placeholder:text-right w-full shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
                        ></input>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* <h2 className="font-bold pr-5 mb-10 border-b-gray-900 border-b-2 w-fit pb-2 text-2xl">
                App Settings
              </h2> */}
              <div>
                {/* <div className="flex flex-row space-x-5 items-center">
                    <label className="block mb-2">Show Image Previews</label>
                    <input type="checkbox" defaultChecked={true}></input>
                </div> */}
              </div>
              <div className="pt-10">
                <button
                  type="button"
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
                  onClick={toggleDialog}
                >
                  Close
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
