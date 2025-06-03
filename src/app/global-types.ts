/**
 * Global type definitions for the HDRI Calibration Tool.
 * This file contains type definitions and enums that are used across multiple components.
 */

/**
 * Enum representing the different types of files that can be edited in the application
 * 
 * @enum {string}
 * @property RESPONSE - Camera response function file
 * @property FISH_EYE - Fish eye correction file
 * @property VIGNETTING - Vignetting correction file
 * @property NEUTRAL_DENSITY - Neutral density filter correction file
 * @property CALIBRATION_FACTOR - Calibration factor file
 * @property NONE - No file being edited
 */
export enum EditingFileType {
  RESPONSE = "response",
  FISH_EYE = "fishEye",
  VIGNETTING = "vignetting",
  NEUTRAL_DENSITY = "neutralDensity",
  CALIBRATION_FACTOR = "calibrationFactor",
  NONE = "none"
}