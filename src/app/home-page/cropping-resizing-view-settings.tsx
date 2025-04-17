import NumberInput from "./number-input";
import { useConfigStore } from "../stores/config-store";

export default function CroppingResizingViewSettings() {
  const { viewSettings, setConfig } = useConfigStore();

  const handleViewSettingsChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setConfig({
      viewSettings: {
        ...viewSettings,
        [event.currentTarget.name]: event.currentTarget.value,
      },
    });
  };

  return (
    <div>
      <h2 className="font-bold pt-5">Cropping, Resizing, and View Settings</h2>
      <div>
        <div className="flex flex-row space-x-5 pt-5">
          <NumberInput
            name="diameter"
            value={viewSettings.diameter}
            label="Fisheye View Diameter"
            placeholder="pixels"
            handleChange={handleViewSettingsChange}
          />
        </div>
        <div>
          <NumberInput
            name="xleft"
            value={viewSettings.xleft}
            label="X Left Offset (distance between left edge of the image and left edge of fisheye view)"
            placeholder="pixels"
            handleChange={handleViewSettingsChange}
          />
          <NumberInput
            name="ydown"
            value={viewSettings.ydown}
            label="Y Bottom Offset (distance between bottom edge of the image and bottom edge of fisheye view)"
            placeholder="pixels"
            handleChange={handleViewSettingsChange}
          />
        </div>
        <div className="flex flex-row space-x-5">
          <NumberInput
            name="vv"
            value={viewSettings.vv}
            label="View Vertical (vv)"
            placeholder="degrees"
            handleChange={handleViewSettingsChange}
          />
          <NumberInput
            name="vh"
            value={viewSettings.vh}
            label="View Horizontal (vh)"
            placeholder="degrees"
            handleChange={handleViewSettingsChange}
          />
        </div>
        <div>
          <NumberInput
            name="targetRes"
            value={viewSettings.targetRes}
            label="Target Width/Height (resizing)"
            placeholder="pixels"
            handleChange={handleViewSettingsChange}
          />
        </div>
      </div>
    </div>
  );
}
