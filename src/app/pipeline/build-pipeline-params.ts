import type { pipelineConfig } from "./(pipeline-configuration)/config-provider";

export interface PipelineToolSettings {
  outputPath: string;
}

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

/**
 * Builds the payload the WebAssembly pipeline runs on.
 *
 * `ytop` is the distance from the top of the image to the top of the lens
 * mask, which is the origin the overlay works in. `cropArgs` converts it to
 * the bottom-left origin Radiance expects.
 *
 * It carried three tool paths until the pipeline moved to WebAssembly. There
 * are no binaries to locate any more, so they are gone rather than passed and
 * ignored.
 *
 * `setName` is passed through as the user typed it or as the directory was
 * named. It becomes part of a filename, so it is sanitised by `outputStem`
 * where the file is written rather than here, where a caller could bypass it.
 */
export function buildPipelineParams(
  data: pipelineConfig,
  settings: PipelineToolSettings,
  inputImages: string[],
  setName: string
) {
  const { diameter, xleft, ytop } = maskBox(data);

  return {
    diameter,
    filterImages: data.outputSettings.filterIrrelevantSrcImages,
    fisheyeCorrectionCal: data.correctionFiles.fisheye ?? "",
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
    responseFunction: data.cameraResponseLocation ?? "",
    scaleLabel: "",
    scaleLevels: "",
    scaleLimit: "",
    setName,
    verticalAngle: data.fisheyeView.verticalViewDegrees,
    vignettingCorrectionCal: data.correctionFiles.vignetting ?? "",
    xdim: data.outputSettings.targetRes,
    xleft,
    ydim: data.outputSettings.targetRes,
    ytop,
  };
}
