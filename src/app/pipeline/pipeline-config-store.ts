"use client";

import { create } from "zustand";
import type { pipelineConfig } from "./(pipeline-configuration)/config-provider";

/**
 * The live configuration, shared outside the form so other pages can write to
 * it. The Runs page uses this to reapply the inputs of a previous run.
 */
export const useGlobalPipelineConfig = create<
  pipelineConfig & { set: (config: pipelineConfig) => void }
>((set) => ({
  cameraResponseLocation: null,
  correctionFiles: {
    calibrationFactor: null,
    fisheye: null,
    neutralDensity: null,
    vignetting: null,
  },
  fisheyeView: {
    horizontalViewDegrees: 180,
    projection: "vta",
    verticalViewDegrees: 180,
  },
  inputSets: [],
  lensMask: {
    radius: 0,
    x: 0,
    y: 0,
  },
  outputSettings: {
    filterIrrelevantSrcImages: true,
    targetRes: 1000,
  },

  set,
  validityCheck: {
    measuredVerticalIlluminanceLux: null,
  },
}));
