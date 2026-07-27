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
export function buildPipelineParams(
  data: pipelineConfig,
  settings: PipelineToolSettings,
  inputImages: string[]
) {
  const diameter = Math.round(data.lensMask.radius * 2);
  const xleft = Math.round(data.lensMask.x - data.lensMask.radius);
  const ytop = Math.round(data.lensMask.y - data.lensMask.radius);

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
