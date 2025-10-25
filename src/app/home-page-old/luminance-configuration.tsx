/**
 * Luminance Configuration Component for the HDRI Calibration Tool.
 * 
 * This component allows users to configure settings for the falsecolor
 * luminance mapping visualization, including:
 * - Scale limits and labels
 * - Number of scale levels
 * - Legend dimensions
 * 
 * These settings control how the luminance data is visualized in the output images.
 */
import NumberInput from "./number-input";
import { useConfigStore } from "../stores/config-store";

import descriptions from "../tooltips/descriptions";

/**
 * Component for configuring luminance visualization settings
 * 
 * @returns React component with luminance settings interface
 */
export default function LuminanceConfiguration() {
  const { luminanceSettings, setConfig } = useConfigStore();

  /**
   * Updates luminance settings when input values change
   * 
   * @param event - Input change event from form fields
   */
  const handleLuminanceSettingsChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setConfig({
      luminanceSettings: {
        ...luminanceSettings,
        [event.currentTarget.name]: event.currentTarget.value,
      },
    });
  };
  
  return (
    <div>
      {/* Section title */}
      <h2 className="font-bold pt-5">Falsecolor Settings</h2>
      <div>
        {/* Scale Limit input - controls the maximum value on the luminance scale */}
        <div className="flex flex-row space-x-5 pt-5">
          <NumberInput
            name="scale_limit"
            value={luminanceSettings.scale_limit}
            label="Scale Limit"
            placeholder="pixels"
            description={descriptions.scaleLimit}
            handleChange={handleLuminanceSettingsChange}
          />
        </div>
        
        <div>
          {/* Scale Label input - controls the text label for the luminance scale */}
          <NumberInput
            name="scale_label"
            value={luminanceSettings.scale_label}
            label="Scale Label"
            placeholder="label"
            description={descriptions.scaleLabel}
            handleChange={handleLuminanceSettingsChange}
          />
          
          {/* Scale Levels input - controls number of distinct levels in the luminance scale */}
          <NumberInput
            name="scale_levels"
            value={luminanceSettings.scale_levels}
            label="Scale Levels"
            placeholder="levels"
            description={descriptions.scaleLevels}
            handleChange={handleLuminanceSettingsChange}
          />
        </div>
        
        {/* Legend Dimensions input - controls the size of the legend in the output image */}
        <div className="flex flex-row space-x-5">
          <NumberInput
            name="legend_dimensions"
            value={luminanceSettings.legend_dimensions}
            label="Legend Dimensions"
            placeholder="pixels"
            description={descriptions.legendDimensions}
            handleChange={handleLuminanceSettingsChange}
          />
        </div>
      </div>
    </div>
  );
}
