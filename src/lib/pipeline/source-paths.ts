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

import { basename } from "./stages";
import type { PipelineParams } from "./types";

/**
 * Sources live outside `/work`, which is reserved for intermediates.
 *
 * `collectOutputs` scans `/work` after every tool and files what it finds as
 * something that tool produced (`wasm-runner.ts:404`). A source staged under
 * `/work` would be collected as an output. The runner already expects sources
 * elsewhere, and `makeParentDirs` creates whatever depth they need.
 */
const SRC_DIR = "/src";
const CAL_DIR = "/cal";

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
  /** Params naming staged paths. The object handed in is left untouched. */
  params: PipelineParams;
  /** Staged path to the path its bytes must be read from, in staging order. */
  sources: Map<string, string>;
}

export function sanitizeSources(params: PipelineParams): SanitizedSources {
  const sources = new Map<string, string>();

  // 1-based, matching the index `prepareInputs` gives the converted TIFFs, so
  // the two numbering schemes read the same way in a status log.
  const inputImages = params.inputImages.map((path, index) => {
    const staged = `${SRC_DIR}/${index + 1}-${basename(path)}`;
    sources.set(staged, path);
    return staged;
  });

  const stagedParams: PipelineParams = { ...params, inputImages };

  if (params.responseFunction !== "") {
    const staged = `${SRC_DIR}/response-${basename(params.responseFunction)}`;
    sources.set(staged, params.responseFunction);
    stagedParams.responseFunction = staged;
  }

  for (const [field, slot] of CAL_SLOTS) {
    const path = params[field];
    // An empty slot means the correction does not run. Naming it would stage a
    // file that does not exist and turn every run into a calibrated one.
    if (path === "") {
      continue;
    }
    const staged = `${CAL_DIR}/${slot}-${basename(path)}`;
    sources.set(staged, path);
    stagedParams[field] = staged;
  }

  return { params: stagedParams, sources };
}
