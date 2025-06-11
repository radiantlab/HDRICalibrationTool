/**
 * Configuration store module for the HDRI Calibration Tool.
 * 
 * This module defines a global state store using Zustand to manage the application's
 * HDRI processing configuration, including view settings, luminance settings, file paths,
 * and processing state.
 */
import { create } from 'zustand';

/**
 * Interface defining the configuration state
 * 
 * @property viewSettings - Settings related to image cropping and view parameters
 * @property luminanceSettings - Settings for luminance scale display
 */
interface ConfigState {
  /**
   * View settings for image cropping and display
   * 
   * @property diameter - The diameter for fisheye cropping
   * @property xleft - Left coordinate for cropping
   * @property ydown - Down coordinate for cropping
   * @property vv - Vertical view angle
   * @property vh - Horizontal view angle
   * @property targetRes - Target resolution
   */
  viewSettings: {
    diameter: string;
    xleft: string;
    ydown: string;
    vv: string;
    vh: string;
    targetRes: string;
  };
  
  /**
   * Settings for luminance scale visualization
   * 
   * @property scale_limit - Maximum value for luminance scale
   * @property scale_label - Label for the scale
   * @property scale_levels - Number of levels in the scale
   * @property legend_dimensions - Dimensions of the legend
   */
  luminanceSettings: {
    scale_limit: string;
    scale_label: string;
    scale_levels: string;
    legend_dimensions: string;
  };  /**
   * Flag indicating whether the progress button should be enabled
   */
  progressButton: boolean;
  
  /**
   * Flag indicating whether a process error has occurred
   */
  processError: boolean;
  
  /**
   * Flag controlling the visibility of the progress indicator
   */
  showProgress: boolean;
  
  /**
   * Path for output files
   */
  outputPath: string;
  
  /**
   * Array of paths to device/image files
   */
  devicePaths: any[];
  
  /**
   * Path to the camera response function file
   */
  responsePaths: string;
  
  /**
   * Path to the fisheye correction file
   */
  fe_correctionPaths: string;
  
  /**
   * Path to the vignetting correction file
   */
  v_correctionPaths: string;
  
  /**
   * Path to the neutral density filter correction file
   */
  nd_correctionPaths: string;
  
  /**
   * Path to the calibration factor file
   */
  cf_correctionPaths: string;

  /**
   * Flag to filter images or not
   */
  filterImages: boolean;
  
  /**
   * Function to update the configuration state
   * 
   * @param config - Partial configuration object containing properties to update
   */
  setConfig: (config: Partial<ConfigState>) => void;
}

/**
 * Zustand store hook for managing HDRI processing configuration
 * 
 * Usage example:
 * ```
 * const { viewSettings, setConfig } = useConfigStore();
 * ```
 */
export const useConfigStore = create<ConfigState>((set) => ({
  // Initial view settings with default target resolution
  viewSettings: {
    diameter: '',
    xleft: '',
    ydown: '',
    vv: '',
    vh: '',
    targetRes: '',
  },
  
  // Initial luminance settings
  luminanceSettings: {
    scale_limit: '',
    scale_label: '',
    scale_levels: '',
    legend_dimensions: '',
  },

  // Initial UI state flags
  progressButton: false,  // Progress button disabled by default
  processError: false,    // No process error by default
  showProgress: false,    // Don't show progress indicator by default
  
  // Initial empty paths
  outputPath: '',
  devicePaths: [],
  responsePaths: '',
  fe_correctionPaths: '',
  v_correctionPaths: '',
  nd_correctionPaths: '',
  cf_correctionPaths: '',

  // Flag to filter images
  filterImages: true,
  
  /**
   * Updates the configuration state while preserving existing properties
   * 
   * @param config - Partial config object containing properties to update
   */
  setConfig: (config) => set((state) => ({ ...state, ...config })),
}));