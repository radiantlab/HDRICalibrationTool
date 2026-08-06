/**
 * The advisory checks the pipeline runs alongside the image stages.
 *
 * Port of `src-tauri/src/pipeline/cal_check.rs` and
 * `src-tauri/src/pipeline/validity.rs`. Both are pure, and both feed
 * `PipelineStatusKind::Warning` events that `pipeline-status-context.tsx`
 * already renders through its `warningTextFor` branch -- so leaving them out
 * would make a UI on this orchestrator go quiet on results the current app
 * reports.
 *
 * Neither check ever fails a run. A hardcoded `.cal` file may well match the
 * resolution it is handed, and a validity check that fails is information for
 * the operator, not grounds for discarding the picture.
 */

/** The most constants named in a warning before it stops being readable. */
const MAX_REPORTED_CONSTANTS = 8;

/** The smallest numeric literal treated as a candidate pixel coordinate. */
const PIXEL_SCALE_THRESHOLD = 100;

/** Runs of digits and dots, the shape a pixel coordinate takes in a .cal file. */
const NUMERIC_FRAGMENT = /[0-9.]+/g;

/**
 * Returns `null` when a `.cal` file derives its geometry from the picture, and
 * a list of numeric literals large enough to be pixel coordinates when it
 * cannot.
 *
 * A file that mentions `xres` or `yres` adapts to whatever resolution it is
 * handed. One that does not was calibrated for a fixed resolution, and the
 * Radiance tutorial (section 2.5.2) warns that cropping or resizing
 * invalidates it.
 *
 * Both geometric `.cal` files are user-supplied, derived per camera and lens
 * during the one-time setup, so this checks the file's content and never which
 * input slot it arrived in.
 */
export function resolutionDependentConstants(text: string): number[] | null {
  if (text.includes("xres") || text.includes("yres")) {
    return null;
  }

  const constants: number[] = [];
  for (const fragment of text.match(NUMERIC_FRAGMENT) ?? []) {
    const value = Number(fragment);
    // `Number("1.2.3")` is NaN, which is the same rejection Rust's
    // `parse::<f64>()` makes for a fragment with two dots.
    if (
      Number.isFinite(value) &&
      value >= PIXEL_SCALE_THRESHOLD &&
      !constants.includes(value)
    ) {
      constants.push(value);
    }
  }

  return constants.slice(0, MAX_REPORTED_CONSTANTS);
}

export function calWarning(
  label: string,
  name: string,
  width: number,
  height: number,
  constants: number[]
): string {
  const listed =
    constants.length === 0
      ? "no pixel-scale constants were found, so check it by hand"
      : `it contains the constants ${constants.join(", ")}`;

  return (
    `The ${label} calibration file ${name} does not reference xres/yres, so it cannot adapt to ` +
    `the working resolution. The image is ${width}x${height} at this step and ${listed}. If those ` +
    "are pixel coordinates calibrated for a different resolution, the correction will be " +
    "applied about the wrong centre."
  );
}

/**
 * How an HDR-derived vertical illuminance compares to a measured one.
 *
 * Thresholds are from Pierson et al. 2019 section 3.1: an error under 10
 * percent is expected, and an image with more than 25 percent should be
 * rejected as a luminance map.
 */
export type ValidityOutcome =
  | { kind: "pass"; errorPct: number }
  | { kind: "above_expected"; errorPct: number }
  | { kind: "failed"; errorPct: number };

export function evaluateValidity(
  evHdr: number,
  evMeasured: number
): ValidityOutcome | null {
  if (
    !Number.isFinite(evMeasured) ||
    evMeasured <= 0 ||
    !Number.isFinite(evHdr)
  ) {
    return null;
  }

  const errorPct = (Math.abs(evHdr - evMeasured) / evMeasured) * 100;

  if (errorPct > 25) {
    return { errorPct, kind: "failed" };
  }
  if (errorPct > 10) {
    return { errorPct, kind: "above_expected" };
  }
  return { errorPct, kind: "pass" };
}

export function validityMessage(
  outcome: ValidityOutcome,
  evHdr: number,
  evMeasured: number
): string {
  const hdr = evHdr.toFixed(1);
  const measured = evMeasured.toFixed(1);
  const error = outcome.errorPct.toFixed(1);

  switch (outcome.kind) {
    case "failed":
      return (
        `Validity check FAILED: HDR-derived vertical illuminance ${hdr} lux vs measured ` +
        `${measured} lux (${error}% error). Images with more than 25% error are ` +
        "normally rejected."
      );
    case "above_expected":
      return (
        `Validity check: HDR-derived vertical illuminance ${hdr} lux vs measured ` +
        `${measured} lux (${error}% error), above the 10% typically expected.`
      );
    default:
      return `Validity check passed (${error}% error).`;
  }
}
