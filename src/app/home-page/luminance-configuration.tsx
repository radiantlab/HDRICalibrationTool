import NumberInput from "./number-input";
import { useConfigStore } from "../stores/config-store";

export default function LuminanceConfiguration() {
  const { luminanceSettings, setConfig } = useConfigStore();

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
      <h2 className="font-bold pt-5">Settings for Falsecolor Luminance Map (Optional)</h2>
      <div>
        <div className="flex flex-row space-x-5 pt-5">
          <NumberInput
            name="scale_limit"
            value={luminanceSettings.scale_limit}
            label="Scale Limit"
            placeholder="pixels"
            handleChange={handleLuminanceSettingsChange}
          />
        </div>
        <div>
          <NumberInput
            name="scale_label"
            value={luminanceSettings.scale_label}
            label="Scale Label"
            placeholder="label"
            handleChange={handleLuminanceSettingsChange}
          />
          <NumberInput
            name="scale_levels"
            value={luminanceSettings.scale_levels}
            label="Scale Levels"
            placeholder="levels"
            handleChange={handleLuminanceSettingsChange}
          />
        </div>
        <div className="flex flex-row space-x-5">
          <NumberInput
            name="legend_dimensions"
            value={luminanceSettings.legend_dimensions}
            label="Legend Dimensions"
            placeholder="pixels"
            handleChange={handleLuminanceSettingsChange}
          />
        </div>
      </div>
    </div>
  );
}
