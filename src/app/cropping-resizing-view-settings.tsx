import NumberInput from "./number-input";

export default function CroppingResizingViewSettings({ handleChange }: any) {
  return (
    <div>
      <h2 className="font-bold pt-5">Cropping, Resizing, and View Settings</h2>
      <div>
        <div className="flex flex-row space-x-5 pt-5">
          {/* <NumberInput
            name="xres"
            label="Width (X resolution)"
            placeholder="pixels"
            handleChange={handleChange}
          />
          <NumberInput
            name="yres"
            label="Height (Y resolution)"
            placeholder="pixels"
            handleChange={handleChange}
          /> */}
          <NumberInput
            name="diameter"
            label="Fisheye View Diameter"
            placeholder="pixels"
            handleChange={handleChange}
          />
        </div>
        <div>
          <NumberInput
            name="xleft"
            label="X Left Offset (distance between left edge of the image and left edge of fisheye view"
            placeholder="pixels"
            handleChange={handleChange}
          />
          <NumberInput
            name="ydown"
            label="Y Bottom Offset (distance between bottom edge of the image and bottom edge of fisheye view"
            placeholder="pixels"
            handleChange={handleChange}
          />
        </div>
        <div className="flex flex-row space-x-5">
          <NumberInput
            name="vv"
            label="View Vertical (vv)"
            placeholder="degrees"
            handleChange={handleChange}
          />
          <NumberInput
            name="vh"
            label="View Horizontal (vh)"
            placeholder="degrees"
            handleChange={handleChange}
          />
        </div>
        <div>
          <NumberInput
            name="targetRes"
            label="Target Width/Height (resizing)"
            placeholder="pixels"
            defaultValue="1000"
            handleChange={handleChange}
          />
        </div>
      </div>
    </div>
  );
}
