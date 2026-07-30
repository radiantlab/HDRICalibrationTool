/**
 * Settings Button Bar component
 *
 * @param saveDisabled - Boolean flag indicating whether the save button should be disabled
 * @param savePaths - Function to call when the Apply Changes button is clicked
 * @returns React component with action buttons
 */
export default function SettingsButtonBar({
  saveDisabled,
  savePaths,
}: {
  saveDisabled: boolean;
  savePaths: () => void;
}) {
  return (
    // In the layout flow, not fixed over it. Fixed positioning meant the bar
    // sat on top of whatever the settings page ended with -- the last card was
    // simply unreachable.
    <div className="w-full shrink-0 border-border bg-muted">
      <div className="mr-8 ml-8 flex justify-around border-border border-t py-4">
        {/* Button to clear changes (revert to saved settings) */}
        <button
          className="w-max rounded bg-secondary px-4 py-1 font-semibold text-secondary-foreground hover:bg-secondary/80"
          type="button"
        >
          Clear Changes
        </button>

        {/* Button to apply and save changes */}
        <button
          className={`w-max rounded border-border px-2 py-1 font-semibold ${
            saveDisabled
              ? "cursor-not-allowed bg-muted text-muted-foreground" // Disabled style
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
