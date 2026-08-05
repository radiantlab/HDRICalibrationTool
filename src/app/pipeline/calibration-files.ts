import type { pipelineConfig } from "./(pipeline-configuration)/config-provider";

/**
 * The five calibration files a run can be given, in the order the form asks
 * for them, so the warning reads in the same order the user filled the fields.
 */
const CALIBRATION_FILES: {
  label: string;
  read: (config: pipelineConfig) => string | null;
}[] = [
  {
    label: "Camera response",
    read: (config) => config.cameraResponseLocation,
  },
  {
    label: "Fisheye correction",
    read: (config) => config.correctionFiles.fisheye,
  },
  {
    label: "Vignetting correction",
    read: (config) => config.correctionFiles.vignetting,
  },
  {
    label: "Neutral density correction",
    read: (config) => config.correctionFiles.neutralDensity,
  },
  {
    label: "Calibration factor",
    read: (config) => config.correctionFiles.calibrationFactor,
  },
];

/**
 * Names the calibration files the run was not given.
 *
 * Leaving one out is legitimate: a camera used without a neutral density
 * filter has no neutral density file to supply, and the pipeline skips the
 * corresponding stage. Leaving one out by accident is not, and the two look
 * identical from here, so the caller asks rather than refuses.
 *
 * A path of whitespace counts as unsupplied. The field accepts pasted text, so
 * it is reachable, and it would otherwise pass this check and then fail deep in
 * the pipeline where the cause is much harder to see.
 */
export function unsuppliedCalibrationFiles(config: pipelineConfig): string[] {
  return CALIBRATION_FILES.filter(({ read }) => {
    const path = read(config);
    return typeof path !== "string" || path.trim() === "";
  }).map(({ label }) => label);
}
