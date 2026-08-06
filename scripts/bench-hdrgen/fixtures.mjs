/**
 * What every leg measures, defined once.
 *
 * The whole benchmark rests on each environment doing identical work. A leg
 * that built its own argument vector, or reached for its own copy of the
 * bracket, would turn an input difference into what looks like an engine
 * result. So both live here and nothing else is allowed to construct them.
 */

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The same bracket the two end-to-end suites use. */
export const INPUTS = fileURLToPath(
  new URL("../../e2e-tests/test/inputs", import.meta.url)
);

export const RESPONSE = path.join(
  INPUTS,
  "response_function_files",
  "Response_function.rsp"
);

const JPEG_DIR = path.join(INPUTS, "JPEG");

export function frameFiles(count) {
  const all = readdirSync(JPEG_DIR)
    .filter((name) => name.toUpperCase().endsWith(".JPG"))
    .sort()
    .map((name) => path.join(JPEG_DIR, name));
  if (count > all.length) {
    throw new Error(`asked for ${count} frames, the bracket has ${all.length}`);
  }
  return all.slice(0, count);
}

/**
 * The name a frame is staged under, matching what the pipeline now does.
 *
 * Kept identical to the app's scheme so the argv a leg runs is the argv the
 * app would run, down to the string lengths.
 */
export function stagedName(file, index) {
  return `${index + 1}-${path.basename(file)}`;
}

/** Exactly `stages.ts:hdrgenArgs`, which is the point. */
export function hdrgenArgv({ frames, out, response }) {
  return [
    "-m",
    "1000",
    ...frames,
    "-o",
    out,
    "-r",
    response,
    "-a",
    "-e",
    "-f",
    "-g",
    "-F",
  ];
}
