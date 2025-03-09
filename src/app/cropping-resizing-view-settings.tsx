import NumberInput from "./number-input";
import DeriveViewSettings from "./derive-view-settings";

export default function CroppingResizingViewSettings({
  viewSettings,
  handleChange,
  setViewSettings,
  devicePaths,
  dcrawEmuPath,
}: any) {
  return (
    <div>
      <h2 className="font-bold pt-5">Cropping, Resizing, and View Settings</h2>
      <div>
        <div className="">
          <DeriveViewSettings 
            viewSettings={viewSettings}
            setViewSettings={setViewSettings}
            devicePaths={devicePaths}
            dcrawEmuPath={dcrawEmuPath}
          />
        </div>
        <div className="flex flex-row space-x-5 pt-5">
          <NumberInput
            name="diameter"
            value={viewSettings.diameter}
            label="Fisheye View Diameter"
            placeholder="pixels"
            handleChange={handleChange}
          />
        </div>
        <div>
          <NumberInput
            name="xleft"
            value={viewSettings.xleft}
            label="X Left Offset (distance between left edge of the image and left edge of fisheye view)"
            placeholder="pixels"
            handleChange={handleChange}
          />
          <NumberInput
            name="ydown"
            value={viewSettings.ydown}
            label="Y Bottom Offset (distance between bottom edge of the image and bottom edge of fisheye view)"
            placeholder="pixels"
            handleChange={handleChange}
          />
        </div>
        <div className="flex flex-row space-x-5">
          <NumberInput
            name="vv"
            value={viewSettings.vv}
            label="View Vertical (vv)"
            placeholder="degrees"
            handleChange={handleChange}
          />
          <NumberInput
            name="vh"
            value={viewSettings.vh}
            label="View Horizontal (vh)"
            placeholder="degrees"
            handleChange={handleChange}
          />
        </div>
        <div>
          <NumberInput
            name="targetRes"
            value={viewSettings.targetRes}
            label="Target Width/Height (resizing)"
            placeholder="pixels"
            handleChange={handleChange}
          />
        </div>
      </div>
    </div>
  );
}
