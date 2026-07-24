/**
 * Settings Button Bar component
 *
 * @param saveDisabled - Boolean flag indicating whether the save button should be disabled
 * @param savePaths - Function to call when the Apply Changes button is clicked
 * @returns React component with action buttons
 */
export default function SettingsButtonBar({ saveDisabled, savePaths }: any) {
  return (
    <div className="fixed bottom-0 left-0 w-full border-gray-400 bg-gray-300">
      <div className="mr-8 ml-8 flex justify-around border-gray-400 border-t py-4">
        {/* Button to clear changes (revert to saved settings) */}
        <button
          className="w-max rounded border-gray-400 bg-gray-600 px-4 py-1 font-semibold text-gray-300 hover:bg-gray-500"
          type="button"
        >
          Clear Changes
        </button>

        {/* Button to apply and save changes */}
        <button
          className={`w-max rounded border-gray-400 px-2 py-1 font-semibold ${
            saveDisabled
              ? "cursor-not-allowed bg-gray-400 text-gray-700" // Disabled style
              : "bg-osu-beaver-orange text-white hover:bg-osu-luminance" // Enabled style
          }`}
          disabled={saveDisabled}
          onClick={savePaths}
          type="button"
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
}
