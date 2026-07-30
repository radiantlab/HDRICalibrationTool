/**
 * Names the files a run produces.
 *
 * Port of `src-tauri/src/pipeline/output_naming.rs`. Kept here rather than in
 * the app layer because the naming is part of what the pipeline guarantees:
 * two implementations that name outputs differently cannot be A/B compared,
 * and the desktop cutover depends on exactly that comparison.
 */

/**
 * Longest set name allowed in a filename.
 *
 * Not a filesystem limit -- it is short enough that the stem plus a timestamp
 * plus an extension stays comfortably inside one on every platform.
 */
const MAX_SET_NAME = 64;

const UNSAFE_CHARACTER = /[^A-Za-z0-9\-_]/g;
const LEADING_OR_TRAILING_UNDERSCORE = /^_+|_+$/g;

/**
 * Reduces a user-supplied set name to something safe to put in a filename.
 *
 * Every character outside `[A-Za-z0-9-_]` becomes an underscore, which is what
 * stops `../` or a drive letter from steering the write out of the output
 * directory. The name arrives from a text field or a folder name, so this is a
 * boundary, not a formality.
 */
function sanitiseSetName(setName: string): string {
  const replaced = setName.replace(UNSAFE_CHARACTER, "_");
  // Trimmed before truncating so a leading run of separators does not eat the
  // budget, and after so truncation cannot leave a trailing underscore.
  const trimmed = replaced.replace(LEADING_OR_TRAILING_UNDERSCORE, "");
  return trimmed
    .slice(0, MAX_SET_NAME)
    .replace(LEADING_OR_TRAILING_UNDERSCORE, "");
}

/**
 * The filename stem for a run: `<set name>_<timestamp>`, or just the timestamp
 * when the name has nothing usable in it.
 */
export function outputStem(setName: string, datetime: string): string {
  const sanitised = sanitiseSetName(setName);
  return sanitised === "" ? datetime : `${sanitised}_${datetime}`;
}

/**
 * The local timestamp Rust formats as `%F_%H-%M-%S`, e.g. `2026-07-29_11-41-49`.
 *
 * Local rather than UTC, deliberately: these filenames are read by the person
 * who made the run, and a capture at 4pm should not be filed as 11pm.
 */
export function runTimestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${date}_${time}`;
}

export function completionMessage(setName: string): string {
  const trimmed = setName.trim();
  return trimmed === "" ? "Pipeline complete." : `Finished ${trimmed}.`;
}
