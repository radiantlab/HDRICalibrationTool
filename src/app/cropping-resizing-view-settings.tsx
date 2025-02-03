import NumberInput from "./home-page/number-input";

export default function CroppingResizingViewSettings({
  viewSettings,
  handleChange,
}: any) {
  return (
    <div>
      <h2 className="font-bold pt-5">Cropping, Resizing, and View Settings</h2>
      <div>
        <div className="flex flex-row space-x-5 pt-5">
          {/* <NumberInput
            name="xres"
            value={viewSettings.xres}
            label="Width (X resolution)"
            placeholder="pixels"
            handleChange={handleChange}
          />
          <NumberInput
            name="yres"
            value={viewSettings.yres}
            label="Height (Y resolution)"
            placeholder="pixels"
            handleChange={handleChange}
          /> */}
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
