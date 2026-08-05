/**
 * Names every file a run reads, so no host path reaches a tool's argv.
 *
 * Radiance tools append their own command line to the header of the picture
 * they write, and the pipeline names files by whatever string the host used to
 * find them. On the desktop that is an absolute path from the native file
 * dialog, so the finished picture carries the user's home directory, their
 * cloud-drive account, and whatever else the path spells out. The observed
 * case was a university email address in every calibrated picture (#241).
 *
 * The browser never had the problem: `vfs.ts` already hands out synthetic
 * `/session/...` and `/presets/...` paths. This gives the desktop the same
 * shape, and as a side effect makes the header identical on both hosts for the
 * same inputs, which is what makes a published picture reproducible.
 *
 * Pure, and deliberately so. It decides names; the caller stages the bytes.
 */

import { basename, WORK_DIR } from "./stages";
import type { PipelineParams } from "./types";

/**
 * The four correction slots, named after the stage rather than the form field.
 *
 * The name reaches the picture header, so it should read as the pipeline step
 * a reader can look up, not as a UI label.
 */
const CAL_SLOTS = [
  ["fisheyeCorrectionCal", "fisheye"],
  ["vignettingCorrectionCal", "vignetting"],
  ["neutralDensityCal", "neutral"],
  ["photometricAdjustmentCal", "photometric"],
] as const;

export interface SanitizedSources {
  /** Params naming work paths. The object handed in is left untouched. */
  params: PipelineParams;
  /** Work path to the path its bytes must be read from, in staging order. */
  sources: Map<string, string>;
}

export function sanitizeSources(params: PipelineParams): SanitizedSources {
  const sources = new Map<string, string>();

  // 1-based, matching the index `prepareInputs` gives the converted TIFFs, so
  // the two numbering schemes read the same way in a status log.
  const inputImages = params.inputImages.map((path, index) => {
    const work = `${WORK_DIR}/src/${index + 1}-${basename(path)}`;
    sources.set(work, path);
    return work;
  });

  const staged: PipelineParams = { ...params, inputImages };

  if (params.responseFunction !== "") {
    const work = `${WORK_DIR}/src/response-${basename(params.responseFunction)}`;
    sources.set(work, params.responseFunction);
    staged.responseFunction = work;
  }

  for (const [field, slot] of CAL_SLOTS) {
    const path = params[field];
    // An empty slot means the correction does not run. Naming it would stage a
    // file that does not exist and turn every run into a calibrated one.
    if (path === "") {
      continue;
    }
    const work = `${WORK_DIR}/cal/${slot}-${basename(path)}`;
    sources.set(work, path);
    staged[field] = work;
  }

  return { params: staged, sources };
}
