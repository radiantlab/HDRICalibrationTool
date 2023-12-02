import NumberInput from "./number-input";

export default function CroppingResizingViewSettings() {
  return (
    <div>
      <h2>Cropping, Resizing, and View Settings</h2>
      <div>
        <div>
          <NumberInput label="Width (X resolution)" placeholder="pixels" />
          <NumberInput label="Height (Y resolution)" placeholder="pixels" />
          <NumberInput label="Fisheye View Diameter" placeholder="pixels" />
        </div>
        <div>
          <NumberInput
            label="X Left Offset (distance between left edge of the image and left edge of fisheye view"
            placeholder="pixels"
          />
          <NumberInput
            label="Y Bottom Offset (distance between bottom edge of the image and bottom edge of fisheye view"
            placeholder="pixels"
          />
        </div>
        <div>
          <NumberInput label="View Vertical (vv)" placeholder="degrees" />
          <NumberInput label="View Horizontal (vh)" placeholder="degrees" />
        </div>
        <div>
          <NumberInput
            label="Target Width/Height (resizing, pixels)"
            placeholder="pixels"
          />
        </div>
      </div>
    </div>
  );
}
