import React, { useState } from "react";
import SaveConfigDialog from "./save-config-dialog";
import LoadConfigDialog from "./load-config-dialog";


export default function ButtonBar({ handleGenerateHDRImage }: any) {

  const [showSaveConfigDialog, setShowSaveConfigDialog] =
    useState<boolean>(false);
  const [showLoadConfigDialog, setShowLoadConfigDialog] =
    useState<boolean>(false);
  const [loaded, setLoaded] = useState<string>(""); // indicates the currently loaded config (used to differentiate save vs edit)

  return (
    <div  className="fixed bottom-0 left-0 w-full bg-gray-300 border-gray-400">
      <div className="flex justify-around py-4 border-t mr-8 ml-8 border-gray-400">
        <div className="flex gap-10">
          <button
            onClick={() => setShowLoadConfigDialog(!showLoadConfigDialog)}
            className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-4 border-gray-400 rounded"
          >
            Load Configuration
          </button>
          <button
            onClick={() => setShowSaveConfigDialog(!showSaveConfigDialog)}
            className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-4 border-gray-400 rounded"
          >
            Save Configuration
          </button>
        </div>
        {showSaveConfigDialog && (
          <SaveConfigDialog
            toggleDialog={() => setShowSaveConfigDialog(!showSaveConfigDialog)}
            loaded={loaded}
            setLoaded={(name: string) => setLoaded(name)}
          />
        )}
  
        {showLoadConfigDialog && (
          <LoadConfigDialog
            toggleDialog={() => setShowLoadConfigDialog(!showLoadConfigDialog)}
            loaded={loaded}
            setLoaded={(name: string) => setLoaded(name)}
          />
        )}
        <button
          onClick={handleGenerateHDRImage}
          className="w-max bg-osu-beaver-orange hover:bg-osu-luminance text-white font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Generate HDR Image
        </button>
      </div>
    </div>
  );
}
