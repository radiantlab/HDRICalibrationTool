/**
 * Progress Component for the HDRI Calibration Tool.
 *
 * This component displays a progress modal during HDR image processing.
 * It listens for progress events from the backend pipeline and updates
 * the UI accordingly. It also handles error states and provides options
 * to dismiss or retry the process.
 */
import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useConfigStore } from "../stores/config-store";
import { useSettingsStore } from "../stores/settings-store";

/**
 * Props for the Progress component
 *
 * @property fakePipeline - Flag indicating if using a fake pipeline for testing
 */
interface ProgressProps {
  fakePipeline: boolean;
}

/**
 * Progress modal component shown during image processing
 *
 * @param props - Component props
 * @returns Modal component showing processing progress
 */
export default function Progress({ fakePipeline }: ProgressProps) {
  // Access global configuration
  const { progressButton, processError, showProgress, setConfig } =
    useConfigStore();
  const { settings } = useSettingsStore();

  // Local state for current progress percentage
  const [progress, setProgress] = useState(0);
  /**
   * Resets all progress-related state
   *
   * Clears progress indicators and hides the progress modal
   */
  function ResetProgress() {
    setConfig({
      progressButton: false,
      processError: false,
      showProgress: false,
    });
    setProgress(0);
  }

  /**
   * Updates the progress button state
   *
   * @param progress - New state for the progress button
   */
  const setProgressButton = (progress: boolean) => {
    setConfig({ progressButton: progress });
  };

  /**
   * Updates the process error state
   *
   * @param error - Whether an error has occurred
   */
  const setProcessError = (error: boolean) => {
    setConfig({ processError: error });
  };
  /**
   * Set up event listener for progress updates from the backend
   *
   * Subscribes to 'pipeline-progress' events from the Tauri backend
   * and updates the local progress state with the received values
   */
  useEffect(() => {
    let unlisten: (() => void) | undefined = undefined;

    async function subscribe() {
      // Listen for progress events from backend
      unlisten = await listen(
        "pipeline-progress",
        (event: { payload: unknown }) => {
          if (event.payload !== undefined) {
            setProgress(event.payload as number);
          }
        }
      );
    }

    subscribe();

    // Clean up event listener on component unmount
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
                    {/* TODO: make this a nice modal with dark app background */}
                    <p>The pipeline is running. Please wait.</p>
                    <div className="w-full m-4 bg-gray-200 rounded-full h-4 border-gray-400">
                      <div
                        className="bg-osu-beaver-orange h-4 rounded-full"
                        style={{
                          width: `${progress}%`,
                          transition: "width 0.5",
                        }}
                      ></div>
                    </div>
                  </div>
                )}
                {progressButton && !processError && (
                  <div>
                    <p>The image generation pipeline has finished.</p>
                    <p>The final .hdr image has been saved to:</p>
                    <p className="text-xs mt-3">{settings.outputPath}</p>
                    {/* TODO: fix button style to match rest of app */}
                    <button
                      onClick={() => ResetProgress()}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 mt-4 border-gray-400 rounded h-fit"
                    >
                      Close
                    </button>
                  </div>
                )}
                {!progressButton && processError && (
                  <div>
                    <h2>Error</h2>
                    <p className=" text-sm pt-1">
                      There was an error with the pipeline. Please make sure all
                      the inputs are correct, and that you have entered the
                      paths for the <span className="font-mono">hdrgen</span> or{" "}
                      <span className="font-mono">dcraw_emu</span> binaries in
                      the settings.
                    </p>
                    <button
                      onClick={() => ResetProgress()}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 m-5 border-gray-400 rounded h-fit"
                    >
                      Close
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
