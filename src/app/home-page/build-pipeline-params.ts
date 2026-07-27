import type { pipelineConfig } from "./(pipeline-configuration)/config-provider";

export interface PipelineToolSettings {
  dcrawEmuPath: string;
  hdrgenPath: string;
  outputPath: string;
  radiancePath: string;
}

/**
 * Builds the payload for the `pipeline` Tauri command.
 *
 * `ytop` is the distance from the top of the image to the top of the lens
 * mask, which is the origin the overlay works in. crop.rs converts it to the
 * bottom-left origin Radiance expects.
 *
 * Tauri matches command parameters by name at runtime, so a key renamed here
 * must be renamed in the `#[tauri::command]` signature in the same change.
 * Nothing catches a mismatch at compile time.
 */
/** The circumscribed square the crop stage cuts out, in image pixels. */
export interface MaskBox {
  diameter: number;
  xleft: number;
  ytop: number;
}

/**
 * Converts the mask from a centre and a radius to the box `crop` expects.
 *
 * Exported so the pre-flight check can validate the same rounded integers the
 * pipeline is handed. Rounding separately in two places would let a mask pass
 * validation at one boundary and fail in Rust at the other.
 */
export function maskBox(data: pipelineConfig): MaskBox {
  return {
    diameter: Math.round(data.lensMask.radius * 2),
    xleft: Math.round(data.lensMask.x - data.lensMask.radius),
    ytop: Math.round(data.lensMask.y - data.lensMask.radius),
  };
}

export function buildPipelineParams(
  data: pipelineConfig,
  settings: PipelineToolSettings,
  inputImages: string[]
) {
  const { diameter, xleft, ytop } = maskBox(data);

  return {
    dcrawEmuPath: settings.dcrawEmuPath,
    diameter,
    filterImages: data.outputSettings.filterIrrelevantSrcImages,
    fisheyeCorrectionCal: data.correctionFiles.fisheye ?? "",
    hdrgenPath: settings.hdrgenPath,
    horizontalAngle: data.fisheyeView.horizontalViewDegrees,
    inputImages,
    legendHeight: "",
    legendWidth: "",
    measuredVerticalIlluminance:
      data.validityCheck.measuredVerticalIlluminanceLux,
    neutralDensityCal: data.correctionFiles.neutralDensity ?? "",
    outputPath: settings.outputPath,
    photometricAdjustmentCal: data.correctionFiles.calibrationFactor ?? "",
    projection: data.fisheyeView.projection,
    radiancePath: settings.radiancePath,
    responseFunction: data.cameraResponseLocation ?? "",
    scaleLabel: "",
    scaleLevels: "",
    scaleLimit: "",
    verticalAngle: data.fisheyeView.verticalViewDegrees,
    vignettingCorrectionCal: data.correctionFiles.vignetting ?? "",
    xdim: data.outputSettings.targetRes,
    xleft,
    ydim: data.outputSettings.targetRes,
    ytop,
  };
}
