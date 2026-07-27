import type { pipelineConfig } from "./(pipeline-configuration)/config-provider";
import { maskBox } from "./build-pipeline-params";
import { describeMaskOverflow } from "./lens-mask-fit";

/**
 * Names the first reason this configuration cannot be run, or null if it can.
 *
 * These are the values the pipeline cannot start with at all, as opposed to the
 * calibration files, where leaving one out is a legitimate choice the caller
 * confirms rather than refuses.
 *
 * Kept whole and pure so the order is visible in one place and each case is
 * testable. `maskSize` is the dimensions of the image the mask was drawn
 * against, or null while they are still unknown.
 */
export function describeRunBlocker(
  data: pipelineConfig,
  maskSize: [width: number, height: number] | null
): string | null {
  const { diameter } = maskBox(data);

  if (!Number.isFinite(diameter) || diameter <= 0) {
    return "Lens mask radius must be greater than 0.";
  }

  const { targetRes } = data.outputSettings;
  if (!Number.isFinite(targetRes) || (targetRes !== null && targetRes <= 0)) {
    return "Target resolution must be greater than 0.";
  }

  const { horizontalViewDegrees, verticalViewDegrees } = data.fisheyeView;
  if (
    !(
      Number.isFinite(verticalViewDegrees) &&
      Number.isFinite(horizontalViewDegrees)
    ) ||
    (verticalViewDegrees !== null && verticalViewDegrees <= 0) ||
    (horizontalViewDegrees !== null && horizontalViewDegrees <= 0)
  ) {
    return "Fisheye view angles must be greater than 0.";
  }

  // Last, because it is the only one that needs to know about the image. The
  // crop stage would catch part of this, but only after every exposure has
  // been merged, which is the expensive part of a run.
  return maskSize ? describeMaskOverflow(maskBox(data), maskSize) : null;
}
