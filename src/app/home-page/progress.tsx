import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useConfigStore } from "../stores/config-store";
import { open } from "@tauri-apps/api/shell";
import { convertFileSrc } from "@tauri-apps/api/tauri";
import { useSettingsStore } from "../stores/settings-store";

export default function Progress({ fakePipeline }: any) {
  const { progressButton, processError, showProgress, setConfig } = useConfigStore();
  const [progress, setProgress] = useState(0);
  const {settings} = useSettingsStore();

  function ResetProgress() {
    setConfig({
      progressButton: false,
      processError: false,
      showProgress: false,
    });
    setProgress(0);
  }

  const setProgressButton = (progress: boolean) => {
    setConfig({ progressButton: progress });
  };

  const setProcessError = (error: boolean) => {
    setConfig({ processError: error });
  };

  useEffect(() => {
    let unlisten: () => void;
    async function subscribe() {
      unlisten = await listen("pipeline-progress", (event: any) => {
        if (event.payload !== undefined) {
          setProgress(event.payload as number);
        }
      });
    }
    subscribe();
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return (
    <div>
      {showProgress && (
        <>
          {/* ----->  Taken from Tailwind CSS example: https://tailwindui.com/components/application-ui/overlays/dialogs */}
          <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <div className="bg-white border-2 border-black fixed w-6/12 max-h-[90vh] top-56 text-center text-xl p-10 overflow-auto">
                {/* <-----  */}
                <div className="mb-4">
                  <div className="text-lg font-semibold">Pipeline Progress</div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-4 border-gray-400">
                    <div
                      className="bg-osu-beaver-orange h-4 rounded-full"
                      style={{ width: `${progress}%`, transition: "width 0.5" }}
                      
                    ></div>
                  </div>
                </div>
                {fakePipeline && (
                  <div>
                    <button
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
                      onClick={() => setProgressButton(true)}
                    >
                      Process completed
                    </button>
                    <button
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded h-fit"
                      onClick={() => setProcessError(true)}
                    >
                      Error
                    </button>
                  </div>
                )}
                {!progressButton && !processError && (
                  <div>
                    <h2>Your Images Are Being Generated</h2>
                    <div>Please Wait For Process to Finish</div>
                  </div>
                )}
                {progressButton && !processError && (
                  <div>
                    <h2>Process Finished</h2>
                    <div>The final hdr image has been saved to:</div>
                    <p className="text-xs mt-5">{settings.outputPath}</p>
                    {/* <div>Please Check The Output Directory</div> */}
                    <button
                      onClick={() => ResetProgress()}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 mt-2 border-gray-400 rounded h-fit"
                    >
                      Okay
                    </button>
                  </div>
                )}
                {!progressButton && processError && (
                  <div>
                    <h2>Error</h2>
                    <p className=" text-sm pt-1">
                      There was an error with the pipeline. Please make sure all
                      the inputs are correct, and that you have entered the
                      paths for the HDRGen and dcraw_emu binaries in the
                      settings.
                    </p>
                    <button
                      onClick={() => ResetProgress()}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 m-10 border-gray-400 rounded h-fit"
                    >
                      Okay
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
