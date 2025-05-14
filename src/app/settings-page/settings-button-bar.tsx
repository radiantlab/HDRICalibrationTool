import React from "react";


export default function SettingsButtonBar({ saveDisabled, savePaths }: any) {

  return (
    <div  className="fixed bottom-0 left-0 w-full bg-gray-300 border-gray-400">
        <div className="flex justify-around py-4 border-t mr-8 ml-8 border-gray-400">          <button
            type="button"
            className="w-max bg-gray-600 hover:bg-gray-500 text-gray-300 font-semibold py-1 px-4 border-gray-400 rounded"
          >
            Clear Changes
          </button>
          <button
            type="button"
            className={`w-max font-semibold py-1 px-2 border-gray-400 rounded ${
              saveDisabled
                ? "bg-gray-400 text-gray-700 cursor-not-allowed"
                : "bg-osu-beaver-orange hover:bg-osu-luminance text-white"
            }`}
            onClick={savePaths}
            disabled={saveDisabled}
          >
            Apply Changes
          </button>
        </div>
      </div>
  );
}
